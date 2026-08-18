import { NextRequest, NextResponse } from 'next/server';
import {
  obterIPCliente,
  verificarRateLimit,
  registrarErroRateLimit,
  registrarSucessoRateLimit,
  verificarRateLimitEmailRecuperacao,
  registrarEnvioEmailRecuperacao,
} from '@/lib/rateLimit';
import { validarTurnstileToken } from '@/lib/turnstile';

export async function GET(request: NextRequest) {
  const ip = obterIPCliente(request);
  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');

  // Se informou e-mail, checa primeiro se o e-mail está em cooldown/bloqueado
  if (email) {
    const statusEmail = verificarRateLimitEmailRecuperacao(email);
    if (statusEmail.bloqueado) {
      return NextResponse.json(statusEmail, { status: 429 });
    }
  }

  const status = verificarRateLimit(ip);
  if (status.bloqueado) {
    return NextResponse.json(status, { status: 429 });
  }
  return NextResponse.json(status);
}

export async function POST(request: NextRequest) {
  const ip = obterIPCliente(request);

  try {
    const body = await request.json();
    const acao = body.acao;
    const ehAdmin = body.tipo === 'admin' || body.ehAdmin === true;
    const turnstileToken = body.turnstileToken;
    const email = body.email;

    // 1. Ação específica: Registrar envio bem-sucedido de recuperação de senha para o e-mail
    if (acao === 'registrar_recuperacao') {
      if (email) {
        const statusEmail = registrarEnvioEmailRecuperacao(email);
        return NextResponse.json(statusEmail);
      }
      return NextResponse.json({ bloqueado: false, segundosRestantes: 60 });
    }

    // 2. Ação específica: Verificar se o e-mail ou IP estão bloqueados antes de enviar recuperação
    if (acao === 'verificar_recuperacao') {
      // Checagem de Captcha Turnstile
      if (turnstileToken) {
        const captchaValido = await validarTurnstileToken(turnstileToken, ip);
        if (!captchaValido) {
          return NextResponse.json(
            { bloqueado: true, segundosRestantes: 0, tentativasConsecutivas: 0, mensagem: 'Verificação de segurança (captcha) falhou. Recarregue a página e tente novamente.' },
            { status: 403 }
          );
        }
      }

      // Checagem de Rate Limit por IP
      const statusIp = verificarRateLimit(ip);
      if (statusIp.bloqueado) {
        return NextResponse.json(statusIp, { status: 429 });
      }

      // Checagem de Rate Limit específico para o E-mail solicitado
      if (email) {
        const statusEmail = verificarRateLimitEmailRecuperacao(email);
        if (statusEmail.bloqueado) {
          return NextResponse.json(statusEmail, { status: 429 });
        }
      }

      return NextResponse.json({ bloqueado: false, segundosRestantes: 0 });
    }

    // 3. Validação de Captcha Turnstile na tentativa de login/cadastro (ação 'verificar')
    if (acao === 'verificar' && turnstileToken) {
      const captchaValido = await validarTurnstileToken(turnstileToken, ip);
      if (!captchaValido) {
        return NextResponse.json(
          { bloqueado: true, segundosRestantes: 0, tentativasConsecutivas: 0, mensagem: 'Verificação de segurança (captcha) falhou. Recarregue a página e tente novamente.' },
          { status: 403 }
        );
      }
    }

    if (acao === 'registrar_erro') {
      const status = registrarErroRateLimit(ip, ehAdmin);
      if (status.bloqueado) {
        return NextResponse.json(status, { status: 429 });
      }
      return NextResponse.json(status);
    } else if (acao === 'registrar_sucesso') {
      registrarSucessoRateLimit(ip);
      return NextResponse.json({
        bloqueado: false,
        segundosRestantes: 0,
        tentativasConsecutivas: 0,
      });
    } else {
      const status = verificarRateLimit(ip);
      if (status.bloqueado) {
        return NextResponse.json(status, { status: 429 });
      }
      return NextResponse.json(status);
    }
  } catch {
    const status = verificarRateLimit(ip);
    return NextResponse.json(status);
  }
}
