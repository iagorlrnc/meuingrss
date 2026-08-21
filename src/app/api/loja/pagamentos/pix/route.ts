import { NextRequest, NextResponse } from 'next/server';
import { paymentClient, ehMercadoPagoConfigurado } from '@/lib/mercadopago';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { criarClienteServidor } from '@/lib/supabase/servidor';
import { logger } from '@/lib/logger';
import { verificarRateLimit } from '@/lib/rateLimit';
import { TEMPO_EXPIRACAO_PIX_MINUTOS } from '@/lib/constantes';
import crypto from 'crypto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1';

  // 1. Rate limiting
  const rateLimit = verificarRateLimit(`checkout_loja_pix_${ip}`, { janelaMs: 60000, maxRequisicoes: 20 });
  if (!rateLimit.permitido) {
    logger.warn('Rate limit excedido no checkout Pix da loja', { ip });
    return NextResponse.json(
      { erro: 'Muitas tentativas de compra em curto intervalo. Aguarde um momento.' },
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
      return NextResponse.json({ erro: 'Autenticação necessária para realizar compras.' }, { status: 401 });
    }

    const userId = user.id;
    if (comprador_id && comprador_id !== userId) {
      const { data: perfil } = await supabaseServidor.from('profiles').select('role').eq('id', userId).single();
      if (!perfil || perfil.role !== 'admin') {
        logger.security('IDOR prevenido ao criar Pix da Loja', { caller: userId, target: comprador_id });
        return NextResponse.json({ erro: 'Ação não autorizada.' }, { status: 403 });
      }
    }

    // 3. Validação dos itens do pedido
    if (!Array.isArray(itens) || itens.length === 0) {
      return NextResponse.json({ erro: 'O carrinho está vazio ou os itens são inválidos.' }, { status: 400 });
    }

    if (!ehMercadoPagoConfigurado()) {
      return NextResponse.json({ erro: 'O gateway de pagamento não está configurado no servidor.' }, { status: 500 });
    }

    const admin = criarClienteAdmin();

    // 4. Buscar e validar produtos e estoque no banco de dados
    let totalCentavos = 0;
    let atleticaIdPrincipal: string | null = null;
    const itensValidados: {
      product_id: string;
      name: string;
      size: string | null;
      quantity: number;
      price_cents: number;
      subtotal_cents: number;
    }[] = [];

    for (const item of itens) {
      const { product_id, size, quantity } = item;
      if (!product_id || !UUID_REGEX.test(product_id)) {
        return NextResponse.json({ erro: 'Identificador de produto inválido.' }, { status: 400 });
      }

      const qtd = parseInt(String(quantity), 10);
      if (isNaN(qtd) || qtd < 1) {
        return NextResponse.json({ erro: 'Quantidade inválida para um dos itens.' }, { status: 400 });
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

      if (!atleticaIdPrincipal && prod.atletica_id) {
        atleticaIdPrincipal = prod.atletica_id;
      }

      const precoUnit = prod.price; // em centavos
      const subtotalItem = precoUnit * qtd;
      totalCentavos += subtotalItem;

      itensValidados.push({
        product_id: prod.id,
        name: prod.name,
        size: size ? String(size).trim() : null,
        quantity: qtd,
        price_cents: precoUnit,
        subtotal_cents: subtotalItem,
      });
    }

    if (totalCentavos <= 0) {
      return NextResponse.json({ erro: 'Valor do pedido inválido.' }, { status: 400 });
    }

    const { data: comprador } = await admin
      .from('profiles')
      .select('nome, email, telefone, cpf')
      .eq('id', userId)
      .maybeSingle();

    // 5. Criação prévia do Pedido com Status 'pending_payment'
    const orderId = crypto.randomUUID();
    const dataExpiracao = new Date(Date.now() + TEMPO_EXPIRACAO_PIX_MINUTOS * 60 * 1000);

    const { data: orderCriado, error: errOrder } = await admin
      .from('store_orders')
      .insert({
        id: orderId,
        user_id: userId,
        atletica_id: atleticaIdPrincipal,
        status: 'pending_payment',
        payment_method: 'pix',
        total_amount: totalCentavos,
        metadata: {
          tipo: 'loja',
          data_expiracao: dataExpiracao.toISOString(),
        },
      })
      .select('id')
      .single();

    if (errOrder || !orderCriado) {
      logger.error('Erro ao registrar store_order', errOrder);
      return NextResponse.json({ erro: 'Falha ao criar registro do pedido.' }, { status: 500 });
    }

    // Insere itens do pedido
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
      logger.error('Erro ao registrar itens do pedido', errItems);
    }

    // 6. Configuração da URL de Webhook Canônica
    const dominioPrincipal = (process.env.NEXT_PUBLIC_DOMINIO_PRINCIPAL || 'meuingrss.com.br').replace(/\/+$/, '');
    const protocoloConfig = process.env.NEXT_PUBLIC_PROTOCOLO || 'https';
    let webhookUrl = `${protocoloConfig}://${dominioPrincipal}/api/webhook-mercadopago`;
    if (!webhookUrl.startsWith('https://')) {
      webhookUrl = `https://${dominioPrincipal}/api/webhook-mercadopago`;
    }

    // 7. Dados do Payer
    const nomePartes = (comprador?.nome || user.email || 'Cliente').trim().split(' ');
    const primeiroNome = nomePartes[0] || 'Cliente';
    const sobrenome = nomePartes.slice(1).join(' ') || 'Loja';
    const cpfLimpo = (comprador?.cpf || '').replace(/\D/g, '');
    const docIdentificacao = (cpfLimpo.length === 11 || cpfLimpo.length === 14)
      ? { type: cpfLimpo.length === 14 ? 'CNPJ' : 'CPF', number: cpfLimpo }
      : undefined;

    let emailPayer = (comprador?.email && comprador.email.includes('@'))
      ? comprador.email
      : (user?.email && user.email.includes('@'))
      ? user.email
      : 'comprador.meuingrss@gmail.com';

    if (emailPayer.includes('@testuser.com') || emailPayer.includes('@placeholder')) {
      emailPayer = 'comprador.meuingrss@gmail.com';
    }

    const valorEmReais = Number((totalCentavos / 100).toFixed(2));
    const descricaoResumida = itensValidados.length === 1
      ? `Loja: ${itensValidados[0].name} (${itensValidados[0].quantity}x)`
      : `Loja: ${itensValidados[0].name} e mais ${itensValidados.length - 1} item(ns)`;

    // 8. Criação da Cobrança Pix via SDK Mercado Pago
    const payloadPagamento = {
      transaction_amount: valorEmReais,
      description: descricaoResumida.substring(0, 100),
      payment_method_id: 'pix',
      statement_descriptor: 'MEUINGRSS LOJA',
      payer: {
        email: emailPayer,
        first_name: primeiroNome,
        last_name: sobrenome,
        identification: docIdentificacao,
      },
      external_reference: orderId,
      notification_url: webhookUrl,
      date_of_expiration: dataExpiracao.toISOString(),
      metadata: {
        tipo: 'loja',
        order_id: orderId,
        user_id: userId,
        atletica_id: atleticaIdPrincipal,
        total_cents: totalCentavos,
      },
    };

    const mpRes = await paymentClient.create({
      body: payloadPagamento,
      requestOptions: {
        idempotencyKey: orderId,
      },
    });

    if (!mpRes || !mpRes.id) {
      logger.error('Mercado Pago não retornou ID de pagamento Pix para Loja', null, { payloadPagamento });
      return NextResponse.json({ erro: 'Não foi possível gerar a cobrança Pix.' }, { status: 500 });
    }

    const pointData = mpRes.point_of_interaction?.transaction_data;
    const qrCode = pointData?.qr_code || '';
    const qrCodeBase64 = pointData?.qr_code_base64 || '';
    const dateOfExpiration = mpRes.date_of_expiration || dataExpiracao.toISOString();

    // 9. Atualizar store_orders com o ID do gateway
    await admin
      .from('store_orders')
      .update({
        mercado_pago_payment_id: String(mpRes.id),
      })
      .eq('id', orderId);

    logger.info('Pagamento Pix para Loja criado com sucesso', {
      order_id: orderId,
      payment_id: mpRes.id,
      user_id: userId,
    });

    return NextResponse.json({
      sucesso: true,
      order_id: orderId,
      payment_id: String(mpRes.id),
      qr_code: qrCode,
      qr_code_base64: qrCodeBase64,
      date_of_expiration: dateOfExpiration,
      total_amount: totalCentavos,
      status: mpRes.status,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao processar cobrança Pix da loja';
    logger.error('Erro na criação de pagamento Pix para loja', error);
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}
