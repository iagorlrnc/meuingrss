import { NextRequest, NextResponse } from 'next/server';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { criarClienteServidor } from '@/lib/supabase/servidor';
import { logger } from '@/lib/logger';
import { verificarRateLimit } from '@/lib/rateLimit';
import crypto from 'crypto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1';

  // 1. Rate Limiting: Máximo de 20 solicitações por minuto por IP
  const rateLimit = verificarRateLimit(`checkout_loja_free_${ip}`, { janelaMs: 60000, maxRequisicoes: 20 });
  if (!rateLimit.permitido) {
    logger.warn('Rate limit excedido na compra de produto gratuito da loja', { ip });
    return NextResponse.json(
      { erro: 'Muitas tentativas em curto intervalo. Aguarde um minuto.' },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const { itens, comprador_id } = body;

    // 2. Autenticação e proteção IDOR
    const supabaseServidor = await criarClienteServidor();
    const { data: { user }, error: erroAuth } = await supabaseServidor.auth.getUser();

    if (erroAuth || !user) {
      logger.security('Tentativa não autorizada de resgatar produto gratuito da loja', { ip });
      return NextResponse.json({ erro: 'Autenticação necessária para realizar o pedido.' }, { status: 401 });
    }

    const userId = user.id;
    if (comprador_id && comprador_id !== userId) {
      const { data: perfil } = await supabaseServidor.from('profiles').select('role').eq('id', userId).single();
      if (!perfil || perfil.role !== 'admin') {
        logger.security('IDOR prevenido ao resgatar produto gratuito da loja', { caller: userId, target: comprador_id });
        return NextResponse.json({ erro: 'Ação não autorizada para este comprador.' }, { status: 403 });
      }
    }

    // 3. Validação dos itens
    if (!Array.isArray(itens) || itens.length === 0) {
      return NextResponse.json({ erro: 'Nenhum item informado para a compra gratuita.' }, { status: 400 });
    }

    const admin = criarClienteAdmin();

    let atleticaIdPrincipal: string | null = null;
    let totalCentavos = 0;
    const itensValidados: {
      product_id: string;
      name: string;
      size: string | null;
      quantity: number;
      price_cents: number;
      subtotal_cents: number;
      current_stock: number;
    }[] = [];

    // 4. Validação de cada produto no banco de dados
    for (const item of itens) {
      const { product_id, size, quantity } = item;
      if (!product_id || !UUID_REGEX.test(product_id)) {
        return NextResponse.json({ erro: 'Identificador de produto inválido.' }, { status: 400 });
      }

      const qtd = parseInt(String(quantity), 10);
      if (isNaN(qtd) || qtd !== 1) {
        return NextResponse.json(
          { erro: 'Produtos gratuitos possuem limite estrito de apenas 1 unidade por usuário.' },
          { status: 400 }
        );
      }

      const { data: prod, error: errProd } = await admin
        .from('store_products')
        .select('id, name, price, stock_quantity, is_active, atletica_id')
        .eq('id', product_id)
        .single();

      if (errProd || !prod || !prod.is_active) {
        return NextResponse.json({ erro: `Produto "${prod?.name || 'solicitado'}" indisponível ou inativo.` }, { status: 400 });
      }

      if (prod.stock_quantity < qtd) {
        return NextResponse.json({
          erro: `Estoque insuficiente para o produto "${prod.name}". Disponível: ${prod.stock_quantity}.`,
        }, { status: 400 });
      }

      // Validação Anti-Tampering de Preço: Se o produto não for gratuito, deve ir pelo fluxo pago
      if (Number(prod.price) !== 0) {
        logger.security('Tentativa de resgatar produto pago via endpoint gratuito', {
          productId: prod.id,
          preco: prod.price,
          userId,
        });
        return NextResponse.json(
          { erro: `O produto "${prod.name}" não é gratuito. Prossiga pelo fluxo de pagamento regular.` },
          { status: 400 }
        );
      }

      // Checa se o usuário já resgatou este produto gratuito anteriormente
      const { data: resgatesAnteriores } = await admin
        .from('store_order_items')
        .select('id, store_orders!inner(id, user_id, status)')
        .eq('product_id', prod.id)
        .eq('store_orders.user_id', userId)
        .in('store_orders.status', ['paid', 'pending_payment'])
        .limit(1);

      if (resgatesAnteriores && resgatesAnteriores.length > 0) {
        return NextResponse.json(
          { erro: `Você já resgatou o produto gratuito "${prod.name}". O limite é de 1 unidade por usuário.` },
          { status: 400 }
        );
      }

      if (!atleticaIdPrincipal && prod.atletica_id) {
        atleticaIdPrincipal = prod.atletica_id;
      }

      const precoUnit = prod.price; // 0
      const subtotalItem = precoUnit * qtd; // 0
      totalCentavos += subtotalItem;

      itensValidados.push({
        product_id: prod.id,
        name: prod.name,
        size: size ? String(size).trim() : null,
        quantity: qtd,
        price_cents: precoUnit,
        subtotal_cents: subtotalItem,
        current_stock: prod.stock_quantity,
      });
    }

    if (totalCentavos !== 0) {
      return NextResponse.json({ erro: 'Valor do pedido gratuito inválido.' }, { status: 400 });
    }

    // 5. Criação do Pedido
    const orderId = crypto.randomUUID();
    const agoraIso = new Date().toISOString();

    const { data: orderCriado, error: errOrder } = await admin
      .from('store_orders')
      .insert({
        id: orderId,
        user_id: userId,
        atletica_id: atleticaIdPrincipal,
        status: 'paid',
        payment_method: 'gratuito',
        total_amount: 0,
        paid_at: agoraIso,
        mercado_pago_payment_id: `gratuito_${orderId}`,
        metadata: {
          tipo: 'loja',
          gratuito: true,
          data_aprovacao: agoraIso,
        },
      })
      .select('id')
      .single();

    if (errOrder || !orderCriado) {
      logger.error('Erro ao registrar store_order gratuito', { erro: errOrder?.message });
      return NextResponse.json({ erro: 'Falha ao registrar pedido gratuito.' }, { status: 500 });
    }

    // 6. Insere itens do pedido
    const orderItemsRows = itensValidados.map((item) => ({
      order_id: orderId,
      product_id: item.product_id,
      product_name_snapshot: item.name,
      size: item.size,
      quantity: item.quantity,
      unit_price_snapshot: item.price_cents,
      subtotal: item.subtotal_cents,
    }));

    const { error: errItems } = await admin.from('store_order_items').insert(orderItemsRows);
    if (errItems) {
      logger.error('Erro ao registrar itens do pedido gratuito', { erro: errItems?.message });
    }

    // 7. Débito de Estoque Atômico e Resiliente
    for (const item of itensValidados) {
      const novoEstoque = Math.max(0, item.current_stock - item.quantity);
      const { error: errUpdateStock } = await admin
        .from('store_products')
        .update({ stock_quantity: novoEstoque })
        .eq('id', item.product_id);

      if (errUpdateStock) {
        logger.error(`Erro ao debitar estoque do produto ${item.product_id}`, { erro: errUpdateStock?.message });
      }
    }

    // 8. Limpa carrinho ativo do usuário
    try {
      const { data: userCart } = await admin
        .from('store_carts')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle();

      if (userCart) {
        await admin.from('store_cart_items').delete().eq('cart_id', userCart.id);
        await admin.from('store_carts').update({ status: 'converted' }).eq('id', userCart.id);
      }
    } catch (cartErr) {
      logger.warn('Erro não-bloqueante ao converter carrinho pós pedido gratuito', {
        erro: cartErr instanceof Error ? cartErr.message : String(cartErr),
      });
    }

    logger.info('Pedido gratuito da loja concluído com sucesso', { orderId, userId, itens: itensValidados.length });

    return NextResponse.json({
      sucesso: true,
      order_id: orderId,
      mensagem: 'Pedido gratuito confirmado com sucesso!',
    });
  } catch (err: unknown) {
    logger.error('Erro inesperado no checkout de produto gratuito da loja', {
      erro: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { erro: 'Erro interno ao processar pedido gratuito. Tente novamente.' },
      { status: 500 }
    );
  }
}
