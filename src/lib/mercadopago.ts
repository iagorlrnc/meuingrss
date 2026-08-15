import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import crypto from 'crypto';
import { logger } from './logger';

// Inicializa a configuração do Mercado Pago com o Access Token de Produção ou Teste
const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN || '';

export const mercadopagoClient = new MercadoPagoConfig({
  accessToken: accessToken || 'TEST-0000000000000000-000000-00000000000000000000000000000000-00000000',
  options: {
    timeout: 10000,
  },
});

export const preferenceClient = new Preference(mercadopagoClient);
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
