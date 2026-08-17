import { NextRequest, NextResponse } from 'next/server';
import { paymentClient, ehMercadoPagoConfigurado } from '@/lib/mercadopago';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { criarClienteServidor } from '@/lib/supabase/servidor';
import { logger } from '@/lib/logger';
import { verificarRateLimit } from '@/lib/rateLimit';
import { gerarHashIngresso } from '@/lib/gerarQrCode';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Consulta o status real de um pedido de compra de ingresso.
 *
 * Utilizado pelo frontend para polling após retorno do Mercado Pago.
 * Possui reconciliação ativa sob demanda: se o webhook atrasar, o próprio endpoint
 * verifica a API oficial do Mercado Pago e libera o ingresso de forma segura.
 */
export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1';

  // Rate limit: máx 60 req/min por IP (polling a cada 2s = ~30 req/min)
  const rateLimit = verificarRateLimit(`status_pedido_${ip}`, { janelaMs: 60000, maxRequisicoes: 60 });
  if (!rateLimit.permitido) {
    return NextResponse.json(
      { erro: 'Muitas consultas. Aguarde um momento.' },
      { status: 429 }
    );
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const pedidoId = searchParams.get('pedido_id');
    const compradorIdParam = searchParams.get('comprador_id');
    const eventoIdParam = searchParams.get('evento_id');
    const loteIdParam = searchParams.get('lote_id');

    // 0. Autenticação e Proteção IDOR
    const supabaseServidor = await criarClienteServidor();
    const { data: { user } } = await supabaseServidor.auth.getUser();

    if (!user) {
      return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 });
    }

    const supabase = criarClienteAdmin();
    let pedido = null;

    // 1. Busca por pedido_id (UUID direto)
    if (pedidoId && UUID_REGEX.test(pedidoId)) {
      const { data: p } = await supabase
        .from('pedidos')
        .select('*')
        .eq('id', pedidoId)
        .maybeSingle();

      pedido = p;
    }

    // Se não encontrou por pedido_id, tenta buscar pelo comprador/evento/lote mais recente
    if (!pedido && compradorIdParam && eventoIdParam && loteIdParam) {
      const { data: p } = await supabase
        .from('pedidos')
        .select('*')
        .eq('comprador_id', compradorIdParam)
        .eq('evento_id', eventoIdParam)
        .eq('lote_id', loteIdParam)
        .order('criado_em', { ascending: false })
        .limit(1)
        .maybeSingle();

      pedido = p;
    }

    // Validação IDOR: O usuário só pode consultar pedidos pertencentes a ele (ou se for admin)
    if (pedido && pedido.comprador_id !== user.id) {
      const { data: perfil } = await supabaseServidor.from('profiles').select('role').eq('id', user.id).single();
      if (!perfil || perfil.role !== 'admin') {
        logger.security('IDOR prevenido ao consultar status do pedido', { caller: user.id, target: pedido.comprador_id });
        return NextResponse.json({ erro: 'Acesso não autorizado aos dados deste pedido.' }, { status: 403 });
      }
    }

    const targetCompradorId = pedido?.comprador_id || compradorIdParam || user.id;
    const targetEventoId = pedido?.evento_id || eventoIdParam;
    const targetLoteId = pedido?.lote_id || loteIdParam;

    // 2. Se o pedido já está APROVADO no banco, busca os ingressos gerados
    if (pedido && pedido.status === 'aprovado') {
      const { data: ingressos } = await supabase
        .from('ingressos')
        .select('id, status, data_compra')
        .eq('comprador_id', pedido.comprador_id)
        .eq('evento_id', pedido.evento_id)
        .eq('lote_id', pedido.lote_id)
        .in('status', ['valido', 'utilizado'])
        .order('data_compra', { ascending: false })
        .limit(pedido.quantidade || 10);

      return NextResponse.json({
        status_pedido: 'aprovado',
        mensagem: 'Pagamento confirmado! Seus ingressos foram liberados.',
        quantidade_ingressos: ingressos?.length || pedido.quantidade,
        pedido_id: pedido.id,
      });
    }

    // 3. Verifica se já existem ingressos gerados na tabela de ingressos (caso de liberação via webhook assíncrono)
    if (targetCompradorId && targetEventoId && targetLoteId) {
      const { data: ingressosExistentes } = await supabase
        .from('ingressos')
        .select('id, status, data_compra')
        .eq('comprador_id', targetCompradorId)
        .eq('evento_id', targetEventoId)
        .eq('lote_id', targetLoteId)
        .in('status', ['valido', 'utilizado'])
        .order('data_compra', { ascending: false })
        .limit(10);

      if (ingressosExistentes && ingressosExistentes.length > 0) {
        return NextResponse.json({
          status_pedido: 'aprovado',
          mensagem: 'Pagamento confirmado! Seus ingressos foram liberados.',
          quantidade_ingressos: ingressosExistentes.length,
          pedido_id: pedido?.id,
        });
      }
    }

    // 4. Se o pedido foi estornado ou cancelado
    if (pedido && (pedido.status === 'estornado' || pedido.status === 'recusado')) {
      return NextResponse.json({
        status_pedido: 'cancelado',
        mensagem: 'O pagamento foi cancelado ou não aprovado.',
        pedido_id: pedido.id,
      });
    }

    // 5. RECONCILIAÇÃO ATIVA SOB DEMANDA (Rede de Segurança em Tempo Real)
    // Se o pedido ainda está pendente, consulta a API do Mercado Pago pelo external_reference (pedido.id)
    if (pedido && pedido.status === 'pendente' && ehMercadoPagoConfigurado()) {
      try {
        const searchRes = await paymentClient.search({
          options: {
            external_reference: pedido.id,
            sort: 'date_created',
            criteria: 'desc',
            limit: 5,
          },
        });

        const pagamentosEncontrados = searchRes.results || [];
        const pagamentoAprovado = pagamentosEncontrados.find((p) => p.status === 'approved');

        if (pagamentoAprovado) {
          logger.info('Reconciliação ativa durante polling: Pagamento aprovado detectado no gateway', {
            pedidoId: pedido.id,
            paymentId: pagamentoAprovado.id,
          });

          // Gera hashes para os ingressos
          const qrHashes: string[] = [];
          for (let i = 0; i < pedido.quantidade; i++) {
            qrHashes.push(gerarHashIngresso(`${pedido.evento_id}-${pagamentoAprovado.id}-${i}-${Date.now()}`, pedido.evento_id));
          }

          // 5.1 Tenta executar RPC
          const { data: resRpc, error: errRpc } = await supabase.rpc('processar_pagamento_aprovado', {
            p_pedido_id: pedido.id,
            p_gateway_payment_id: String(pagamentoAprovado.id),
            p_metodo_pagamento: pagamentoAprovado.payment_method_id || 'mercadopago',
            p_qr_hashes: qrHashes,
          });

          if (!errRpc && resRpc?.sucesso) {
            return NextResponse.json({
              status_pedido: 'aprovado',
              mensagem: 'Pagamento confirmado e ingressos liberados com sucesso!',
              quantidade_ingressos: pedido.quantidade,
              pedido_id: pedido.id,
            });
          }

          // 5.2 Fallback JS caso RPC não execute
          await supabase
            .from('pedidos')
            .update({
              status: 'aprovado',
              gateway_payment_id: String(pagamentoAprovado.id),
              metodo_pagamento: pagamentoAprovado.payment_method_id || 'mercadopago',
              pago_em: new Date().toISOString(),
            })
            .eq('id', pedido.id);

          for (let i = 0; i < pedido.quantidade; i++) {
            const { data: ing } = await supabase
              .from('ingressos')
              .insert({
                evento_id: pedido.evento_id,
                lote_id: pedido.lote_id,
                comprador_id: pedido.comprador_id,
                qr_code_hash: qrHashes[i],
                status: 'valido',
                data_compra: new Date().toISOString(),
              })
              .select('id')
              .single();

            if (ing) {
              await supabase.from('pagamentos').insert({
                ingresso_id: ing.id,
                valor: pedido.valor_unitario,
                status: 'aprovado',
                gateway_transaction_id: String(pagamentoAprovado.id),
                metodo_pagamento: pagamentoAprovado.payment_method_id || 'mercadopago',
              });
            }
          }

          return NextResponse.json({
            status_pedido: 'aprovado',
            mensagem: 'Pagamento confirmado e ingressos liberados com sucesso!',
            quantidade_ingressos: pedido.quantidade,
            pedido_id: pedido.id,
          });
        }
      } catch (mpErr) {
        logger.warn('Erro ao consultar Mercado Pago durante polling de status', { erro: mpErr, pedidoId: pedido.id });
      }
    }

    // 6. Status Padrão: Ainda aguardando confirmação
    return NextResponse.json({
      status_pedido: 'aguardando',
      mensagem: 'Aguardando confirmação do pagamento pelo gateway...',
      pedido_id: pedido?.id,
    });
  } catch (error) {
    logger.error('Erro ao consultar status do pedido', error);
    return NextResponse.json(
      { erro: 'Erro interno ao consultar status do pedido' },
      { status: 500 }
    );
  }
}
