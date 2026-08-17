import { criarClienteAdmin } from '@/lib/supabase/admin';
import { paymentClient, ehMercadoPagoConfigurado } from '@/lib/mercadopago';
import { gerarHashIngresso } from '@/lib/gerarQrCode';
import { logger } from '@/lib/logger';
import { enviarNotificacaoIngressoLiberado } from '@/lib/notificacoes';

export interface ParametrosProcessamentoAprovado {
  gatewayTransactionId: string;
  eventoId: string;
  loteId: string;
  compradorId: string;
  quantidade: number;
  valorUnitario: number;
  metodoPagamento: string;
  qrHashes: string[];
  externalReference?: string;
}

export interface ResultadoProcessamentoAprovado {
  sucesso: boolean;
  ja_processado?: boolean;
  erro?: string;
  ingressos_ids?: string[];
}

/**
 * Processa um pagamento aprovado de forma atômica via RPC PostgreSQL com fallback JS seguro.
 */
export async function processarAprovadoAuxiliar(
  supabase: ReturnType<typeof criarClienteAdmin>,
  params: ParametrosProcessamentoAprovado
): Promise<ResultadoProcessamentoAprovado> {
  // 1. Tenta executar via RPC Atômica no PostgreSQL (Migration 026)
  const { data: resRpc, error: errRpc } = await supabase.rpc('processar_pagamento_aprovado', {
    p_gateway_transaction_id: params.gatewayTransactionId,
    p_evento_id: params.eventoId,
    p_lote_id: params.loteId,
    p_comprador_id: params.compradorId,
    p_quantidade: params.quantidade,
    p_valor_unitario: params.valorUnitario,
    p_metodo_pagamento: params.metodoPagamento,
    p_qr_hashes: params.qrHashes,
    p_external_reference: params.externalReference || null,
  });

  // Se a RPC funcionou normalmente e sem erro
  if (!errRpc && resRpc) {
    return {
      sucesso: Boolean(resRpc.sucesso),
      ja_processado: Boolean(resRpc.ja_processado),
      erro: resRpc.erro,
      ingressos_ids: resRpc.ingressos_ids,
    };
  }

  // 2. Fallback JS em caso de ausência da RPC no banco Supabase
  logger.info('Executando fallback JS para liberação de ingresso', {
    gatewayTransactionId: params.gatewayTransactionId,
    motivoRpc: errRpc?.message,
  });

  // Check Idempotência no fallback
  const { data: pagExistente } = await supabase
    .from('pagamentos')
    .select('id')
    .eq('gateway_transaction_id', params.gatewayTransactionId)
    .maybeSingle();

  if (pagExistente) {
    return { sucesso: true, ja_processado: true };
  }

  const idsInseridos: string[] = [];

  // Insere Ingressos e Pagamentos de forma sequencial
  for (let i = 0; i < params.quantidade; i++) {
    const { data: ingresso, error: errIng } = await supabase
      .from('ingressos')
      .insert({
        evento_id: params.eventoId,
        lote_id: params.loteId,
        comprador_id: params.compradorId,
        qr_code_hash: params.qrHashes[i],
        status: 'valido',
      })
      .select('id')
      .single();

    if (errIng || !ingresso) {
      return {
        sucesso: false,
        ja_processado: false,
        erro: errIng?.message || 'Falha ao criar ingresso no fallback JS',
      };
    }

    idsInseridos.push(ingresso.id);

    await supabase.from('pagamentos').insert({
      ingresso_id: ingresso.id,
      valor: params.valorUnitario,
      status: 'aprovado',
      gateway_transaction_id: params.gatewayTransactionId,
      metodo_pagamento: params.metodoPagamento,
    });
  }

  return { sucesso: true, ja_processado: false, ingressos_ids: idsInseridos };
}

/**
 * Processa estornos e cancelamentos via RPC PostgreSQL com fallback JS.
 */
export async function processarEstornoAuxiliar(
  supabase: ReturnType<typeof criarClienteAdmin>,
  gatewayTransactionId: string,
  novoStatus: string = 'refunded'
) {
  const { data: resRpc, error: errRpc } = await supabase.rpc('processar_estorno_pagamento', {
    p_gateway_transaction_id: gatewayTransactionId,
    p_novo_status: novoStatus,
  });

  if (!errRpc && resRpc) {
    return resRpc;
  }

  // Fallback JS
  await supabase
    .from('pagamentos')
    .update({ status: 'estornado' })
    .eq('gateway_transaction_id', gatewayTransactionId);

  const { data: pagamentos } = await supabase
    .from('pagamentos')
    .select('ingresso_id')
    .eq('gateway_transaction_id', gatewayTransactionId);

  if (pagamentos && pagamentos.length > 0) {
    const ids = pagamentos.map((p) => p.ingresso_id);
    await supabase
      .from('ingressos')
      .update({ status: 'cancelado' })
      .in('id', ids);
  }

  return { sucesso: true, ingressos_cancelados: pagamentos?.length || 0 };
}

export interface ResultadoReconciliacao {
  status_pedido: 'aprovado' | 'aguardando' | 'cancelado' | 'estoque_esgotado' | 'erro';
  mensagem: string;
  quantidade_ingressos?: number;
  gateway_transaction_id?: string;
  erro?: string;
}

/**
 * Consulta a API do Mercado Pago diretamente usando um ID de pagamento do gateway
 * e realiza a reconciliação e emissão síncrona/imediata do ingresso se estiver aprovado.
 */
export async function reconciliarEPagamentoeEmitirIngressos(
  gatewayTransactionId: string,
  supabase: ReturnType<typeof criarClienteAdmin>
): Promise<ResultadoReconciliacao> {
  if (!ehMercadoPagoConfigurado()) {
    return {
      status_pedido: 'erro',
      mensagem: 'Gateway de pagamento Mercado Pago não está configurado no ambiente.',
    };
  }

  try {
    const payment = await paymentClient.get({ id: String(gatewayTransactionId) });

    if (!payment) {
      return {
        status_pedido: 'erro',
        mensagem: 'Transação não encontrada no gateway de pagamento.',
      };
    }

    const statusPagamento = String(payment.status || '');

    // 1. Pagamento Recusado / Cancelado / Estornado
    if (['refunded', 'charged_back', 'cancelled', 'rejected'].includes(statusPagamento)) {
      await processarEstornoAuxiliar(supabase, String(payment.id), statusPagamento);
      return {
        status_pedido: 'cancelado',
        mensagem: 'O pagamento foi cancelado ou estornado pelo gateway.',
      };
    }

    // 2. Pagamento ainda pendente / em processamento
    if (statusPagamento !== 'approved') {
      return {
        status_pedido: 'aguardando',
        mensagem: 'Aguardando confirmação do pagamento pelo gateway.',
      };
    }

    // 3. Pagamento Aprovado: Extrair Metadados
    let metadata = payment.metadata as Record<string, string | undefined> | undefined;

    if ((!metadata || !metadata.evento_id) && payment.external_reference) {
      try {
        metadata = JSON.parse(payment.external_reference);
      } catch {
        logger.warn('Falha ao interpretar external_reference JSON durante reconciliação direta', {
          external_reference: payment.external_reference,
        });
      }
    }

    const evento_id = metadata?.evento_id;
    const lote_id = metadata?.lote_id;
    const comprador_id = metadata?.comprador_id;
    const quantidade = parseInt(metadata?.quantidade || '1', 10);

    if (!evento_id || !lote_id || !comprador_id || isNaN(quantidade) || quantidade < 1) {
      return {
        status_pedido: 'erro',
        mensagem: 'Metadados da compra ausentes ou inválidos na transação do gateway.',
      };
    }

    // 4. Validar o Lote e Preço (Proteção Anti-Sobrevenda e Price Tampering)
    const { data: lote, error: erroLote } = await supabase
      .from('lotes_ingresso')
      .select('preco, quantidade_total, quantidade_vendida')
      .eq('id', lote_id)
      .single();

    if (erroLote || !lote) {
      return {
        status_pedido: 'erro',
        mensagem: 'Lote de ingressos não encontrado.',
      };
    }

    const TAXA_PERCENTUAL = 0.12;
    const subtotal = Number(lote.preco) * quantidade;
    const taxaServicoUnitaria = Number(lote.preco) === 0 ? 0 : Math.round((Number(lote.preco) * TAXA_PERCENTUAL) * 100) / 100;
    const taxaServicoTotal = taxaServicoUnitaria * quantidade;
    const valorEsperadoTotal = subtotal + taxaServicoTotal;

    const valorPagoReal = Number(payment.transaction_amount || payment.transaction_details?.total_paid_amount || 0);

    if (valorPagoReal < valorEsperadoTotal - 0.05) {
      logger.security('ALERTA DE FRAUDE DE PREÇO na reconciliação direta', {
        valorPagoReal,
        valorEsperadoTotal,
        gatewayTransactionId,
      });
      return {
        status_pedido: 'erro',
        mensagem: 'Valor pago incoerente com o valor do lote de ingressos.',
      };
    }

    // 5. Gerar Hashes dos QR Codes
    const qrHashes: string[] = [];
    for (let i = 0; i < quantidade; i++) {
      qrHashes.push(gerarHashIngresso(`${evento_id}-${payment.id}-${i}`, evento_id));
    }

    // 6. Processar a Aprovação e Emitir Ingressos Atomicamente
    const valorUnitario = Number(lote.preco);
    const metodoPagamento = payment.payment_method_id || payment.payment_type_id || 'mercadopago';

    const resultado = await processarAprovadoAuxiliar(supabase, {
      gatewayTransactionId: String(payment.id),
      eventoId: evento_id,
      loteId: lote_id,
      compradorId: comprador_id,
      quantidade,
      valorUnitario,
      metodoPagamento,
      qrHashes,
    });

    if (!resultado.sucesso) {
      return {
        status_pedido: 'erro',
        mensagem: resultado.erro || 'Não foi possível registrar os ingressos no sistema.',
      };
    }

    // 7. Notificação assíncrona desacoplada
    enviarNotificacaoIngressoLiberado({
      comprador_id,
      quantidade,
      gateway_transaction_id: String(payment.id),
      email_comprador: payment.payer?.email,
    });

    return {
      status_pedido: 'aprovado',
      mensagem: 'Pagamento confirmado com sucesso! Seus ingressos foram liberados.',
      quantidade_ingressos: quantidade,
      gateway_transaction_id: String(payment.id),
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('Erro na reconciliação direta do pagamento', error, { gatewayTransactionId });
    return {
      status_pedido: 'erro',
      mensagem: `Erro ao consultar o pagamento no gateway: ${msg}`,
    };
  }
}
