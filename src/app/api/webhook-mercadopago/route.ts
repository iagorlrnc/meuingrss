import { NextRequest, NextResponse } from 'next/server';
import { paymentClient, validarAssinaturaWebhook, obterSecretWebhook } from '@/lib/mercadopago';
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
  const { data: resRpc, error: errRpc } = await supabase.rpc('processar_pagamento_aprovado', {
    p_pedido_id: params.pedidoId,
    p_gateway_payment_id: params.gatewayPaymentId,
    p_metodo_pagamento: params.metodoPagamento,
    p_qr_hashes: params.qrHashes,
  });

  if (!errRpc && resRpc) {
    return {
      sucesso: Boolean(resRpc.sucesso),
      ja_processado: Boolean(resRpc.ja_processado),
      erro: resRpc.erro,
      ingressos_ids: resRpc.ingressos_ids,
    };
  }

  // 2. Fallback JS Atômico (caso a migration 026 ainda esteja pendente de execução no SQL Editor)
  logger.info('Executando fallback JS resiliente para liberação de pedido e ingressos', {
    pedidoId: params.pedidoId,
    gatewayPaymentId: params.gatewayPaymentId,
    erroRpc: errRpc?.message,
  });

  // 2.1 Verifica se o pedido existe e seu status atual
  const { data: pedido } = await supabase
    .from('pedidos')
    .select('*')
    .eq('id', params.pedidoId)
    .maybeSingle();

  if (pedido && pedido.status === 'aprovado') {
    return { sucesso: true, ja_processado: true };
  }

  // 2.2 Checagem de idempotência em pagamentos
  const { data: pagExistente } = await supabase
    .from('pagamentos')
    .select('id')
    .eq('gateway_transaction_id', params.gatewayPaymentId)
    .maybeSingle();

  if (pagExistente) {
    if (pedido && pedido.status !== 'aprovado') {
      await supabase.from('pedidos').update({
        status: 'aprovado',
        gateway_payment_id: params.gatewayPaymentId,
        metodo_pagamento: params.metodoPagamento,
        pago_em: new Date().toISOString(),
      }).eq('id', params.pedidoId);
    }
    return { sucesso: true, ja_processado: true };
  }

  const eventoId = pedido?.evento_id || params.fallbackData?.eventoId;
  const loteId = pedido?.lote_id || params.fallbackData?.loteId;
  const compradorId = pedido?.comprador_id || params.fallbackData?.compradorId;
  const quantidade = pedido?.quantidade || params.fallbackData?.quantidade || 1;
  const valorUnitario = pedido?.valor_unitario !== undefined ? Number(pedido.valor_unitario) : (params.fallbackData?.valorUnitario || 0);

  if (!eventoId || !loteId || !compradorId) {
    return { sucesso: false, erro: 'Dados do pedido incompletos para liberação de ingressos' };
  }

  // 2.3 Atualiza o pedido para 'aprovado'
  if (pedido) {
    await supabase
      .from('pedidos')
      .update({
        status: 'aprovado',
        gateway_payment_id: params.gatewayPaymentId,
        metodo_pagamento: params.metodoPagamento,
        pago_em: new Date().toISOString(),
      })
      .eq('id', params.pedidoId);
  }

  // 2.4 Cria os ingressos e pagamentos
  const ingressosIds: string[] = [];
  for (let i = 0; i < quantidade; i++) {
    const hash = params.qrHashes[i] || gerarHashIngresso(`${eventoId}-${params.gatewayPaymentId}-${i}-${Date.now()}`, eventoId);

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

    ingressosIds.push(ingresso.id);

    await supabase.from('pagamentos').insert({
      ingresso_id: ingresso.id,
      valor: valorUnitario,
      status: 'aprovado',
      gateway_transaction_id: params.gatewayPaymentId,
      metodo_pagamento: params.metodoPagamento,
      criado_em: new Date().toISOString(),
    });
  }

  // 2.5 Cria notificação in-app
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
  // 1. Tenta via RPC
  const { data: resRpc, error: errRpc } = await supabase.rpc('processar_estorno_pagamento', {
    p_gateway_payment_id: gatewayPaymentId,
    p_novo_status: novoStatus,
  });

  if (!errRpc && resRpc) {
    return resRpc;
  }

  // 2. Fallback JS
  await supabase
    .from('pedidos')
    .update({ status: 'estornado' })
    .eq('gateway_payment_id', gatewayPaymentId);

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

  // 2. Validação da Assinatura HMAC de Segurança
  const xSignature = request.headers.get('x-signature');
  const xRequestId = request.headers.get('x-request-id');
  const secretConfigurado = obterSecretWebhook();

  if (secretConfigurado) {
    if (!xSignature || !xRequestId) {
      logger.security('REJEITADO: Webhook sem cabeçalhos x-signature/x-request-id', { ip, paymentId });
      const duracao = Date.now() - inicioTimestamp;
      await registrarLogWebhook(supabase, {
        tipo_evento: 'payment',
        data_id: String(paymentId),
        status_resposta: 401,
        erro: 'Cabeçalhos de assinatura HMAC ausentes',
        ip,
        duracao_ms: duracao,
        payload: body,
      });
      return NextResponse.json({ erro: 'Assinatura ausente' }, { status: 401 });
    }

    const assinaturaValida = validarAssinaturaWebhook(xSignature, xRequestId, String(paymentId));
    if (!assinaturaValida) {
      logger.security('ALERTA DE SEGURANÇA: Assinatura HMAC inválida no Webhook Mercado Pago', { ip, paymentId });
      const duracao = Date.now() - inicioTimestamp;
      await registrarLogWebhook(supabase, {
        tipo_evento: 'payment',
        data_id: String(paymentId),
        request_id: xRequestId,
        assinatura: xSignature,
        status_resposta: 401,
        erro: 'Assinatura HMAC inválida',
        ip,
        duracao_ms: duracao,
        payload: body,
      });
      return NextResponse.json({ erro: 'Assinatura inválida' }, { status: 401 });
    }
  }

  try {
    // 3. Consulta Direta e Oficial à API do Mercado Pago (Fonte Única de Verdade)
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
      return NextResponse.json({ erro: 'Falha ao consultar gateway' }, { status: 502 });
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
    const gatewayPaymentId = String(payment.id);
    const metodoPagamento = payment.payment_method_id || payment.payment_type_id || 'mercadopago';

    logger.info(`Webhook recebido para pagamento ${gatewayPaymentId}`, {
      status: statusPagamento,
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
        resultado: `Status ${statusPagamento} processado com sucesso`,
        ip,
        duracao_ms: duracao,
        payload: { status: statusPagamento, gateway_id: gatewayPaymentId },
      });
      return NextResponse.json({ recebido: true, status: statusPagamento }, { status: 200 });
    }

    // Se o pagamento ainda está pendente / em análise
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

    // 5. Pagamento APROVADO: Resolução do ID do Pedido (external_reference)
    let orderId = payment.external_reference;
    let metadata = payment.metadata as Record<string, unknown> | undefined;

    // Se o external_reference antigo continha um JSON serializado, tenta extrair os metadados
    if (orderId && !UUID_REGEX.test(orderId)) {
      try {
        const parsed = JSON.parse(orderId);
        metadata = { ...metadata, ...parsed };
        orderId = parsed.pedido_id || parsed.order_id;
      } catch {
        // Ignora erro de parse
      }
    }

    // Se ainda não temos um orderId com UUID válido, tenta buscar pedido existente por preference_id ou comprador/lote
    let pedidoEncontrado = null;
    if (orderId && UUID_REGEX.test(orderId)) {
      const { data: p } = await supabase.from('pedidos').select('*').eq('id', orderId).maybeSingle();
      pedidoEncontrado = p;
    }

    if (!pedidoEncontrado && metadata?.pedido_id && typeof metadata.pedido_id === 'string' && UUID_REGEX.test(metadata.pedido_id)) {
      const { data: p } = await supabase.from('pedidos').select('*').eq('id', metadata.pedido_id).maybeSingle();
      pedidoEncontrado = p;
      orderId = metadata.pedido_id;
    }

    // Se não encontrou pedido prévio no banco (caso de pagamentos legados ou orfãos)
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

    // 6. Geração de Hashes Seguras e Únicas para os Ingressos
    const qrHashes: string[] = [];
    for (let i = 0; i < quantidade; i++) {
      qrHashes.push(gerarHashIngresso(`${eventoId}-${gatewayPaymentId}-${i}-${Date.now()}`, eventoId));
    }

    // 7. Se não havia pedido na tabela 'pedidos', cria um agora para manter consistência
    let finalOrderId = pedidoEncontrado?.id;
    if (!finalOrderId) {
      const valorUnitarioCalculado = Number(payment.transaction_amount || 0) / quantidade;
      const { data: novoPed } = await supabase
        .from('pedidos')
        .insert({
          comprador_id: compradorId,
          evento_id: eventoId,
          lote_id: loteId,
          quantidade,
          valor_unitario: valorUnitarioCalculado,
          valor_total: Number(payment.transaction_amount || 0),
          status: 'aprovado',
          gateway_payment_id: gatewayPaymentId,
          metodo_pagamento: metodoPagamento,
          pago_em: new Date().toISOString(),
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
        valorUnitario: Number(payment.transaction_amount || 0) / quantidade,
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
      resultado: resultado.ja_processado ? 'Pagamento já processado (idempotente)' : 'Ingressos liberados com sucesso',
      ip,
      duracao_ms: duracao,
      payload: {
        pedido_id: finalOrderId,
        gateway_id: gatewayPaymentId,
        quantidade,
        ingressos_ids: resultado.ingressos_ids,
      },
    });

    logger.info('Webhook processado com sucesso!', {
      gatewayPaymentId,
      pedidoId: finalOrderId,
      ja_processado: resultado.ja_processado,
    });

    return NextResponse.json(
      {
        recebido: true,
        sucesso: true,
        ja_processado: Boolean(resultado.ja_processado),
        pedido_id: finalOrderId,
        mensagem: resultado.ja_processado
          ? 'Pagamento já processado anteriormente.'
          : 'Ingressos gerados e creditados com sucesso!',
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error('Erro crítico não tratado no Webhook Mercado Pago', error);
    const duracao = Date.now() - inicioTimestamp;
    await registrarLogWebhook(supabase, {
      tipo_evento: 'payment',
      data_id: String(paymentId),
      status_resposta: 500,
      erro: error instanceof Error ? error.message : 'Erro interno do servidor',
      ip,
      duracao_ms: duracao,
    });
    return NextResponse.json({ erro: 'Erro interno ao processar notificação' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok', servico: 'Webhook Mercado Pago MeuIngrss' }, { status: 200 });
}
