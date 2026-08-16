import { logger } from './logger';

/**
 * Valida o token do Cloudflare Turnstile no server-side.
 * Deve ser chamado em endpoints que recebem formulários públicos (login, cadastro, checkout).
 *
 * Referência: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */
export async function validarTurnstileToken(token: string, ip?: string): Promise<boolean> {
  const secretKey = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;

  if (!secretKey) {
    // Em desenvolvimento sem chave configurada, permite passagem
    if (process.env.NODE_ENV === 'development') {
      logger.warn('CLOUDFLARE_TURNSTILE_SECRET_KEY não configurado — validação de captcha ignorada em desenvolvimento');
      return true;
    }
    logger.error('CLOUDFLARE_TURNSTILE_SECRET_KEY não configurado em produção', null);
    return false;
  }

  if (!token) {
    return false;
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', token);
    if (ip) {
      formData.append('remoteip', ip);
    }

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    const result = await response.json();

    if (!result.success) {
      logger.security('Validação Turnstile falhou', {
        ip: ip || 'desconhecido',
        errorCodes: result['error-codes']?.join(', ') || 'sem detalhes',
      });
    }

    return result.success === true;
  } catch (error) {
    logger.error('Erro ao validar token Turnstile com a API do Cloudflare', error);
    return false;
  }
}
