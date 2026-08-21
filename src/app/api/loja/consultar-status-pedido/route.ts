import { NextRequest, NextResponse } from 'next/server';
import { paymentClient, ehMercadoPagoConfigurado } from '@/lib/mercadopago';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { criarClienteServidor } from '@/lib/supabase/servidor';
import { logger } from '@/lib/logger';
import { verificarRateLimit } from '@/lib/rateLimit';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1';

  // Rate limit
  const rateLimit = verificarRateLimit(`status_loja_pedido_${ip}`, { janelaMs: 60000, maxRequisicoes: 60 });
  if (!rateLimit.permitido) {
    return NextResponse.json({ erro: 'Muitas consultas. Aguarde um momento.' }, { status: 429 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const orderId = searchParams.get('order_id') || searchParams.get('pedido_id');
    const paymentIdParam = searchParams.get('payment_id');

    // 0. Autenticação
    const supabaseServidor = await criarClienteServidor();
    const { data: { user } } = await supabaseServidor.auth.getUser();

    if (!user) {
      return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 });
    }

    if (!orderId && !paymentIdParam) {
      return NextResponse.json({ status_pedido: null, mensagem: 'Identificador do pedido ausente.' });
    }

    const admin = criarClienteAdmin();
    let order: Record<string, any> | null = null;

    // 1. Busca local por order_id
    if (orderId && UUID_REGEX.test(orderId)) {
      const { data: o } = await admin
        .from('store_orders')
        .select(`
          id,
          user_id,
          atletica_id,
          status,
          payment_method,
          total_amount,
          mercado_pago_payment_id,
          paid_at,
          created_at,
          items:store_order_items(*)
        `)
        .eq('id', orderId)
        .maybeSingle();

      order = o;
    }

    // 1.1 Busca local por mercado_pago_payment_id
    if (!order && paymentIdParam) {
      const { data: o } = await admin
        .from('store_orders')
        .select(`
          id,
          user_id,
          atletica_id,
          status,
          payment_method,
          total_amount,
          mercado_pago_payment_id,
          paid_at,
          created_at,
          items:store_order_items(*)
        `)
        .eq('mercado_pago_payment_id', String(paymentIdParam))
        .maybeSingle();

      order = o;
    }

    // Validação IDOR
    if (order && order.user_id !== user.id) {
      const { data: perfil } = await supabaseServidor.from('profiles').select('role').eq('id', user.id).single();
      if (!perfil || perfil.role !== 'admin') {
        return NextResponse.json({ erro: 'Acesso não autorizado a este pedido.' }, { status: 403 });
      }
    }

    // 2. Se o pedido já está pago
    if (order && order.status === 'paid') {
      return NextResponse.json({
        status_pedido: 'paid',
        mensagem: 'Pagamento confirmado com sucesso!',
        order_id: order.id,
        total_amount: order.total_amount,
        paid_at: order.paid_at,
      });
    }

    // 2.1 Se o pedido falhou ou foi cancelado
    if (order && ['failed', 'cancelled', 'refunded', 'stock_unavailable'].includes(order.status)) {
      return NextResponse.json({
        status_pedido: order.status,
        mensagem: order.status === 'stock_unavailable'
          ? 'Estoque esgotado durante o processamento. O valor será estornado.'
          : 'O pagamento foi cancelado ou recusado.',
        order_id: order.id,
      });
    }

    // 3. Reconciliação com o Mercado Pago
    if (ehMercadoPagoConfigurado()) {
      const targetPaymentId = paymentIdParam || order?.mercado_pago_payment_id;

      if (targetPaymentId) {
        try {
          const mpPayment = await paymentClient.get({ id: String(targetPaymentId) });
          if (mpPayment) {
            const statusMp = String(mpPayment.status || '');

            if (statusMp === 'approved' && order?.id) {
              // Executa confirmação atômica via RPC
              const { data: rpcRes } = await admin.rpc('processar_pedido_loja_aprovado', {
                p_order_id: order.id,
                p_gateway_payment_id: String(mpPayment.id),
                p_payment_method: String(mpPayment.payment_method_id || 'pix'),
              });

              if (rpcRes?.sucesso) {
                return NextResponse.json({
                  status_pedido: 'paid',
                  mensagem: 'Pagamento confirmado e confirmado com sucesso!',
                  order_id: order.id,
                  total_amount: order.total_amount,
                });
              }
            } else if (['rejected', 'cancelled', 'refunded', 'charged_back'].includes(statusMp) && order?.id) {
              await admin.from('store_orders').update({ status: 'failed' }).eq('id', order.id);
              return NextResponse.json({
                status_pedido: 'failed',
                mensagem: 'O pagamento foi cancelado ou recusado pela instituição financeira.',
                order_id: order.id,
              });
            }
          }
        } catch (mpErr) {
          logger.warn('Erro ao consultar status da loja no Mercado Pago', { targetPaymentId, erro: mpErr });
        }
      }
    }

    return NextResponse.json({
      status_pedido: 'pending_payment',
      mensagem: 'Aguardando confirmação do pagamento pelo gateway...',
      order_id: order?.id || orderId,
    });
  } catch (error) {
    logger.error('Erro no GET /api/loja/consultar-status-pedido', error);
    return NextResponse.json({ erro: 'Falha interna ao consultar status do pedido' }, { status: 500 });
  }
}
