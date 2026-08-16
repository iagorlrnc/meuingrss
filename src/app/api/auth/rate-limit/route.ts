import { NextRequest, NextResponse } from 'next/server';
import {
  obterIPCliente,
  verificarRateLimit,
  registrarErroRateLimit,
  registrarSucessoRateLimit,
} from '@/lib/rateLimit';
import { validarTurnstileToken } from '@/lib/turnstile';

export async function GET(request: NextRequest) {
  const ip = obterIPCliente(request);
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

    // Validação de Captcha Turnstile na primeira tentativa de login/cadastro (ação 'verificar')
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
