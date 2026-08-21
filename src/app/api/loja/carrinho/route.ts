import { NextRequest, NextResponse } from 'next/server';
import { criarClienteServidor } from '@/lib/supabase/servidor';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const supabase = await criarClienteServidor();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
    }

    const admin = criarClienteAdmin();

    // 1. Busca carrinho existente do usuário (qualquer status, já que user_id é único)
    let { data: cart } = await admin
      .from('store_carts')
      .select('id, user_id, status, created_at, updated_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!cart) {
      const { data: novoCart, error: errCreate } = await admin
        .from('store_carts')
        .insert({ user_id: user.id, status: 'active' })
        .select()
        .single();

      if (errCreate || !novoCart) {
        logger.error('Erro ao criar carrinho ativo', { erro: errCreate?.message });
        return NextResponse.json({ erro: 'Falha ao inicializar carrinho' }, { status: 500 });
      }
      cart = novoCart;
    } else if (cart.status !== 'active') {
      // Reativa o carrinho existente se foi convertido anteriormente
      await admin
        .from('store_carts')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', cart.id);
      cart.status = 'active';
    }

    if (!cart) {
      return NextResponse.json({ cart: null, items: [] });
    }

    // 2. Busca itens com dados do produto
    const { data: items, error: itemsErr } = await admin
      .from('store_cart_items')
      .select(`
        id,
        cart_id,
        product_id,
        size,
        quantity,
        unit_price_snapshot,
        created_at,
        product:store_products(
          id,
          name,
          description,
          price,
          category,
          images,
          sizes,
          stock_quantity,
          is_active,
          atletica_id,
          atletica:atleticas(id, nome, logo_url, cor_primaria)
        )
      `)
      .eq('cart_id', cart.id)
      .order('created_at', { ascending: true });

    if (itemsErr) {
      logger.error('Erro ao buscar itens do carrinho', { erro: itemsErr?.message });
      return NextResponse.json({ erro: 'Falha ao buscar itens' }, { status: 500 });
    }

    return NextResponse.json({
      cart,
      items: items || [],
    });
  } catch (error) {
    logger.error('Erro no GET /api/loja/carrinho', { erro: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ erro: 'Erro interno ao consultar carrinho' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await criarClienteServidor();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const { product_id, size, quantity = 1, sync_items } = body;
    const admin = criarClienteAdmin();

    // 1. Obter ou criar / reativar carrinho do usuário
    let { data: cart } = await admin
      .from('store_carts')
      .select('id, status')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!cart) {
      const { data: novoCart, error: errCart } = await admin
        .from('store_carts')
        .insert({ user_id: user.id, status: 'active' })
        .select('id, status')
        .single();

      if (errCart || !novoCart) {
        logger.error('Erro ao criar carrinho', { erro: errCart?.message });
        return NextResponse.json({ erro: 'Falha ao criar carrinho' }, { status: 500 });
      }
      cart = novoCart;
    } else if (cart.status !== 'active') {
      await admin
        .from('store_carts')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', cart.id);
      cart.status = 'active';
    }

    if (!cart) {
      return NextResponse.json({ erro: 'Falha ao obter carrinho' }, { status: 500 });
    }

    // 2. Se for uma sincronização em lote (ex: ao fazer login vindo do localStorage)
    if (Array.isArray(sync_items) && sync_items.length > 0) {
      for (const item of sync_items) {
        if (!item.product_id) continue;

        const { data: prod } = await admin
          .from('store_products')
          .select('price, stock_quantity, is_active')
          .eq('id', item.product_id)
          .single();

        if (prod && prod.is_active && prod.stock_quantity > 0) {
          const qtdFinal = prod.price === 0 ? 1 : Math.min(Math.max(1, Number(item.quantity) || 1), prod.stock_quantity);
          const sizeNorm = item.size ? String(item.size).trim() : null;

          // Upsert item
          let queryExist = admin
            .from('store_cart_items')
            .select('id, quantity')
            .eq('cart_id', cart.id)
            .eq('product_id', item.product_id);

          if (sizeNorm) {
            queryExist = queryExist.eq('size', sizeNorm);
          } else {
            queryExist = queryExist.is('size', null);
          }

          const { data: itemExistente } = await queryExist.maybeSingle();

          if (itemExistente) {
            const novaQtd = prod.price === 0 ? 1 : Math.min(itemExistente.quantity + qtdFinal, prod.stock_quantity);
            await admin
              .from('store_cart_items')
              .update({
                quantity: novaQtd,
                unit_price_snapshot: prod.price,
              })
              .eq('id', itemExistente.id);
          } else {
            await admin.from('store_cart_items').insert({
              cart_id: cart.id,
              product_id: item.product_id,
              size: sizeNorm,
              quantity: qtdFinal,
              unit_price_snapshot: prod.price,
            });
          }
        }
      }

      return NextResponse.json({ sucesso: true, mensagem: 'Carrinho sincronizado com sucesso' });
    }

    // 3. Adição individual de produto
    if (!product_id) {
      return NextResponse.json({ erro: 'ID do produto obrigatório' }, { status: 400 });
    }

    const { data: product, error: prodErr } = await admin
      .from('store_products')
      .select('id, name, price, stock_quantity, is_active')
      .eq('id', product_id)
      .single();

    if (prodErr || !product || !product.is_active) {
      return NextResponse.json({ erro: 'Produto indisponível ou esgotado' }, { status: 400 });
    }

    if (product.stock_quantity <= 0) {
      return NextResponse.json({ erro: 'Produto sem estoque disponível' }, { status: 400 });
    }

    const qtdDesejada = product.price === 0 ? 1 : Math.max(1, parseInt(String(quantity), 10) || 1);
    const sizeNorm = size ? String(size).trim() : null;

    // Checa se o item já existe no carrinho com esse tamanho
    let queryBusca = admin
      .from('store_cart_items')
      .select('id, quantity')
      .eq('cart_id', cart.id)
      .eq('product_id', product_id);

    if (sizeNorm) {
      queryBusca = queryBusca.eq('size', sizeNorm);
    } else {
      queryBusca = queryBusca.is('size', null);
    }

    const { data: itemExist } = await queryBusca.maybeSingle();

    // Se o produto for gratuito (preço 0)
    if (product.price === 0) {
      // 1. Checa se o usuário já resgatou este produto gratuito em pedidos anteriores
      const { data: resgatesAnteriores } = await admin
        .from('store_order_items')
        .select('id, store_orders!inner(id, user_id, status)')
        .eq('product_id', product_id)
        .eq('store_orders.user_id', user.id)
        .in('store_orders.status', ['paid', 'pending_payment'])
        .limit(1);

      if (resgatesAnteriores && resgatesAnteriores.length > 0) {
        return NextResponse.json(
          { erro: `Você já resgatou o produto gratuito "${product.name}". O limite é de 1 por usuário.` },
          { status: 400 }
        );
      }

      // 2. Se já existe no carrinho, impede adicionar mais unidades
      if (itemExist) {
        return NextResponse.json(
          { erro: 'Produtos gratuitos possuem limite de apenas 1 unidade por usuário.' },
          { status: 400 }
        );
      }
    }

    if (itemExist) {
      const novaQtd = product.price === 0 ? 1 : Math.min(itemExist.quantity + qtdDesejada, product.stock_quantity);
      await admin
        .from('store_cart_items')
        .update({
          quantity: novaQtd,
          unit_price_snapshot: product.price,
        })
        .eq('id', itemExist.id);
    } else {
      const qtdFinal = product.price === 0 ? 1 : Math.min(qtdDesejada, product.stock_quantity);
      await admin.from('store_cart_items').insert({
        cart_id: cart.id,
        product_id,
        size: sizeNorm,
        quantity: qtdFinal,
        unit_price_snapshot: product.price,
      });
    }

    return NextResponse.json({ sucesso: true, mensagem: 'Item adicionado ao carrinho' });
  } catch (error) {
    logger.error('Erro no POST /api/loja/carrinho', { erro: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ erro: 'Falha ao adicionar item ao carrinho' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await criarClienteServidor();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const { item_id, quantity } = body;

    if (!item_id) {
      return NextResponse.json({ erro: 'ID do item obrigatório' }, { status: 400 });
    }

    const qtd = parseInt(String(quantity), 10);
    const admin = criarClienteAdmin();

    // Valida que o item pertence ao carrinho ativo do usuário
    const { data: item, error: itemErr } = await admin
      .from('store_cart_items')
      .select(`
        id,
        quantity,
        cart:store_carts!inner(id, user_id, status),
        product:store_products(id, stock_quantity, price, is_active)
      `)
      .eq('id', item_id)
      .eq('cart.user_id', user.id)
      .eq('cart.status', 'active')
      .single();

    if (itemErr || !item) {
      return NextResponse.json({ erro: 'Item do carrinho não encontrado' }, { status: 404 });
    }

    if (qtd <= 0) {
      // Remove se quantidade for 0 ou negativa
      await admin.from('store_cart_items').delete().eq('id', item_id);
      return NextResponse.json({ sucesso: true, removido: true });
    }

    const isFree = (item.product as any)?.price === 0;
    if (isFree && qtd > 1) {
      return NextResponse.json({ erro: 'Produtos gratuitos possuem limite de 1 unidade por usuário.' }, { status: 400 });
    }

    const maxStock = isFree ? 1 : ((item.product as any)?.stock_quantity ?? 99);
    const qtdFinal = Math.min(qtd, maxStock);

    await admin
      .from('store_cart_items')
      .update({ quantity: qtdFinal })
      .eq('id', item_id);

    return NextResponse.json({ sucesso: true, quantity: qtdFinal });
  } catch (error) {
    logger.error('Erro no PUT /api/loja/carrinho', { erro: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ erro: 'Falha ao atualizar quantidade' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await criarClienteServidor();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get('item_id');
    const limparTudo = searchParams.get('limpar') === 'true';
    const admin = criarClienteAdmin();

    const { data: cart } = await admin
      .from('store_carts')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (!cart) {
      return NextResponse.json({ sucesso: true });
    }

    if (limparTudo) {
      await admin.from('store_cart_items').delete().eq('cart_id', cart.id);
      return NextResponse.json({ sucesso: true, mensagem: 'Carrinho esvaziado' });
    }

    if (itemId) {
      await admin
        .from('store_cart_items')
        .delete()
        .eq('id', itemId)
        .eq('cart_id', cart.id);
      return NextResponse.json({ sucesso: true, mensagem: 'Item removido' });
    }

    return NextResponse.json({ erro: 'Nenhuma ação especificada' }, { status: 400 });
  } catch (error) {
    logger.error('Erro no DELETE /api/loja/carrinho', { erro: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ erro: 'Falha ao remover item do carrinho' }, { status: 500 });
  }
}
