import { NextRequest, NextResponse } from 'next/server';
import { paymentClient, ehMercadoPagoConfigurado } from '@/lib/mercadopago';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { gerarHashIngresso } from '@/lib/gerarQrCode';
import { enviarNotificacaoIngressoLiberado } from '@/lib/notificacoes';
import { TEMPO_EXPIRACAO_PIX_MINUTOS } from '@/lib/constantes';

/**
 * Cron Job de Reconciliação Automática de Pedidos
 *
 * Busca pedidos pendentes há mais de 2 minutos e verifica o status real
 * na API oficial do Mercado Pago. Caso o pagamento tenha sido aprovado
 * mas o webhook não tenha sido entregue, emite os ingressos automaticamente.
 *
 * Protegido por CRON_SECRET no cabeçalho Authorization.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    logger.error('CRON_SECRET não configurado no servidor', null);
    return NextResponse.json({ erro: 'Configuração de cron ausente' }, { status: 500 });
  }

  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    logger.security('Tentativa não autorizada de executar cron de reconciliação de pedidos', {
      ip: request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1',
    });
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 });
  }

  if (!ehMercadoPagoConfigurado()) {
    return NextResponse.json({ erro: 'Gateway Mercado Pago não configurado' }, { status: 500 });
  }

  const supabase = criarClienteAdmin();
  const relatorio = {
    verificados: 0,
    recuperados: 0,
    inalterados: 0,
    cancelados: 0,
    erros: 0,
    detalhes: [] as Record<string, unknown>[],
  };

  try {
    // Busca pedidos pendentes criados há mais de 2 minutos e com menos de 24 horas
    const limiteMinimo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const limiteMaximo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: pedidosPendentes, error: errPedidos } = await supabase
      .from('pedidos')
      .select('*')
      .eq('status', 'pendente')
      .lt('criado_em', limiteMinimo)
      .gt('criado_em', limiteMaximo)
      .order('criado_em', { ascending: false })
      .limit(50);

    if (errPedidos) {
      logger.error('Erro ao buscar pedidos pendentes para reconciliação', errPedidos);
      return NextResponse.json({ erro: 'Erro ao consultar banco de dados' }, { status: 500 });
    }

    if (!pedidosPendentes || pedidosPendentes.length === 0) {
      return NextResponse.json({
        sucesso: true,
        mensagem: 'Nenhum pedido pendente necessitando de reconciliação no momento.',
        relatorio,
      });
    }

    for (const pedido of pedidosPendentes) {
      relatorio.verificados++;
      try {
        let pagamentos: Record<string, any>[] = [];

        // 1. Tenta consulta direta por gateway_payment_id se disponível
        if (pedido.gateway_payment_id) {
          try {
            const pDirect = await paymentClient.get({ id: String(pedido.gateway_payment_id) });
            if (pDirect) pagamentos = [pDirect as unknown as Record<string, any>];
          } catch {
            // Segue para busca por external_reference
          }
        }

        // 2. Se não encontrou, busca por external_reference (ID do pedido)
        if (pagamentos.length === 0) {
          const searchRes = await paymentClient.search({
            options: {
              external_reference: pedido.id,
              sort: 'date_created',
              criteria: 'desc',
              limit: 5,
            },
          });
          pagamentos = (searchRes.results || []) as Record<string, any>[];
        }

        if (pagamentos.length === 0) {
          // Se o pedido já expirou há mais de 30 minutos sem nenhum pagamento gerado, marca como recusado
          const expirou = new Date(pedido.criado_em).getTime() < Date.now() - TEMPO_EXPIRACAO_PIX_MINUTOS * 60 * 1000;
          if (expirou) {
            await supabase.from('pedidos').update({ status: 'recusado' }).eq('id', pedido.id);
            relatorio.cancelados++;
            relatorio.detalhes.push({ pedido_id: pedido.id, acao: 'expirado_sem_pagamento' });
          } else {
            relatorio.inalterados++;
          }
          continue;
        }

        const pagamentoAprovado = pagamentos.find((p) => p.status === 'approved');
        const pagamentoCancelado = pagamentos.find((p) => ['cancelled', 'rejected', 'refunded', 'charged_back'].includes(p.status || ''));

        if (pagamentoAprovado) {
          const gatewayPaymentId = String(pagamentoAprovado.id);
          const metodoPagamento = pagamentoAprovado.payment_method_id || 'mercadopago';

          const qrHashes: string[] = [];
          for (let i = 0; i < pedido.quantidade; i++) {
            qrHashes.push(gerarHashIngresso(`${pedido.evento_id}-${gatewayPaymentId}-${i}`, pedido.evento_id));
          }

          // 1. Tenta via RPC
          const { data: resRpc, error: errRpc } = await supabase.rpc('processar_pagamento_aprovado', {
            p_pedido_id: pedido.id,
            p_gateway_payment_id: gatewayPaymentId,
            p_metodo_pagamento: metodoPagamento,
            p_qr_hashes: qrHashes,
          });

          if (!errRpc && resRpc?.sucesso) {
            relatorio.recuperados++;
            relatorio.detalhes.push({ pedido_id: pedido.id, gateway_payment_id: gatewayPaymentId, status: 'recuperado_via_rpc' });

            enviarNotificacaoIngressoLiberado({
              comprador_id: pedido.comprador_id,
              quantidade: pedido.quantidade,
              gateway_transaction_id: gatewayPaymentId,
            });
            continue;
          }

          // 2. Fallback JS com anti-duplicação
          await supabase.from('pedidos').update({
            status: 'aprovado',
            gateway_payment_id: gatewayPaymentId,
            metodo_pagamento: metodoPagamento,
            pago_em: new Date().toISOString(),
          }).eq('id', pedido.id);

          for (let i = 0; i < pedido.quantidade; i++) {
            const hash = qrHashes[i];

            const { data: ingExistente } = await supabase
              .from('ingressos')
              .select('id')
              .eq('qr_code_hash', hash)
              .maybeSingle();

            let ingressoId = ingExistente?.id;

            if (!ingressoId) {
              const { data: ing } = await supabase
                .from('ingressos')
                .insert({
                  evento_id: pedido.evento_id,
                  lote_id: pedido.lote_id,
                  comprador_id: pedido.comprador_id,
                  qr_code_hash: hash,
                  status: 'valido',
                  data_compra: new Date().toISOString(),
                })
                .select('id')
                .single();

              if (ing) {
                ingressoId = ing.id;
              }
            }

            if (ingressoId) {
              const { data: pagExist } = await supabase
                .from('pagamentos')
                .select('id')
                .eq('ingresso_id', ingressoId)
                .eq('gateway_transaction_id', gatewayPaymentId)
                .maybeSingle();

              if (!pagExist) {
                await supabase.from('pagamentos').insert({
                  ingresso_id: ingressoId,
                  valor: pedido.valor_unitario,
                  status: 'aprovado',
                  gateway_transaction_id: gatewayPaymentId,
                  metodo_pagamento: metodoPagamento,
                });
              }
            }
          }

          relatorio.recuperados++;
          relatorio.detalhes.push({ pedido_id: pedido.id, gateway_payment_id: gatewayPaymentId, status: 'recuperado_via_fallback' });

          enviarNotificacaoIngressoLiberado({
            comprador_id: pedido.comprador_id,
            quantidade: pedido.quantidade,
            gateway_transaction_id: gatewayPaymentId,
          });
        } else if (pagamentoCancelado) {
          await supabase.from('pedidos').update({ status: 'recusado' }).eq('id', pedido.id);
          relatorio.cancelados++;
          relatorio.detalhes.push({ pedido_id: pedido.id, acao: 'marcado_como_recusado' });
        } else {
          relatorio.inalterados++;
        }
      } catch (errPedido) {
        relatorio.erros++;
        relatorio.detalhes.push({ pedido_id: pedido.id, erro: String(errPedido) });
      }
    }

    logger.info('Cron de reconciliação de pedidos finalizado', relatorio);

    return NextResponse.json({
      sucesso: true,
      executado_em: new Date().toISOString(),
      relatorio,
    });
  } catch (error) {
    logger.error('Erro crítico no cron de reconciliação de pedidos', error);
    return NextResponse.json({ erro: 'Erro interno durante reconciliação' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    servico: 'Cron de reconciliação de pedidos MeuIngrss',
    descricao: 'Envie um POST com Authorization: Bearer {CRON_SECRET} para disparar a verificação',
  });
}
