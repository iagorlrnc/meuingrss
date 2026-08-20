import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

/**
 * [DEPRECATED / MIGRAÇÃO CHECKOUT TRANSPARENTE]
 * Esta rota de criação de preferências do Checkout Pro foi descontinuada.
 * Toda a emissão de cobranças foi migrada para a arquitetura de Checkout Transparente:
 * - Pagamento Pix: /api/payments/pix
 * - Pagamento Cartão: /api/payments/card
 * - Ingressos Gratuitos: /api/payments/gratuito
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    logger.warn('Chamada a endpoint descontinuado /api/criar-sessao-pagamento detectada', { body });

    return NextResponse.json(
      {
        erro: 'O endpoint legado de Checkout Pro foi descontinuado. Utilize o Checkout Transparente (/api/payments/pix, /api/payments/card ou /api/payments/gratuito).',
        migrado: true,
      },
      { status: 410 }
    );
  } catch {
    return NextResponse.json({ erro: 'Endpoint descontinuado.' }, { status: 410 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'deprecated',
    mensagem: 'Utilize os endpoints do Checkout Transparente.',
  }, { status: 410 });
}
