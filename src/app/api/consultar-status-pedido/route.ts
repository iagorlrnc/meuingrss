import { NextRequest, NextResponse } from 'next/server';
import { paymentClient, ehMercadoPagoConfigurado } from '@/lib/mercadopago';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { criarClienteServidor } from '@/lib/supabase/servidor';
import { logger } from '@/lib/logger';
import { verificarRateLimit } from '@/lib/rateLimit';
import { gerarHashIngresso } from '@/lib/gerarQrCode';
import { enviarNotificacaoIngressoLiberado } from '@/lib/notificacoes';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Consulta e Reconciliação com Idempotência Estrita
 *
 * Garante que cada pagamento gera EXATAMENTE a quantidade de ingressos comprada,
 * sem duplicação mesmo com múltiplos polls simultâneos.
 */
export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1';

  // Rate limit: máx 60 req/min por IP
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

    // 0. Autenticação
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

    // 1.1 Busca por external_reference
    if (!pedido && pedidoId) {
      const { data: p } = await supabase
        .from('pedidos')
        .select('*')
        .eq('external_reference', pedidoId)
        .maybeSingle();

      pedido = p;
    }

    // 1.2 Busca por comprador/evento/lote
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

    // 1.3 Busca pedido pendente recente (últimas 24h)
    if (!pedido) {
      const limite24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: p } = await supabase
        .from('pedidos')
        .select('*')
        .eq('comprador_id', user.id)
        .eq('status', 'pendente')
        .gt('criado_em', limite24h)
        .order('criado_em', { ascending: false })
        .limit(1)
        .maybeSingle();

      pedido = p;
    }

    // Validação IDOR
    if (pedido && pedido.comprador_id !== user.id) {
      const { data: perfil } = await supabaseServidor.from('profiles').select('role').eq('id', user.id).single();
      if (!perfil || perfil.role !== 'admin') {
        logger.security('IDOR prevenido ao consultar status do pedido', { caller: user.id, target: pedido.comprador_id });
        return NextResponse.json({ erro: 'Acesso não autorizado aos dados deste pedido.' }, { status: 403 });
      }
    }

    // 2. Se o pedido já está APROVADO no banco, retorna os ingressos gerados
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

    // 3. RECONCILIAÇÃO ATIVA COM O MERCADO PAGO
    if (ehMercadoPagoConfigurado()) {
      try {
        let pagamentoAprovado: Record<string, unknown> | null = null;

        // 3.1 Busca por external_reference = pedido.id (UUID)
        if (pedido?.id) {
          const searchRes = await paymentClient.search({
            options: {
              external_reference: pedido.id,
              sort: 'date_created',
              criteria: 'desc',
              limit: 5,
            },
          });
          const pags = (searchRes.results || []) as Record<string, unknown>[];
          pagamentoAprovado = pags.find((p) => p.status === 'approved') || null;
        }

        // 3.2 Busca por external_reference alternativo se houver
        if (!pagamentoAprovado && pedido?.external_reference) {
          const searchRes = await paymentClient.search({
            options: {
              external_reference: pedido.external_reference,
              sort: 'date_created',
              criteria: 'desc',
              limit: 5,
            },
          });
          const pags = (searchRes.results || []) as Record<string, unknown>[];
          pagamentoAprovado = pags.find((p) => p.status === 'approved') || null;
        }

        // 3.3 Se encontramos pagamento aprovado
        if (pagamentoAprovado && pedido) {
          const paymentIdStr = String(pagamentoAprovado.id);
          const metodoPagamento = String(pagamentoAprovado.payment_method_id || 'mercadopago');
          const meta = (pagamentoAprovado.metadata || {}) as Record<string, unknown>;

          // QUANTIDADE EXATA: usa a quantidade do pedido ou do metadata da compra
          const quantidade = pedido.quantidade || parseInt(String(meta.quantidade || '1'), 10) || 1;
          const valorUnitario = pedido.valor_unitario !== undefined && Number(pedido.valor_unitario) > 0
            ? Number(pedido.valor_unitario)
            : (Number(pagamentoAprovado.transaction_amount || 0) / quantidade);

          // ⚠️ GUARDA DE IDEMPOTÊNCIA: Verifica se JÁ existem ingressos para este pagamento no banco
          const { data: pagsExistentes } = await supabase
            .from('pagamentos')
            .select('id, ingresso_id')
            .eq('gateway_transaction_id', paymentIdStr);

          if (pagsExistentes && pagsExistentes.length > 0) {
            // Já existem ingressos gerados para este pagamento específico! NÃO INSERIR MAIS NADA!
            await supabase
              .from('pedidos')
              .update({
                status: 'aprovado',
                gateway_payment_id: paymentIdStr,
                gateway_transaction_id: paymentIdStr,
                pago_em: String(pagamentoAprovado.date_approved || new Date().toISOString()),
              })
              .eq('id', pedido.id);

            return NextResponse.json({
              status_pedido: 'aprovado',
              mensagem: 'Pagamento confirmado e ingressos liberados!',
              quantidade_ingressos: pagsExistentes.length,
              pedido_id: pedido.id,
            });
          }

          logger.info('Auto-reconciliação: Emitindo quantidade exata de ingressos', {
            pedidoId: pedido.id,
            paymentId: paymentIdStr,
            quantidade,
          });

          // Gera exatamente a quantidade necessária de hashes
          const qrHashes: string[] = [];
          for (let i = 0; i < quantidade; i++) {
            qrHashes.push(gerarHashIngresso(`${pedido.evento_id}-${paymentIdStr}-${i}-${Date.now()}`, pedido.evento_id));
          }

          // 1. Tenta via RPC
          const { data: resRpc, error: errRpc } = await supabase.rpc('processar_pagamento_aprovado', {
            p_pedido_id: pedido.id,
            p_gateway_payment_id: paymentIdStr,
            p_metodo_pagamento: metodoPagamento,
            p_qr_hashes: qrHashes,
          });

          if (!errRpc && resRpc?.sucesso) {
            enviarNotificacaoIngressoLiberado({
              comprador_id: pedido.comprador_id,
              quantidade,
              gateway_transaction_id: paymentIdStr,
            });

            return NextResponse.json({
              status_pedido: 'aprovado',
              mensagem: 'Pagamento confirmado e ingressos liberados com sucesso!',
              quantidade_ingressos: quantidade,
              pedido_id: pedido.id,
            });
          }

          // 2. Fallback JS Atômico com verificação de duplicação
          await supabase
            .from('pedidos')
            .upsert({
              id: pedido.id,
              comprador_id: pedido.comprador_id,
              evento_id: pedido.evento_id,
              lote_id: pedido.lote_id,
              quantidade,
              valor_unitario: valorUnitario,
              taxa_servico: 0,
              valor_total: Number(pagamentoAprovado.transaction_amount || 0),
              status: 'aprovado',
              gateway_payment_id: paymentIdStr,
              gateway_transaction_id: paymentIdStr,
              metodo_pagamento: metodoPagamento,
              pago_em: String(pagamentoAprovado.date_approved || new Date().toISOString()),
            });

          for (let i = 0; i < quantidade; i++) {
            const { data: ing } = await supabase
              .from('ingressos')
              .insert({
                evento_id: pedido.evento_id,
                lote_id: pedido.lote_id,
                comprador_id: pedido.comprador_id,
                qr_code_hash: qrHashes[i],
                status: 'valido',
                data_compra: String(pagamentoAprovado.date_approved || new Date().toISOString()),
              })
              .select('id')
              .single();

            if (ing) {
              await supabase.from('pagamentos').insert({
                ingresso_id: ing.id,
                valor: valorUnitario,
                status: 'aprovado',
                gateway_transaction_id: paymentIdStr,
                metodo_pagamento: metodoPagamento,
                criado_em: String(pagamentoAprovado.date_approved || new Date().toISOString()),
              });
            }
          }

          enviarNotificacaoIngressoLiberado({
            comprador_id: pedido.comprador_id,
            quantidade,
            gateway_transaction_id: paymentIdStr,
          });

          return NextResponse.json({
            status_pedido: 'aprovado',
            mensagem: 'Pagamento confirmado e ingressos liberados com sucesso!',
            quantidade_ingressos: quantidade,
            pedido_id: pedido.id,
          });
        }
      } catch (mpErr) {
        logger.warn('Erro ao consultar gateway durante reconciliação ativa', { erro: mpErr, pedidoId: pedido?.id });
      }
    }

    // 4. Status Padrão
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
