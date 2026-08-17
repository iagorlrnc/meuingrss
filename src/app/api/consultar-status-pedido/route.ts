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
 * Consulta e Reconciliação em Tempo Real de Status de Pedido / Ingressos
 *
 * Utilizado pelo frontend para polling após retorno do checkout e auto-reconciliação
 * ao abrir a página 'Meus Ingressos'.
 *
 * Se houver qualquer pedido pendente com pagamento aprovado no gateway, emite os ingressos
 * instantaneamente, garantindo entrega do produto mesmo com falha/atraso no webhook.
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

    // 1.1 Se não encontrou por ID, busca por external_reference
    if (!pedido && pedidoId) {
      const { data: p } = await supabase
        .from('pedidos')
        .select('*')
        .eq('external_reference', pedidoId)
        .maybeSingle();

      pedido = p;
    }

    // 1.2 Se não encontrou por pedido_id, tenta buscar pelo comprador/evento/lote mais recente
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

    // 1.3 Se ainda não encontrou pedido específico, busca o pedido pendente mais recente do usuário autenticado (últimas 24h)
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

    // Validação IDOR: O usuário só pode consultar pedidos pertencentes a ele (ou se for admin)
    if (pedido && pedido.comprador_id !== user.id) {
      const { data: perfil } = await supabaseServidor.from('profiles').select('role').eq('id', user.id).single();
      if (!perfil || perfil.role !== 'admin') {
        logger.security('IDOR prevenido ao consultar status do pedido', { caller: user.id, target: pedido.comprador_id });
        return NextResponse.json({ erro: 'Acesso não autorizado aos dados deste pedido.' }, { status: 403 });
      }
    }

    // 2. Se o pedido já está APROVADO no banco, retorna imediatamente
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

    // 3. RECONCILIAÇÃO ATIVA EM TEMPO REAL COM O MERCADO PAGO
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

        // 3.3 Busca nos últimos 20 pagamentos aprovados da conta Mercado Pago cruzando com o usuário
        if (!pagamentoAprovado) {
          const searchRes = await paymentClient.search({
            options: {
              sort: 'date_created',
              criteria: 'desc',
              limit: 20,
            },
          });

          const pags = (searchRes.results || []) as Record<string, unknown>[];
          for (const p of pags) {
            if (p.status !== 'approved') continue;

            const extRef = String(p.external_reference || '');
            const meta = (p.metadata || {}) as Record<string, unknown>;

            // Verifica se o pagamento pertence a este usuário
            const compId = meta.comprador_id || (extRef.includes(user.id) ? user.id : null);
            const evtId = pedido?.evento_id || meta.evento_id || (eventoIdParam && extRef.includes(eventoIdParam) ? eventoIdParam : null);
            const ltId = pedido?.lote_id || meta.lote_id || (loteIdParam && extRef.includes(loteIdParam) ? loteIdParam : null);

            if (compId === user.id && (evtId || ltId)) {
              // Verifica se este pagamento já não foi creditado anteriormente
              const { data: jaCreditado } = await supabase
                .from('pagamentos')
                .select('id')
                .eq('gateway_transaction_id', String(p.id))
                .maybeSingle();

              if (!jaCreditado) {
                pagamentoAprovado = p;
                if (!pedido && evtId && ltId) {
                  // Cria o pedido na memória para processamento
                  pedido = {
                    id: crypto.randomUUID(),
                    comprador_id: user.id,
                    evento_id: evtId,
                    lote_id: ltId,
                    quantidade: parseInt(String(meta.quantidade || '1'), 10),
                    valor_unitario: Number(p.transaction_amount || 0) / parseInt(String(meta.quantidade || '1'), 10),
                    valor_total: Number(p.transaction_amount || 0),
                    status: 'pendente',
                  };
                }
                break;
              }
            }
          }
        }

        // Se encontramos pagamento aprovado no gateway, emite os ingressos imediatamente!
        if (pagamentoAprovado && pedido) {
          const paymentIdStr = String(pagamentoAprovado.id);
          const metodoPagamento = String(pagamentoAprovado.payment_method_id || 'mercadopago');
          const quantidade = pedido.quantidade || 1;
          const valorUnitario = pedido.valor_unitario !== undefined ? Number(pedido.valor_unitario) : (Number(pagamentoAprovado.transaction_amount || 0) / quantidade);

          logger.info('Auto-reconciliação ativada: Pagamento aprovado detectado no gateway Mercado Pago', {
            pedidoId: pedido.id,
            paymentId: paymentIdStr,
            userId: user.id,
          });

          // Gera hashes seguras para os ingressos
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

          // 2. Fallback JS Atômico
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

    // 4. Se já existem ingressos válidos no banco para este usuário e evento
    const targetEventoId = pedido?.evento_id || eventoIdParam;
    const targetLoteId = pedido?.lote_id || loteIdParam;
    if (user.id && targetEventoId && targetLoteId) {
      const { data: ingressosExistentes } = await supabase
        .from('ingressos')
        .select('id, status, data_compra')
        .eq('comprador_id', user.id)
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

    // 5. Status Padrão
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
