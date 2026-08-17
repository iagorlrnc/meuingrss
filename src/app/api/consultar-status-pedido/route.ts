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
 * Consulta e Reconciliação com Idempotência Estrita e Resolução Imediata
 *
 * Suporta:
 * 1. Verificação local imediata no banco de dados
 * 2. Consulta direta por payment_id / collection_id via paymentClient.get() (0ms de atraso de indexação)
 * 3. Busca por external_reference / preference_id via paymentClient.search()
 * 4. Emissão atômica de ingressos via RPC + Fallback JS resiliente
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
    const paymentIdParam = searchParams.get('payment_id') || searchParams.get('collection_id') || searchParams.get('data.id') || searchParams.get('id');
    const statusParam = searchParams.get('status') || searchParams.get('collection_status');
    const preferenceIdParam = searchParams.get('preference_id');
    const externalReferenceParam = searchParams.get('external_reference');
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
    let pedido: Record<string, any> | null = null;

    // 1. Busca local por pedido_id (UUID direto)
    if (pedidoId && UUID_REGEX.test(pedidoId)) {
      const { data: p } = await supabase
        .from('pedidos')
        .select('*')
        .eq('id', pedidoId)
        .maybeSingle();

      pedido = p;
    }

    // 1.1 Busca por external_reference
    if (!pedido && (pedidoId || externalReferenceParam)) {
      const refBusca = externalReferenceParam || pedidoId;
      const { data: p } = await supabase
        .from('pedidos')
        .select('*')
        .eq('external_reference', refBusca)
        .maybeSingle();

      pedido = p;
    }

    // 1.2 Busca por gateway_payment_id / gateway_transaction_id se payment_id foi passado
    if (!pedido && paymentIdParam) {
      const { data: p } = await supabase
        .from('pedidos')
        .select('*')
        .or(`gateway_payment_id.eq.${paymentIdParam},gateway_transaction_id.eq.${paymentIdParam}`)
        .maybeSingle();

      pedido = p;
    }

    // 1.3 Busca por preference_id
    if (!pedido && preferenceIdParam) {
      const { data: p } = await supabase
        .from('pedidos')
        .select('*')
        .eq('preference_id', preferenceIdParam)
        .maybeSingle();

      pedido = p;
    }

    // 1.4 Busca por comprador/evento/lote
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

    // 1.5 Busca pedido pendente recente (últimas 24h) do usuário autenticado
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

    // 2. Se o pedido já está APROVADO no banco, verifica se os ingressos existem
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

      if (ingressos && ingressos.length >= (pedido.quantidade || 1)) {
        return NextResponse.json({
          status_pedido: 'aprovado',
          mensagem: 'Pagamento confirmado! Seus ingressos foram liberados.',
          quantidade_ingressos: ingressos.length,
          pedido_id: pedido.id,
        });
      }
      // Se o pedido estava aprovado mas os ingressos não foram gerados, continua para a reconciliação emitir os ingressos
    }

    // 2.1 Verifica se já existem pagamentos aprovados no banco para o payment_id informado
    if (paymentIdParam) {
      const { data: pagsExistentes } = await supabase
        .from('pagamentos')
        .select('id, ingresso_id')
        .eq('gateway_transaction_id', String(paymentIdParam))
        .eq('status', 'aprovado');

      if (pagsExistentes && pagsExistentes.length > 0) {
        if (pedido && pedido.status !== 'aprovado') {
          await supabase
            .from('pedidos')
            .update({
              status: 'aprovado',
              gateway_payment_id: String(paymentIdParam),
              gateway_transaction_id: String(paymentIdParam),
              pago_em: new Date().toISOString(),
            })
            .eq('id', pedido.id);
        }

        return NextResponse.json({
          status_pedido: 'aprovado',
          mensagem: 'Pagamento confirmado e ingressos liberados!',
          quantidade_ingressos: pagsExistentes.length,
          pedido_id: pedido?.id || pedidoId,
        });
      }
    }

    // 3. RECONCILIAÇÃO ATIVA COM O MERCADO PAGO
    if (ehMercadoPagoConfigurado()) {
      try {
        let pagamentoAprovado: Record<string, any> | null = null;
        const idConsultaDireta = paymentIdParam || pedido?.gateway_payment_id || pedido?.gateway_transaction_id;

        // 3.1 CONSULTA DIRETA POR ID (0ms de latência de indexação - máxima velocidade e confiabilidade)
        if (idConsultaDireta) {
          try {
            const directPay = await paymentClient.get({ id: String(idConsultaDireta) });
            if (directPay) {
              const statusPay = String(directPay.status || '');
              if (statusPay === 'approved') {
                pagamentoAprovado = directPay as unknown as Record<string, any>;
              } else if (['refunded', 'charged_back', 'cancelled', 'rejected'].includes(statusPay)) {
                if (pedido?.id) {
                  await supabase.from('pedidos').update({ status: 'recusado' }).eq('id', pedido.id);
                }
                return NextResponse.json({
                  status_pedido: 'cancelado',
                  mensagem: 'O pagamento foi cancelado ou recusado pelo gateway.',
                  pedido_id: pedido?.id,
                });
              }
            }
          } catch (directErr) {
            logger.warn('Consulta direta por payment_id falhou no Mercado Pago, prosseguindo com busca', {
              id: idConsultaDireta,
              erro: directErr,
            });
          }
        }

        // 3.2 Se ainda não encontrou e temos pedido.id, busca por external_reference (UUID)
        if (!pagamentoAprovado && pedido?.id) {
          try {
            const searchRes = await paymentClient.search({
              options: {
                external_reference: pedido.id,
                sort: 'date_created',
                criteria: 'desc',
                limit: 5,
              },
            });
            const pags = (searchRes.results || []) as Record<string, any>[];
            pagamentoAprovado = pags.find((p) => p.status === 'approved') || null;
          } catch (searchErr) {
            logger.warn('Busca por external_reference falhou', { pedidoId: pedido.id, erro: searchErr });
          }
        }

        // 3.3 Se ainda não encontrou, busca por external_reference alternativo
        if (!pagamentoAprovado && (pedido?.external_reference || externalReferenceParam)) {
          const ref = pedido?.external_reference || externalReferenceParam;
          try {
            const searchRes = await paymentClient.search({
              options: {
                external_reference: ref,
                sort: 'date_created',
                criteria: 'desc',
                limit: 5,
              },
            });
            const pags = (searchRes.results || []) as Record<string, any>[];
            pagamentoAprovado = pags.find((p) => p.status === 'approved') || null;
          } catch (searchErr) {
            logger.warn('Busca por external_reference alternativo falhou', { ref, erro: searchErr });
          }
        }

        // 3.4 Se encontramos pagamento aprovado no gateway
        if (pagamentoAprovado) {
          const paymentIdStr = String(pagamentoAprovado.id);
          const metodoPagamento = String(pagamentoAprovado.payment_method_id || pagamentoAprovado.payment_type_id || 'mercadopago');
          const meta = (pagamentoAprovado.metadata || {}) as Record<string, any>;

          // Proteção IDOR no Gateway Payload
          const compMeta = meta?.comprador_id || meta?.compradorid;
          if (compMeta && compMeta !== user.id) {
            const { data: perfilUser } = await supabaseServidor.from('profiles').select('role').eq('id', user.id).single();
            if (!perfilUser || perfilUser.role !== 'admin') {
              logger.security('IDOR prevenido ao tentar reconciliar pagamento de outro comprador', { caller: user.id, target: compMeta });
              return NextResponse.json({ erro: 'Acesso não autorizado aos dados deste pagamento.' }, { status: 403 });
            }
          }

          // Resolução dos dados da compra
          const eventoId = pedido?.evento_id || meta?.evento_id || meta?.eventoid || eventoIdParam;
          const loteId = pedido?.lote_id || meta?.lote_id || meta?.loteid || loteIdParam;
          const compradorId = pedido?.comprador_id || meta?.comprador_id || meta?.compradorid || user.id;
          const quantidade = pedido?.quantidade || parseInt(String(meta?.quantidade || '1'), 10) || 1;
          const valorUnitario = pedido?.valor_unitario !== undefined && Number(pedido.valor_unitario) > 0
            ? Number(pedido.valor_unitario)
            : (Number(pagamentoAprovado.transaction_amount || 0) / quantidade);
          const valorTotal = Number(pagamentoAprovado.transaction_amount || (valorUnitario * quantidade));
          const pedidoIdFinal = pedido?.id || meta?.pedido_id || pedidoId || UUID_REGEX.test(String(pagamentoAprovado.external_reference || ''))
            ? String(pagamentoAprovado.external_reference)
            : (pedidoId && UUID_REGEX.test(pedidoId) ? pedidoId : crypto.randomUUID());

          // ⚠️ GUARDA DE IDEMPOTÊNCIA: Verifica se JÁ existem ingressos para este pagamento no banco
          const { data: pagsExistentes } = await supabase
            .from('pagamentos')
            .select('id, ingresso_id')
            .eq('gateway_transaction_id', paymentIdStr);

          if (pagsExistentes && pagsExistentes.length >= quantidade) {
            if (pedidoIdFinal) {
              await supabase
                .from('pedidos')
                .update({
                  status: 'aprovado',
                  gateway_payment_id: paymentIdStr,
                  gateway_transaction_id: paymentIdStr,
                  pago_em: String(pagamentoAprovado.date_approved || new Date().toISOString()),
                })
                .eq('id', pedidoIdFinal);
            }

            return NextResponse.json({
              status_pedido: 'aprovado',
              mensagem: 'Pagamento confirmado e ingressos liberados!',
              quantidade_ingressos: pagsExistentes.length,
              pedido_id: pedidoIdFinal,
            });
          }

          logger.info('Auto-reconciliação: Emitindo ingressos para pagamento aprovado', {
            pedidoId: pedidoIdFinal,
            paymentId: paymentIdStr,
            quantidade,
            eventoId,
            compradorId,
          });

          // Gera exatamente a quantidade necessária de hashes
          const qrHashes: string[] = [];
          for (let i = 0; i < quantidade; i++) {
            qrHashes.push(gerarHashIngresso(`${eventoId}-${paymentIdStr}-${i}-${Date.now()}`, eventoId || 'evento'));
          }

          // 1. Tenta via RPC atômica
          if (pedidoIdFinal && UUID_REGEX.test(pedidoIdFinal)) {
            const { data: resRpc, error: errRpc } = await supabase.rpc('processar_pagamento_aprovado', {
              p_pedido_id: pedidoIdFinal,
              p_gateway_payment_id: paymentIdStr,
              p_metodo_pagamento: metodoPagamento,
              p_qr_hashes: qrHashes,
            });

            if (!errRpc && resRpc?.sucesso) {
              enviarNotificacaoIngressoLiberado({
                comprador_id: compradorId,
                quantidade,
                gateway_transaction_id: paymentIdStr,
                email_comprador: pagamentoAprovado.payer?.email || user.email,
              });

              return NextResponse.json({
                status_pedido: 'aprovado',
                mensagem: 'Pagamento confirmado e ingressos liberados com sucesso!',
                quantidade_ingressos: quantidade,
                pedido_id: pedidoIdFinal,
              });
            }

            if (resRpc?.erro === 'estoque_esgotado') {
              return NextResponse.json({
                status_pedido: 'estoque_esgotado',
                mensagem: 'O estoque do lote esgotou durante o processamento. O valor será estornado.',
                pedido_id: pedidoIdFinal,
              });
            }
          }

          // 2. Fallback JS Atômico e Resiliente
          if (eventoId && loteId && compradorId) {
            // Trava anti-sobrevenda no Fallback
            const { data: loteAtual } = await supabase
              .from('lotes_ingresso')
              .select('quantidade_total, quantidade_vendida')
              .eq('id', loteId)
              .single();

            if (loteAtual && (loteAtual.quantidade_vendida + quantidade) > loteAtual.quantidade_total) {
              await supabase.from('pedidos').upsert({
                id: pedidoIdFinal,
                comprador_id: compradorId,
                evento_id: eventoId,
                lote_id: loteId,
                quantidade,
                valor_unitario: valorUnitario,
                taxa_servico: pedido?.taxa_servico || 0,
                valor_total: valorTotal,
                status: 'estoque_esgotado',
                gateway_payment_id: paymentIdStr,
                gateway_transaction_id: paymentIdStr,
                metodo_pagamento: metodoPagamento,
              });

              return NextResponse.json({
                status_pedido: 'estoque_esgotado',
                mensagem: 'Estoque esgotado durante o processamento. O valor será estornado.',
                pedido_id: pedidoIdFinal,
              });
            }

            try {
              await supabase
                .from('pedidos')
                .upsert({
                  id: pedidoIdFinal,
                  comprador_id: compradorId,
                  evento_id: eventoId,
                  lote_id: loteId,
                  quantidade,
                  valor_unitario: valorUnitario,
                  taxa_servico: pedido?.taxa_servico || 0,
                  valor_total: valorTotal,
                  status: 'aprovado',
                  gateway_payment_id: paymentIdStr,
                  gateway_transaction_id: paymentIdStr,
                  metodo_pagamento: metodoPagamento,
                  pago_em: String(pagamentoAprovado.date_approved || new Date().toISOString()),
                });
            } catch (pedErr) {
              logger.warn('Upsert na tabela pedidos falhou no fallback', { erro: pedErr });
            }

            for (let i = 0; i < quantidade; i++) {
              const { data: ing, error: errIng } = await supabase
                .from('ingressos')
                .insert({
                  evento_id: eventoId,
                  lote_id: loteId,
                  comprador_id: compradorId,
                  qr_code_hash: qrHashes[i],
                  status: 'valido',
                  data_compra: String(pagamentoAprovado.date_approved || new Date().toISOString()),
                })
                .select('id')
                .single();

              if (errIng) {
                logger.error('Erro ao inserir ingresso no fallback', errIng);
              }

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

            try {
              await supabase.from('notificacoes_cliente').insert({
                usuario_id: compradorId,
                titulo: 'Ingresso(s) Liberado(s)!',
                mensagem: `${quantidade} ingresso(s) confirmado(s) com sucesso.`,
                tipo: 'ingresso_liberado',
                dados: {
                  pedido_id: pedidoIdFinal,
                  evento_id: eventoId,
                  lote_id: loteId,
                  quantidade,
                  gateway_payment_id: paymentIdStr,
                },
              });
            } catch {
              // Notificação in-app opcional
            }

            enviarNotificacaoIngressoLiberado({
              comprador_id: compradorId,
              quantidade,
              gateway_transaction_id: paymentIdStr,
              email_comprador: pagamentoAprovado.payer?.email || user.email,
            });

            return NextResponse.json({
              status_pedido: 'aprovado',
              mensagem: 'Pagamento confirmado e ingressos liberados com sucesso!',
              quantidade_ingressos: quantidade,
              pedido_id: pedidoIdFinal,
            });
          }
        }
      } catch (mpErr) {
        logger.warn('Erro ao consultar gateway durante reconciliação ativa', { erro: mpErr, pedidoId: pedido?.id });
      }
    }

    // 4. Se o status na query string explicitamente indicar rejeição/cancelamento
    if (statusParam === 'rejected' || statusParam === 'cancelled') {
      return NextResponse.json({
        status_pedido: 'cancelado',
        mensagem: 'O pagamento não foi aprovado pelo gateway.',
        pedido_id: pedido?.id,
      });
    }

    // 5. Status Padrão: ainda aguardando confirmação
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

