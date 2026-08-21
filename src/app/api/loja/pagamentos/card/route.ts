import { NextRequest, NextResponse } from 'next/server';
import { paymentClient, ehMercadoPagoConfigurado, traduzirStatusRecusaCartao } from '@/lib/mercadopago';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { criarClienteServidor } from '@/lib/supabase/servidor';
import { logger } from '@/lib/logger';
import { verificarRateLimit } from '@/lib/rateLimit';
import crypto from 'crypto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1';

  // 1. Rate Limiting
  const rateLimit = verificarRateLimit(`checkout_loja_card_${ip}`, { janelaMs: 60000, maxRequisicoes: 15 });
  if (!rateLimit.permitido) {
    logger.warn('Rate limit excedido no checkout de cartão de crédito da loja', { ip });
    return NextResponse.json(
      { erro: 'Muitas tentativas de compra em curto intervalo. Aguarde um momento.' },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const {
      token,
      payment_method_id,
      installments,
      issuer_id,
      payer,
      itens,
      comprador_id,
    } = body;

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
        logger.security('IDOR prevenido no pagamento com cartão da loja', { caller: userId, target: comprador_id });
        return NextResponse.json({ erro: 'Ação não autorizada.' }, { status: 403 });
      }
    }

    const rawToken = token || body.token || (body.formData as any)?.token;
    const rawInstallments = installments || body.installments || (body.formData as any)?.installments;
    const rawPayer = payer || body.payer || (body.formData as any)?.payer;

    const rawPm = payment_method_id || body.paymentMethodId || (body.formData as any)?.payment_method_id || (body.formData as any)?.paymentMethodId;
    let paymentMethodIdValido = (rawPm && rawPm !== 'undefined' && rawPm !== 'null') ? String(rawPm).toLowerCase().trim() : 'visa';
    if (paymentMethodIdValido === 'mastercard') paymentMethodIdValido = 'master';

    const rawIssuer = issuer_id || body.issuerId || (body.formData as any)?.issuer_id || (body.formData as any)?.issuerId;
    const issuerIdValido = (rawIssuer && rawIssuer !== 'undefined' && rawIssuer !== 'null' && String(rawIssuer).trim() !== '')
      ? String(rawIssuer).trim()
      : undefined;

    // 3. Validação dos Parâmetros do Cartão e Itens
    if (!rawToken || typeof rawToken !== 'string') {
      return NextResponse.json({ erro: 'Token de cartão ausente ou inválido.' }, { status: 400 });
    }

    if (!Array.isArray(itens) || itens.length === 0) {
      return NextResponse.json({ erro: 'Itens do carrinho ausentes ou inválidos.' }, { status: 400 });
    }

    if (!ehMercadoPagoConfigurado()) {
      return NextResponse.json({ erro: 'O Mercado Pago não está configurado no servidor.' }, { status: 500 });
    }

    const admin = criarClienteAdmin();

    // 4. Validação de Produtos e Estoque
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

      const precoUnit = prod.price;
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

    const { data: comprador } = await admin
      .from('profiles')
      .select('nome, email, telefone, cpf')
      .eq('id', userId)
      .maybeSingle();

    // 5. Criação Prévia do Pedido com Status 'pending_payment'
    const orderId = crypto.randomUUID();

    const { data: orderCriado, error: errOrder } = await admin
      .from('store_orders')
      .insert({
        id: orderId,
        user_id: userId,
        atletica_id: atleticaIdPrincipal,
        status: 'pending_payment',
        payment_method: paymentMethodIdValido,
        total_amount: totalCentavos,
        metadata: {
          tipo: 'loja',
        },
      })
      .select('id')
      .single();

    if (errOrder || !orderCriado) {
      logger.error('Erro ao registrar store_order para cartão', errOrder);
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

    await admin.from('store_order_items').insert(orderItemsRows);

    // 6. URL do Webhook Canônica
    const dominioPrincipal = (process.env.NEXT_PUBLIC_DOMINIO_PRINCIPAL || 'meuingrss.com.br').replace(/\/+$/, '');
    const protocoloConfig = process.env.NEXT_PUBLIC_PROTOCOLO || 'https';
    let webhookUrl = `${protocoloConfig}://${dominioPrincipal}/api/webhook-mercadopago`;
    if (!webhookUrl.startsWith('https://')) {
      webhookUrl = `https://${dominioPrincipal}/api/webhook-mercadopago`;
    }

    // 7. Dados do Payer
    const nomePartes = (comprador?.nome || user.email || 'Cliente').trim().split(' ');
    const primeiroNome = rawPayer?.first_name || nomePartes[0] || 'Cliente';
    const sobrenome = rawPayer?.last_name || nomePartes.slice(1).join(' ') || 'Loja';
    let emailPayer = (rawPayer?.email && rawPayer.email.includes('@'))
      ? rawPayer.email
      : (comprador?.email && comprador.email.includes('@'))
      ? comprador.email
      : (user?.email && user.email.includes('@'))
      ? user.email
      : 'comprador.meuingrss@gmail.com';

    if (emailPayer.includes('@testuser.com') || emailPayer.includes('@placeholder')) {
      emailPayer = 'comprador.meuingrss@gmail.com';
    }

    const rawDocNumero = (rawPayer?.identification?.number || comprador?.cpf || '').replace(/\D/g, '');
    const rawDocTipo = (rawPayer?.identification?.type || (rawDocNumero.length === 14 ? 'CNPJ' : 'CPF')).toUpperCase();
    const docIdentificacao = (rawDocNumero.length === 11 || rawDocNumero.length === 14)
      ? { type: rawDocTipo, number: rawDocNumero }
      : undefined;

    const valorEmReais = Number((totalCentavos / 100).toFixed(2));
    const descricaoResumida = itensValidados.length === 1
      ? `Loja: ${itensValidados[0].name} (${itensValidados[0].quantity}x)`
      : `Loja: ${itensValidados[0].name} e mais ${itensValidados.length - 1} item(ns)`;

    // 8. Chamada Transparente ao Mercado Pago com Token
    const payloadPagamento = {
      transaction_amount: valorEmReais,
      token: rawToken,
      description: descricaoResumida.substring(0, 100),
      installments: Number(rawInstallments || 1),
      payment_method_id: paymentMethodIdValido,
      issuer_id: issuerIdValido as any,
      statement_descriptor: 'MEUINGRSS LOJA',
      payer: {
        email: emailPayer,
        first_name: primeiroNome,
        last_name: sobrenome,
        identification: docIdentificacao,
      },
      external_reference: orderId,
      notification_url: webhookUrl,
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
      const payloadSeguro = { ...payloadPagamento, token: '[REDACTED_TOKEN]' };
      logger.error('Mercado Pago não retornou resposta válida para pagamento da loja com cartão', null, { payloadSeguro });
      return NextResponse.json({ erro: 'Não foi possível processar a cobrança do cartão.' }, { status: 500 });
    }

    const gatewayPaymentId = String(mpRes.id);
    const statusPagamento = String(mpRes.status || '');
    const statusDetail = String(mpRes.status_detail || '');

    logger.info('Resposta da API Mercado Pago para Cartão da Loja', {
      order_id: orderId,
      payment_id: gatewayPaymentId,
      status: statusPagamento,
      status_detail: statusDetail,
    });

    // 9. Processamento conforme Status
    if (statusPagamento === 'approved') {
      // Executa liquidação atômica de loja via RPC
      const { data: resRpc, error: errRpc } = await admin.rpc('processar_pedido_loja_aprovado', {
        p_order_id: orderId,
        p_gateway_payment_id: gatewayPaymentId,
        p_payment_method: paymentMethodIdValido,
      });

      if (errRpc || !resRpc?.sucesso) {
        // Fallback JS
        await admin.from('store_orders').update({
          status: 'paid',
          mercado_pago_payment_id: gatewayPaymentId,
          payment_method: paymentMethodIdValido,
          paid_at: new Date().toISOString(),
        }).eq('id', orderId);

        // Débito de estoque
        for (const it of itensValidados) {
          const { data: pCur } = await admin.from('store_products').select('stock_quantity').eq('id', it.product_id).single();
          if (pCur) {
            await admin.from('store_products').update({
              stock_quantity: Math.max(0, pCur.stock_quantity - it.quantity),
            }).eq('id', it.product_id);
          }
        }

        // Limpar carrinho
        await admin.from('store_carts').update({ status: 'converted' }).eq('user_id', userId).eq('status', 'active');
      }

      return NextResponse.json({
        sucesso: true,
        status: 'approved',
        order_id: orderId,
        payment_id: gatewayPaymentId,
        total_amount: totalCentavos,
        mensagem: 'Pagamento aprovado com sucesso! Seu pedido foi confirmado.',
      });
    }

    if (['in_process', 'pending'].includes(statusPagamento)) {
      await admin.from('store_orders').update({
        status: 'pending_payment',
        mercado_pago_payment_id: gatewayPaymentId,
        payment_method: paymentMethodIdValido,
      }).eq('id', orderId);

      return NextResponse.json({
        sucesso: true,
        status: statusPagamento,
        order_id: orderId,
        payment_id: gatewayPaymentId,
        mensagem: 'Seu pagamento está em análise pela operadora do cartão.',
      });
    }

    // Status de recusa
    await admin.from('store_orders').update({
      status: 'failed',
      mercado_pago_payment_id: gatewayPaymentId,
      payment_method: paymentMethodIdValido,
    }).eq('id', orderId);

    const mensagemRecusa = traduzirStatusRecusaCartao(statusDetail);

    return NextResponse.json(
      {
        sucesso: false,
        status: statusPagamento,
        status_detail: statusDetail,
        erro: mensagemRecusa,
      },
      { status: 400 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao processar pagamento por cartão da loja';
    logger.error('Erro na criação de pagamento por cartão da loja', error);
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}
