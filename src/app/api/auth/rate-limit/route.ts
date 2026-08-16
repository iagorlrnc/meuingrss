import { NextRequest, NextResponse } from 'next/server';
import {
  obterIPCliente,
  verificarRateLimit,
  registrarErroRateLimit,
  registrarSucessoRateLimit,
} from '@/lib/rateLimit';

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
