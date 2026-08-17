import { NextRequest, NextResponse } from 'next/server';
import { paymentClient, validarAssinaturaWebhook, obterSecretWebhook } from '@/lib/mercadopago';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { gerarHashIngresso } from '@/lib/gerarQrCode';
import { logger } from '@/lib/logger';
import { enviarNotificacaoIngressoLiberado } from '@/lib/notificacoes';
import { verificarRateLimit } from '@/lib/rateLimit';
import { processarAprovadoAuxiliar, processarEstornoAuxiliar } from '@/lib/processarPagamento';

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1';

  // Rate limit para o webhook público: até 60 requisições por minuto por IP
  const rateLimit = verificarRateLimit(`webhook_mp_${ip}`, { janelaMs: 60000, maxRequisicoes: 60 });
  if (!rateLimit.permitido) {
    logger.warn('Rate limit excedido no endpoint Webhook Mercado Pago', { ip });
    return NextResponse.json({ erro: 'Muitas requisições. Tente novamente mais tarde.' }, { status: 429 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    let body: Record<string, unknown> = {};

    try {
      body = await request.json();
    } catch {
      // O corpo pode vir vazio em notificações IPN legadas
    }

    const bodyData = body?.data as { id?: string | number } | undefined;
    const bodyType = typeof body?.type === 'string' ? body.type : undefined;

    // 1. Extração do ID do Pagamento e Tópico
    const paymentId =
      bodyData?.id ||
      searchParams.get('data.id') ||
      searchParams.get('id') ||
      (bodyType === 'payment' && typeof body?.id === 'string' ? body.id : null);

    const notificationType = bodyType || searchParams.get('type') || searchParams.get('topic');

    // Notificações de teste ou tópicos irrelevantes
    if (!paymentId || (notificationType && notificationType !== 'payment')) {
      logger.info('Notificação de webhook ignorada (teste ou tipo diferente de payment)', {
        notificationType,
        paymentId,
      });
      return NextResponse.json({ recebido: true, mensagem: 'Notificação de teste ou tipo ignorado' }, { status: 200 });
    }

    // 2. Validação da Assinatura HMAC
    const xSignature = request.headers.get('x-signature');
    const xRequestId = request.headers.get('x-request-id');
    const secretConfigurado = obterSecretWebhook();

    if (secretConfigurado) {
      if (!xSignature || !xRequestId) {
        logger.security('REJEITADO: Notificação de webhook sem cabeçalhos de assinatura obrigatórios', {
          ip,
          paymentId,
          xSignaturePresente: Boolean(xSignature),
          xRequestIdPresente: Boolean(xRequestId),
        });
        return NextResponse.json({ erro: 'Assinatura do webhook ausente' }, { status: 401 });
      }

      const assinaturaValida = validarAssinaturaWebhook(xSignature, xRequestId, String(paymentId));
      if (!assinaturaValida) {
        logger.security('ALERTA DE SEGURANÇA: Assinatura HMAC inválida no Webhook Mercado Pago', {
          ip,
          paymentId,
        });
        return NextResponse.json({ erro: 'Assinatura do webhook inválida' }, { status: 401 });
      }
    }

    // 3. Verificação Direta com a API Oficial do Mercado Pago
    let payment: Awaited<ReturnType<typeof paymentClient.get>>;
    try {
      payment = await paymentClient.get({ id: String(paymentId) });
    } catch (mpErr) {
      logger.error(`Erro ao consultar pagamento ${paymentId} na API do Mercado Pago`, mpErr, { paymentId });
      return NextResponse.json({ erro: 'Não foi possível consultar o pagamento no gateway' }, { status: 502 });
    }

    if (!payment) {
      logger.error(`Pagamento ${paymentId} não localizado no Mercado Pago`, null, { paymentId });
      return NextResponse.json({ erro: 'Pagamento não localizado' }, { status: 404 });
    }

    const statusPagamento = String(payment.status || '');
    const gatewayTransactionId = String(payment.id);

    logger.info(`Webhook recebido para o pagamento ${gatewayTransactionId}`, {
      status: statusPagamento,
      metodo: payment.payment_method_id,
      valor: payment.transaction_amount,
    });

    const supabase = criarClienteAdmin();

    // 4. Máquina de Estados: Tratar Pagamentos Estornados, Cancelados ou Recusados
    if (['refunded', 'charged_back', 'cancelled', 'rejected'].includes(statusPagamento)) {
      logger.warn(`Pagamento ${gatewayTransactionId} alterado para estado de estorno/cancelamento (${statusPagamento})`, {
        gateway_transaction_id: gatewayTransactionId,
        status: statusPagamento,
      });

      const resEstorno = await processarEstornoAuxiliar(supabase, gatewayTransactionId, statusPagamento);

      return NextResponse.json(
        { recebido: true, sucesso: true, mensagem: `Status ${statusPagamento} processado com sucesso`, detalhes: resEstorno },
        { status: 200 }
      );
    }

    // Se o pagamento ainda estiver pendente ou em análise
    if (statusPagamento !== 'approved') {
      logger.info(`Pagamento ${gatewayTransactionId} em estado não finalizado (${statusPagamento})`, {
        gateway_transaction_id: gatewayTransactionId,
        status: statusPagamento,
      });
      return NextResponse.json(
        { recebido: true, status: statusPagamento, mensagem: 'Pagamento ainda não aprovado' },
        { status: 200 }
      );
    }

    // 5. Pagamento Aprovado: Extração e Validação dos Metadados da Compra
    let metadata = payment.metadata as Record<string, string | undefined> | undefined;

    if ((!metadata || !metadata.evento_id) && payment.external_reference) {
      try {
        metadata = JSON.parse(payment.external_reference);
      } catch {
        logger.warn('Falha ao interpretar external_reference JSON no webhook', {
          external_reference: payment.external_reference,
        });
      }
    }

    const evento_id = metadata?.evento_id;
    const lote_id = metadata?.lote_id;
    const comprador_id = metadata?.comprador_id;
    const quantidade = parseInt(metadata?.quantidade || '1', 10);

    if (!evento_id || !lote_id || !comprador_id || isNaN(quantidade) || quantidade < 1) {
      logger.error('Metadados inválidos ou incompletos na notificação do Mercado Pago', null, {
        metadata,
        gatewayTransactionId,
      });
      return NextResponse.json({ recebido: true, erro: 'Metadados inválidos na notificação' }, { status: 200 });
    }

    // 6. Proteção Contra Adulteração de Preço (Price Tampering Validation)
    const { data: lote, error: erroLote } = await supabase
      .from('lotes_ingresso')
      .select('preco, quantidade_total, quantidade_vendida')
      .eq('id', lote_id)
      .single();

    if (erroLote || !lote) {
      logger.error(`Lote ${lote_id} não encontrado durante o webhook`, erroLote, { lote_id });
      return NextResponse.json({ erro: 'Lote não encontrado' }, { status: 404 });
    }

    const TAXA_PERCENTUAL = 0.12;
    const subtotal = Number(lote.preco) * quantidade;
    const taxaEsperada = Number(lote.preco) === 0 ? 0 : Math.round((subtotal * TAXA_PERCENTUAL) * 100) / 100;
    const valorEsperadoTotal = subtotal + taxaEsperada;
    const valorPagoReal = Number(payment.transaction_amount || payment.transaction_details?.total_paid_amount || 0);

    // Permite tolerância de centavos para arredondamento (R$ 0,05)
    if (valorPagoReal < valorEsperadoTotal - 0.05) {
      logger.security('ALERTA DE FRAUDE DE PREÇO: Valor pago é inferior ao valor do lote', {
        valorPagoReal,
        valorEsperadoTotal,
        lote_id,
        gatewayTransactionId,
      });
      return NextResponse.json({ erro: 'Valor pago incoerente com o preço do lote' }, { status: 400 });
    }

    // 7. Geração Segura das Hashes dos Ingressos
    const qrHashes: string[] = [];
    for (let i = 0; i < quantidade; i++) {
      qrHashes.push(gerarHashIngresso(`${evento_id}-${gatewayTransactionId}-${i}`, evento_id));
    }

    // 8. Processamento Atômico com Fallback Resiliente
    const valorUnitario = Number(lote.preco);
    const metodoPagamento = payment.payment_method_id || payment.payment_type_id || 'mercadopago';

    const resultado = await processarAprovadoAuxiliar(supabase, {
      gatewayTransactionId,
      eventoId: evento_id,
      loteId: lote_id,
      compradorId: comprador_id,
      quantidade,
      valorUnitario,
      metodoPagamento,
      qrHashes,
    });

    if (!resultado.sucesso) {
      logger.error('Falha ao processar pagamento aprovado', null, {
        erro: resultado.erro,
        gatewayTransactionId,
      });
      return NextResponse.json({ erro: resultado.erro || 'Falha ao creditar ingressos' }, { status: 400 });
    }

    logger.info('Pagamento processado e ingressos entregues com sucesso!', {
      gatewayTransactionId,
      ja_processado: resultado.ja_processado,
      quantidade,
    });

    // 9. Envio de Notificação Assíncrona ao Cliente
    enviarNotificacaoIngressoLiberado({
      comprador_id,
      quantidade,
      gateway_transaction_id: gatewayTransactionId,
      email_comprador: payment.payer?.email,
    });

    return NextResponse.json(
      {
        recebido: true,
        sucesso: true,
        ja_processado: Boolean(resultado.ja_processado),
        mensagem: resultado.ja_processado
          ? 'Pagamento já havia sido processado anteriormente.'
          : 'Ingressos gerados e creditados com sucesso!',
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error('Erro crítico não tratado no Webhook Mercado Pago', error);
    return NextResponse.json({ erro: 'Erro interno do servidor ao processar notificação' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok' }, { status: 200 });
}
