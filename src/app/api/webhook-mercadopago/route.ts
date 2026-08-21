import { NextRequest, NextResponse } from 'next/server';
import { paymentClient, validarAssinaturaWebhook, obterSecretWebhook, ehMercadoPagoConfigurado } from '@/lib/mercadopago';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { gerarHashIngresso } from '@/lib/gerarQrCode';
import { logger } from '@/lib/logger';
import { enviarNotificacaoIngressoLiberado } from '@/lib/notificacoes';
import { verificarRateLimit } from '@/lib/rateLimit';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Função de auxílio: Registra notificação na tabela de auditoria 'webhook_logs'
 */
async function registrarLogWebhook(
  supabase: ReturnType<typeof criarClienteAdmin>,
  dados: {
    gateway?: string;
    tipo_evento?: string;
    acao?: string;
    data_id?: string;
    request_id?: string;
    assinatura?: string;
    payload?: unknown;
    status_resposta: number;
    resultado?: string;
    erro?: string;
    ip?: string;
    duracao_ms?: number;
  }
) {
  try {
    await supabase.from('webhook_logs').insert({
      gateway: dados.gateway || 'mercadopago',
      tipo_evento: dados.tipo_evento,
      acao: dados.acao,
      data_id: dados.data_id,
      request_id: dados.request_id,
      assinatura: dados.assinatura,
      payload: dados.payload as Record<string, unknown>,
      status_resposta: dados.status_resposta,
      resultado: dados.resultado,
      erro: dados.erro,
      ip: dados.ip,
      duracao_ms: dados.duracao_ms,
    });
  } catch (err) {
    logger.warn('Não foi possível gravar log de webhook na tabela webhook_logs', { erro: err });
  }
}

/**
 * Executa a liberação atômica de ingressos via RPC PostgreSQL ou Fallback JS resiliente
 */
async function executarLiberacaoIngressos(
  supabase: ReturnType<typeof criarClienteAdmin>,
  params: {
    pedidoId: string;
    gatewayPaymentId: string;
    metodoPagamento: string;
    qrHashes: string[];
    fallbackData?: {
      eventoId: string;
      loteId: string;
      compradorId: string;
      quantidade: number;
      valorUnitario: number;
    };
  }
): Promise<{ sucesso: boolean; ja_processado?: boolean; erro?: string; ingressos_ids?: string[] }> {
  // 1. Tenta executar via RPC Atômica no PostgreSQL (Migration 026)
  if (params.pedidoId && UUID_REGEX.test(params.pedidoId)) {
    const { data: resRpc, error: errRpc } = await supabase.rpc('processar_pagamento_aprovado', {
      p_pedido_id: params.pedidoId,
      p_gateway_payment_id: params.gatewayPaymentId,
      p_metodo_pagamento: params.metodoPagamento,
      p_qr_hashes: params.qrHashes,
    });

    if (!errRpc && resRpc?.sucesso) {
      return {
        sucesso: true,
        ja_processado: Boolean(resRpc.ja_processado),
        erro: resRpc.erro,
        ingressos_ids: resRpc.ingressos_ids,
      };
    }

    if (errRpc || (resRpc && !resRpc.sucesso)) {
      logger.warn('RPC processar_pagamento_aprovado não concluiu com sucesso. Prosseguindo com fallback JS atômico', {
        pedidoId: params.pedidoId,
        erroRpc: errRpc?.message,
        erroRetorno: resRpc?.erro,
      });
    }
  }

  // 2. Fallback JS Atômico (caso a migration 026 ainda esteja pendente de execução no SQL Editor)
  logger.info('Executando fallback JS resiliente para liberação de pedido e ingressos', {
    pedidoId: params.pedidoId,
    gatewayPaymentId: params.gatewayPaymentId,
  });

  // 2.1 Verifica se o pedido existe e seu status atual
  const { data: pedido } = await supabase
    .from('pedidos')
    .select('*')
    .eq('id', params.pedidoId)
    .maybeSingle();

  const eventoId = pedido?.evento_id || params.fallbackData?.eventoId;
  const loteId = pedido?.lote_id || params.fallbackData?.loteId;
  const compradorId = pedido?.comprador_id || params.fallbackData?.compradorId;
  const quantidade = pedido?.quantidade || params.fallbackData?.quantidade || 1;
  const valorUnitario = pedido?.valor_unitario !== undefined ? Number(pedido.valor_unitario) : (params.fallbackData?.valorUnitario || 0);

  if (!eventoId || !loteId || !compradorId) {
    return { sucesso: false, erro: 'Dados do pedido incompletos para liberação de ingressos' };
  }

  // 2.2 Checagem de idempotência: Já existem ingressos gerados para este pagamento ou pedido?
  const { data: pagExistente } = await supabase
    .from('pagamentos')
    .select('id, ingresso_id')
    .eq('gateway_transaction_id', params.gatewayPaymentId);

  if (pagExistente && pagExistente.length >= quantidade) {
    if (pedido && pedido.status !== 'aprovado') {
      await supabase.from('pedidos').update({
        status: 'aprovado',
        gateway_payment_id: params.gatewayPaymentId,
        gateway_transaction_id: params.gatewayPaymentId,
        metodo_pagamento: params.metodoPagamento,
        pago_em: new Date().toISOString(),
      }).eq('id', params.pedidoId);
    }
    return { sucesso: true, ja_processado: true, ingressos_ids: pagExistente.map((p) => p.ingresso_id) };
  }

  // 2.3 Proteção Anti-Sobrevenda no Fallback
  const { data: loteAtual } = await supabase
    .from('lotes_ingresso')
    .select('quantidade_total, quantidade_vendida')
    .eq('id', loteId)
    .single();

  if (loteAtual && (loteAtual.quantidade_vendida + quantidade) > loteAtual.quantidade_total) {
    if (pedido) {
      await supabase.from('pedidos').update({
        status: 'estoque_esgotado',
        gateway_payment_id: params.gatewayPaymentId,
        gateway_transaction_id: params.gatewayPaymentId,
        metodo_pagamento: params.metodoPagamento,
      }).eq('id', params.pedidoId);
    }
    logger.warn('Sobrevenda bloqueada no webhook fallback', { loteId, pedidoId: params.pedidoId });
    return { sucesso: false, erro: 'estoque_esgotado' };
  }

  // 2.4 Atualiza o pedido para 'aprovado'
  if (pedido) {
    await supabase
      .from('pedidos')
      .update({
        status: 'aprovado',
        gateway_payment_id: params.gatewayPaymentId,
        gateway_transaction_id: params.gatewayPaymentId,
        metodo_pagamento: params.metodoPagamento,
        pago_em: new Date().toISOString(),
      })
      .eq('id', params.pedidoId);
  }

  // 2.5 Cria os ingressos e pagamentos com anti-duplicação
  const ingressosIds: string[] = [];
  for (let i = 0; i < quantidade; i++) {
    const hash = params.qrHashes[i] || gerarHashIngresso(`${eventoId}-${params.gatewayPaymentId}-${i}`, eventoId);

    // Verifica se o ingresso já existe com esta hash
    const { data: ingExistente } = await supabase
      .from('ingressos')
      .select('id')
      .eq('qr_code_hash', hash)
      .maybeSingle();

    let ingressoId = ingExistente?.id;

    if (!ingressoId) {
      const { data: ingresso, error: errIng } = await supabase
        .from('ingressos')
        .insert({
          evento_id: eventoId,
          lote_id: loteId,
          comprador_id: compradorId,
          qr_code_hash: hash,
          status: 'valido',
          data_compra: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (errIng || !ingresso) {
        logger.error('Erro ao inserir ingresso no fallback JS', errIng);
        return { sucesso: false, erro: errIng?.message || 'Falha ao inserir ingresso' };
      }

      ingressoId = ingresso.id;
    }

    ingressosIds.push(ingressoId);

    const { data: pagExist } = await supabase
      .from('pagamentos')
      .select('id')
      .eq('ingresso_id', ingressoId)
      .eq('gateway_transaction_id', params.gatewayPaymentId)
      .maybeSingle();

    if (!pagExist) {
      await supabase.from('pagamentos').insert({
        ingresso_id: ingressoId,
        valor: valorUnitario,
        status: 'aprovado',
        gateway_transaction_id: params.gatewayPaymentId,
        metodo_pagamento: params.metodoPagamento,
        criado_em: new Date().toISOString(),
      });
    }
  }

  // 2.6 Cria notificação in-app
  await supabase.from('notificacoes_cliente').insert({
    usuario_id: compradorId,
    titulo: 'Ingresso(s) Liberado(s)!',
    mensagem: `${quantidade} ingresso(s) confirmado(s) com sucesso.`,
    tipo: 'ingresso_liberado',
    dados: {
      pedido_id: params.pedidoId,
      evento_id: eventoId,
      lote_id: loteId,
      quantidade,
      gateway_payment_id: params.gatewayPaymentId,
    },
  });

  return { sucesso: true, ja_processado: false, ingressos_ids: ingressosIds };
}

/**
 * Executa estorno ou cancelamento de pagamento e invalida ingressos vinculados
 */
async function executarEstorno(
  supabase: ReturnType<typeof criarClienteAdmin>,
  gatewayPaymentId: string,
  novoStatus: string
) {
  // 1. Tenta estornar pedido de ingressos via RPC
  const { data: resRpc, error: errRpc } = await supabase.rpc('processar_estorno_pagamento', {
    p_gateway_payment_id: gatewayPaymentId,
    p_novo_status: novoStatus,
  });

  if (!errRpc && resRpc) {
    // Também atualiza pedidos de loja se houver
    await supabase
      .from('store_orders')
      .update({ status: 'refunded', updated_at: new Date().toISOString() })
      .eq('mercado_pago_payment_id', gatewayPaymentId);

    return resRpc;
  }

  await supabase
    .from('pedidos')
    .update({ status: 'estornado' })
    .or(`gateway_payment_id.eq.${gatewayPaymentId},gateway_transaction_id.eq.${gatewayPaymentId}`);

  await supabase
    .from('store_orders')
    .update({ status: 'refunded', updated_at: new Date().toISOString() })
    .eq('mercado_pago_payment_id', gatewayPaymentId);

  await supabase
    .from('pagamentos')
    .update({ status: 'estornado' })
    .eq('gateway_transaction_id', gatewayPaymentId);

  const { data: pagamentos } = await supabase
    .from('pagamentos')
    .select('ingresso_id')
    .eq('gateway_transaction_id', gatewayPaymentId);

  if (pagamentos && pagamentos.length > 0) {
    const ids = pagamentos.map((p) => p.ingresso_id);
    await supabase
      .from('ingressos')
      .update({ status: 'cancelado' })
      .in('id', ids);
  }

  return { sucesso: true, gateway_transaction_id: gatewayPaymentId };
}


export async function POST(request: NextRequest) {
  const inicioTimestamp = Date.now();
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1';
  const supabase = criarClienteAdmin();

  // Rate limit: até 120 requisições por minuto por IP para webhooks
  const rateLimit = verificarRateLimit(`webhook_mp_${ip}`, { janelaMs: 60000, maxRequisicoes: 120 });
  if (!rateLimit.permitido) {
    logger.warn('Rate limit excedido no Webhook Mercado Pago', { ip });
    return NextResponse.json({ erro: 'Muitas requisições.' }, { status: 429 });
  }

  const searchParams = request.nextUrl.searchParams;
  let body: Record<string, unknown> = {};

  try {
    body = await request.json();
  } catch {
    // Notificações IPN antigas podem vir sem body JSON
  }

  const bodyData = body?.data as { id?: string | number } | undefined;
  const bodyType = typeof body?.type === 'string' ? body.type : undefined;
  const bodyAction = typeof body?.action === 'string' ? body.action : undefined;

  // 1. Extração do ID do Pagamento e Tópico da Notificação
  const paymentId =
    bodyData?.id ||
    searchParams.get('data.id') ||
    searchParams.get('id') ||
    (bodyType === 'payment' && typeof body?.id === 'string' ? body.id : null);

  const notificationType = bodyType || searchParams.get('type') || searchParams.get('topic');

  // Notificações de teste do Mercado Pago ou tópicos irrelevantes
  if (!paymentId || (notificationType && notificationType !== 'payment')) {
    const duracao = Date.now() - inicioTimestamp;
    await registrarLogWebhook(supabase, {
      tipo_evento: notificationType || 'desconhecido',
      acao: bodyAction,
      data_id: String(paymentId || ''),
      status_resposta: 200,
      resultado: 'Notificação ignorada (tópico diferente de payment ou ping de teste)',
      ip,
      duracao_ms: duracao,
      payload: body,
    });

    return NextResponse.json({ recebido: true, mensagem: 'Notificação processada ou ignorada' }, { status: 200 });
  }

  // 2. Validação da Assinatura HMAC de Segurança (Fail-Closed)
  const xSignature = request.headers.get('x-signature');
  const xRequestId = request.headers.get('x-request-id');
  const secretConfigurado = obterSecretWebhook();

  if (secretConfigurado) {
    if (!xSignature || !xRequestId) {
      logger.security('REJEITADO: Webhook recebido sem cabeçalhos de assinatura x-signature/x-request-id', { ip, paymentId });
      const duracao = Date.now() - inicioTimestamp;
      await registrarLogWebhook(supabase, {
        tipo_evento: notificationType || 'payment',
        data_id: String(paymentId || ''),
        status_resposta: 401,
        erro: 'Cabeçalhos x-signature e x-request-id obrigatórios quando secret está configurado',
        ip,
        duracao_ms: duracao,
      });
      return NextResponse.json({ erro: 'Não autorizado: assinatura ausente' }, { status: 401 });
    }

    const assinaturaValida = validarAssinaturaWebhook(xSignature, xRequestId, String(paymentId));
    if (!assinaturaValida) {
      logger.security('REJEITADO: Assinatura HMAC inválida no webhook Mercado Pago', { ip, paymentId });
      const duracao = Date.now() - inicioTimestamp;
      await registrarLogWebhook(supabase, {
        tipo_evento: notificationType || 'payment',
        data_id: String(paymentId || ''),
        status_resposta: 401,
        erro: 'Assinatura HMAC x-signature inválida',
        ip,
        duracao_ms: duracao,
      });
      return NextResponse.json({ erro: 'Não autorizado: assinatura inválida' }, { status: 401 });
    }
  }

  try {
    // 3. Consulta Direta e Oficial à API do Mercado Pago (Fonte Única de Verdade)
    if (!ehMercadoPagoConfigurado()) {
      return NextResponse.json({ erro: 'Gateway não configurado' }, { status: 500 });
    }

    let payment: Awaited<ReturnType<typeof paymentClient.get>>;
    try {
      payment = await paymentClient.get({ id: String(paymentId) });
    } catch (mpErr) {
      logger.error(`Erro ao consultar pagamento ${paymentId} na API do Mercado Pago`, mpErr);
      const duracao = Date.now() - inicioTimestamp;
      await registrarLogWebhook(supabase, {
        tipo_evento: 'payment',
        data_id: String(paymentId),
        status_resposta: 502,
        erro: 'Erro de comunicação com a API do Mercado Pago',
        ip,
        duracao_ms: duracao,
      });
      return NextResponse.json({ erro: 'Falha ao consultar o banco' }, { status: 502 });
    }

    if (!payment) {
      const duracao = Date.now() - inicioTimestamp;
      await registrarLogWebhook(supabase, {
        tipo_evento: 'payment',
        data_id: String(paymentId),
        status_resposta: 404,
        erro: 'Pagamento não localizado na API oficial do Mercado Pago',
        ip,
        duracao_ms: duracao,
      });
      return NextResponse.json({ erro: 'Pagamento não localizado' }, { status: 404 });
    }

    const statusPagamento = String(payment.status || '');
    const statusDetail = String(payment.status_detail || '');
    const gatewayPaymentId = String(payment.id);
    const metodoPagamento = payment.payment_method_id || payment.payment_type_id || 'mercadopago';

    logger.info(`Webhook recebido para pagamento ${gatewayPaymentId}`, {
      status: statusPagamento,
      status_detail: statusDetail,
      metodo: metodoPagamento,
      valor: payment.transaction_amount,
    });

    // 4. Tratar Cancelamentos, Estornos ou Rejeições
    if (['refunded', 'charged_back', 'cancelled', 'rejected'].includes(statusPagamento)) {
      await executarEstorno(supabase, gatewayPaymentId, statusPagamento);
      const duracao = Date.now() - inicioTimestamp;
      await registrarLogWebhook(supabase, {
        tipo_evento: 'payment',
        data_id: gatewayPaymentId,
        status_resposta: 200,
        resultado: `Status ${statusPagamento} (${statusDetail}) processado com sucesso`,
        ip,
        duracao_ms: duracao,
        payload: { status: statusPagamento, status_detail: statusDetail, gateway_id: gatewayPaymentId },
      });
      return NextResponse.json({ recebido: true, status: statusPagamento, status_detail: statusDetail }, { status: 200 });
    }

    // Se o pagamento está em análise (in_process, pending, authorized, in_mediation)
    if (['in_process', 'pending', 'authorized', 'in_mediation'].includes(statusPagamento)) {
      // Atualiza pedido para em_analise se existir
      if (payment.external_reference && UUID_REGEX.test(payment.external_reference)) {
        await supabase
          .from('pedidos')
          .update({
            status: 'em_analise',
            gateway_payment_id: gatewayPaymentId,
            gateway_transaction_id: gatewayPaymentId,
            metodo_pagamento: metodoPagamento,
          })
          .eq('id', payment.external_reference)
          .eq('status', 'pendente');
      }

      const duracao = Date.now() - inicioTimestamp;
      await registrarLogWebhook(supabase, {
        tipo_evento: 'payment',
        data_id: gatewayPaymentId,
        status_resposta: 200,
        resultado: `Pagamento em análise (${statusPagamento})`,
        ip,
        duracao_ms: duracao,
        payload: { status: statusPagamento, status_detail: statusDetail, gateway_id: gatewayPaymentId },
      });
      return NextResponse.json({ recebido: true, status: statusPagamento, mensagem: 'Aguardando aprovação / em análise' }, { status: 200 });
    }

    // Se qualquer outro status diferente de approved
    if (statusPagamento !== 'approved') {
      const duracao = Date.now() - inicioTimestamp;
      await registrarLogWebhook(supabase, {
        tipo_evento: 'payment',
        data_id: gatewayPaymentId,
        status_resposta: 200,
        resultado: `Pagamento em estado ${statusPagamento} (não aprovado)`,
        ip,
        duracao_ms: duracao,
      });
      return NextResponse.json({ recebido: true, status: statusPagamento, mensagem: 'Aguardando aprovação' }, { status: 200 });
    }

    // 5. Pagamento APROVADO: Resolução do Pedido e Metadados
    let orderId = payment.external_reference;
    let metadata = (payment.metadata || {}) as Record<string, unknown>;

    // Se o external_reference continha um JSON serializado, extrai os metadados
    if (orderId && !UUID_REGEX.test(orderId)) {
      try {
        const parsed = JSON.parse(orderId);
        metadata = { ...metadata, ...parsed };
        orderId = parsed.pedido_id || parsed.order_id;
      } catch {
        // Ignora erro de parse
      }
    }

    // 5.0 VERIFICAÇÃO SE É UM PEDIDO DA LOJA VIRTUAL (STORE)
    const ehPedidoLoja = metadata?.tipo === 'loja' || metadata?.order_type === 'loja';
    let storeOrderEncontrado = null;

    if (ehPedidoLoja || (orderId && UUID_REGEX.test(orderId))) {
      const { data: so } = await supabase
        .from('store_orders')
        .select('*')
        .or(`id.eq.${orderId || '00000000-0000-0000-0000-000000000000'},mercado_pago_payment_id.eq.${gatewayPaymentId}`)
        .maybeSingle();

      storeOrderEncontrado = so;
    }

    if (storeOrderEncontrado || ehPedidoLoja) {
      const targetOrderId = storeOrderEncontrado?.id || orderId;

      if (targetOrderId && UUID_REGEX.test(targetOrderId)) {
        logger.info('Processando pedido de Loja aprovado via Webhook', {
          orderId: targetOrderId,
          gatewayPaymentId,
        });

        const { data: rpcLoja, error: errRpcLoja } = await supabase.rpc('processar_pedido_loja_aprovado', {
          p_order_id: targetOrderId,
          p_gateway_payment_id: gatewayPaymentId,
          p_payment_method: metodoPagamento,
        });

        if (errRpcLoja || (rpcLoja && !rpcLoja.sucesso)) {
          logger.warn('RPC processar_pedido_loja_aprovado falhou, executando fallback', {
            erroRpc: errRpcLoja?.message,
            erroRetorno: rpcLoja?.erro,
          });

          await supabase.from('store_orders').update({
            status: 'paid',
            mercado_pago_payment_id: gatewayPaymentId,
            payment_method: metodoPagamento,
            paid_at: new Date().toISOString(),
          }).eq('id', targetOrderId);

          if (storeOrderEncontrado?.user_id) {
            await supabase.from('store_carts').update({ status: 'converted' }).eq('user_id', storeOrderEncontrado.user_id).eq('status', 'active');
          }
        }

        const duracao = Date.now() - inicioTimestamp;
        await registrarLogWebhook(supabase, {
          tipo_evento: 'payment',
          data_id: gatewayPaymentId,
          status_resposta: 200,
          resultado: 'Pedido da Loja Virtual processado e aprovado com sucesso',
          ip,
          duracao_ms: duracao,
          payload: { order_id: targetOrderId, gateway_payment_id: gatewayPaymentId, tipo: 'loja' },
        });

        return NextResponse.json({
          sucesso: true,
          tipo: 'loja',
          mensagem: 'Pedido da loja confirmado com sucesso',
          order_id: targetOrderId,
        });
      }
    }

    let pedidoEncontrado = null;

    // 5.1 Busca por ID direto (se for UUID)
    if (orderId && UUID_REGEX.test(orderId)) {
      const { data: p } = await supabase.from('pedidos').select('*').eq('id', orderId).maybeSingle();
      pedidoEncontrado = p;
    }


    // 5.2 Busca por external_reference (string literal)
    if (!pedidoEncontrado && payment.external_reference) {
      const { data: p } = await supabase.from('pedidos').select('*').eq('external_reference', payment.external_reference).maybeSingle();
      pedidoEncontrado = p;
    }

    // 5.3 Busca por metadata.pedido_id
    if (!pedidoEncontrado && metadata?.pedido_id && typeof metadata.pedido_id === 'string' && UUID_REGEX.test(metadata.pedido_id)) {
      const { data: p } = await supabase.from('pedidos').select('*').eq('id', metadata.pedido_id).maybeSingle();
      pedidoEncontrado = p;
      orderId = metadata.pedido_id;
    }

    // 5.4 Busca por gateway_payment_id ou gateway_transaction_id
    if (!pedidoEncontrado) {
      const { data: p } = await supabase
        .from('pedidos')
        .select('*')
        .or(`gateway_payment_id.eq.${gatewayPaymentId},gateway_transaction_id.eq.${gatewayPaymentId}`)
        .maybeSingle();
      pedidoEncontrado = p;
    }

    // 5.5 Busca por comprador_id + evento_id + lote_id
    const compId = String(pedidoEncontrado?.comprador_id || metadata?.comprador_id || '');
    const evtId = String(pedidoEncontrado?.evento_id || metadata?.evento_id || '');
    const ltId = String(pedidoEncontrado?.lote_id || metadata?.lote_id || '');

    if (!pedidoEncontrado && compId && evtId && ltId && UUID_REGEX.test(compId) && UUID_REGEX.test(evtId) && UUID_REGEX.test(ltId)) {
      const { data: p } = await supabase
        .from('pedidos')
        .select('*')
        .eq('comprador_id', compId)
        .eq('evento_id', evtId)
        .eq('lote_id', ltId)
        .order('criado_em', { ascending: false })
        .limit(1)
        .maybeSingle();

      pedidoEncontrado = p;
    }

    const eventoId = String(pedidoEncontrado?.evento_id || metadata?.evento_id || '');
    const loteId = String(pedidoEncontrado?.lote_id || metadata?.lote_id || '');
    const compradorId = String(pedidoEncontrado?.comprador_id || metadata?.comprador_id || '');
    const quantidade = pedidoEncontrado?.quantidade || parseInt(String(metadata?.quantidade || '1'), 10);

    if (!eventoId || !loteId || !compradorId || isNaN(quantidade) || quantidade < 1) {
      const msgErro = 'Metadados insuficientes para identificar evento, lote ou comprador';
      logger.error(msgErro, null, { gatewayPaymentId, external_reference: payment.external_reference, metadata });
      const duracao = Date.now() - inicioTimestamp;
      await registrarLogWebhook(supabase, {
        tipo_evento: 'payment',
        data_id: gatewayPaymentId,
        status_resposta: 200,
        erro: msgErro,
        ip,
        duracao_ms: duracao,
      });
      return NextResponse.json({ recebido: true, erro: msgErro }, { status: 200 });
    }

    // 6. Geração de Hashes Seguras, Determinísticas e Únicas para os Ingressos
    const qrHashes: string[] = [];
    for (let i = 0; i < quantidade; i++) {
      qrHashes.push(gerarHashIngresso(`${eventoId}-${gatewayPaymentId}-${i}`, eventoId));
    }

    // 7. Se não havia pedido na tabela 'pedidos', cria/atualiza agora para manter consistência
    let finalOrderId = pedidoEncontrado?.id;
    const valorUnitarioCalculado = Number(payment.transaction_amount || 0) / quantidade;

    if (!finalOrderId) {
      const { data: novoPed } = await supabase
        .from('pedidos')
        .insert({
          comprador_id: compradorId,
          evento_id: eventoId,
          lote_id: loteId,
          quantidade,
          valor_unitario: valorUnitarioCalculado,
          valor_total: Number(payment.transaction_amount || 0),
          status: 'pendente',
          gateway_payment_id: gatewayPaymentId,
          gateway_transaction_id: gatewayPaymentId,
          metodo_pagamento: metodoPagamento,
        })
        .select('id')
        .single();

      finalOrderId = novoPed?.id;
    }

    // 8. Execução Atômica da Liberação de Ingressos
    const resultado = await executarLiberacaoIngressos(supabase, {
      pedidoId: finalOrderId || '00000000-0000-0000-0000-000000000000',
      gatewayPaymentId,
      metodoPagamento,
      qrHashes,
      fallbackData: {
        eventoId,
        loteId,
        compradorId,
        quantidade,
        valorUnitario: valorUnitarioCalculado,
      },
    });

    if (!resultado.sucesso) {
      logger.error('Falha na emissão atômica de ingressos', null, { erro: resultado.erro, gatewayPaymentId });
      const duracao = Date.now() - inicioTimestamp;
      await registrarLogWebhook(supabase, {
        tipo_evento: 'payment',
        data_id: gatewayPaymentId,
        status_resposta: 500,
        erro: resultado.erro || 'Falha ao creditar ingressos',
        ip,
        duracao_ms: duracao,
      });
      return NextResponse.json({ erro: resultado.erro || 'Falha ao creditar ingressos' }, { status: 500 });
    }

    // 9. Envio de Notificação Assíncrona
    enviarNotificacaoIngressoLiberado({
      comprador_id: compradorId,
      quantidade,
      gateway_transaction_id: gatewayPaymentId,
      email_comprador: payment.payer?.email,
    });

    const duracao = Date.now() - inicioTimestamp;
    await registrarLogWebhook(supabase, {
      tipo_evento: 'payment',
      data_id: gatewayPaymentId,
      status_resposta: 200,
      resultado: 'Pagamento aprovado e ingressos liberados com sucesso',
      ip,
      duracao_ms: duracao,
      payload: {
        pedido_id: finalOrderId,
        gateway_payment_id: gatewayPaymentId,
        quantidade,
        ingressos_ids: resultado.ingressos_ids,
      },
    });

    return NextResponse.json({
      sucesso: true,
      mensagem: 'Pagamento processado e ingressos liberados',
      pedido_id: finalOrderId,
    });
  } catch (error) {
    logger.error('Erro crítico no processamento do webhook Mercado Pago', error);
    const duracao = Date.now() - inicioTimestamp;
    await registrarLogWebhook(supabase, {
      tipo_evento: 'payment',
      data_id: String(paymentId),
      status_resposta: 500,
      erro: String(error),
      ip,
      duracao_ms: duracao,
    });
    return NextResponse.json({ erro: 'Erro interno ao processar webhook' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    servico: 'Webhook Mercado Pago MeuIngrss',
  });
}
