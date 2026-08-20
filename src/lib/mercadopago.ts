import { MercadoPagoConfig, Payment } from 'mercadopago';
import crypto from 'crypto';
import { logger } from './logger';

// Inicializa a configuração do Mercado Pago com o Access Token de Produção ou Teste
const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN || '';

export const mercadopagoClient = new MercadoPagoConfig({
  accessToken: accessToken || 'UNCONFIGURED',
  options: {
    timeout: 10000,
  },
});

export const paymentClient = new Payment(mercadopagoClient);

/**
 * Verifica se as credenciais do Mercado Pago estão devidamente configuradas no ambiente.
 */
export function ehMercadoPagoConfigurado(): boolean {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  return Boolean(
    token &&
    !token.includes('placeholder') &&
    !token.startsWith('TEST-0000000000000000') &&
    token.length > 10
  );
}

/**
 * Obtém a chave secreta HMAC do webhook sanitizada
 */
export function obterSecretWebhook(): string | null {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) return null;
  // Se estiver erroneamente preenchido com a URL do endpoint, ignora a chave inválida e registra alerta
  if (secret.startsWith('http://') || secret.startsWith('https://')) {
    logger.warn(
      'MERCADOPAGO_WEBHOOK_SECRET no .env.local está preenchido com uma URL em vez do Secret Key do Mercado Pago. HMAC desativado até correção.',
      { secretInformado: secret }
    );
    return null;
  }
  return secret;
}

/**
 * Valida a assinatura HMAC de segurança enviada pelo Mercado Pago no cabeçalho `x-signature`
 */
export function validarAssinaturaWebhook(
  xSignatureHeader: string | null,
  xRequestIdHeader: string | null,
  dataId: string,
  secretOverride?: string
): boolean {
  const secret = secretOverride || obterSecretWebhook();
  
  // FAIL-CLOSED: Se a chave secreta HMAC do webhook não estiver configurada no .env, REJEITAR por padrão (segurança estrita)
  if (!secret) {
    logger.security('REJEITADO: MERCADOPAGO_WEBHOOK_SECRET não configurado para validação HMAC do webhook.');
    return false;
  }
  if (!xSignatureHeader || !xRequestIdHeader || !dataId) return false;

  try {
    const parts = xSignatureHeader.split(',');
    let ts = '';
    let hashV1 = '';

    for (const part of parts) {
      const [key, value] = part.split('=').map((s) => s.trim());
      if (key === 'ts') ts = value;
      if (key === 'v1') hashV1 = value;
    }

    if (!ts || !hashV1) return false;

    // Proteção contra Replay Attack: Rejeita mensagens com timestamp com diferença maior que 10 minutos (600s)
    const tsNumber = parseInt(ts, 10);
    if (isNaN(tsNumber)) return false;
    const agoraSegundos = Math.floor(Date.now() / 1000);
    if (Math.abs(agoraSegundos - tsNumber) > 600) {
      logger.security('Replay attack prevenido no webhook Mercado Pago (timestamp expirado)', { ts, agoraSegundos });
      return false;
    }

    const manifest = `id:${dataId};request-id:${xRequestIdHeader};ts:${ts};`;
    const computedHmac = crypto
      .createHmac('sha256', secret)
      .update(manifest)
      .digest('hex');

    const bufferComputado = Buffer.from(computedHmac, 'hex');
    const bufferEnviado = Buffer.from(hashV1, 'hex');

    if (bufferComputado.length !== bufferEnviado.length) {
      return false;
    }

    return crypto.timingSafeEqual(bufferComputado, bufferEnviado);
  } catch (error) {
    logger.error('Erro ao verificar assinatura HMAC do webhook Mercado Pago', error);
    return false;
  }
}

/**
 * Traduz o status_detail do Mercado Pago para mensagens claras em português.
 */
export function traduzirStatusRecusaCartao(statusDetail?: string): string {
  if (!statusDetail) return 'O pagamento foi recusado. Tente novamente ou use outro cartão.';

  const mapaMensagens: Record<string, string> = {
    cc_rejected_bad_filled_card_number: 'Número do cartão inválido. Verifique os dados.',
    cc_rejected_bad_filled_date: 'Data de expiração inválida. Verifique o mês e ano.',
    cc_rejected_bad_filled_other: 'Dados do cartão incorretos. Verifique e tente novamente.',
    cc_rejected_bad_filled_security_code: 'Código de segurança (CVV) inválido.',
    cc_rejected_call_for_authorize: 'Autorização necessária. Ligue para a operadora do seu cartão para autorizar o pagamento.',
    cc_rejected_card_disabled: 'Cartão desativado ou bloqueado. Ligue para o seu banco para reativar ou tente outro cartão.',
    cc_rejected_card_error: 'Não foi possível processar o pagamento com este cartão. Tente outro cartão.',
    cc_rejected_card_type_not_allowed: 'O tipo de cartão informado não é aceito. Por favor, utilize um cartão de crédito válido.',
    cc_rejected_duplication_payment: 'Detectado pagamento duplicado em curto período. Aguarde alguns instantes antes de tentar novamente.',
    cc_rejected_duplicated_payment: 'Detectado pagamento duplicado em curto período. Aguarde alguns instantes antes de tentar novamente.',
    cc_rejected_high_risk: 'Pagamento recusado por políticas de prevenção a fraudes. Tente outro meio de pagamento.',
    cc_rejected_2_step_high_risk: 'Pagamento recusado por políticas de segurança. Tente outro meio de pagamento ou Pix.',
    cc_rejected_insufficient_amount: 'Saldo ou limite insuficiente no cartão.',
    cc_rejected_invalid_installments: 'Número de parcelas não suportado para este cartão.',
    cc_rejected_max_attempts: 'Limite de tentativas excedido para este cartão. Tente novamente mais tarde ou use outro cartão.',
    cc_rejected_blacklist: 'O pagamento não pôde ser processado. Tente outro meio de pagamento.',
    cc_rejected_other_reason: 'O cartão foi recusado pelo banco emissor. Tente outro cartão ou entre em contato com seu banco.',
    pending_contingency: 'Seu pagamento está sendo processado pela operadora do cartão. Avisaremos assim que for concluído.',
    pending_review_manual: 'Seu pagamento está em análise de segurança. Avisaremos assim que for liberado.',
  };

  return mapaMensagens[statusDetail] || 'O pagamento foi recusado pelo gateway. Tente outro cartão ou Pix.';
}

