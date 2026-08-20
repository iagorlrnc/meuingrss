import { NextRequest, NextResponse } from 'next/server';
import { paymentClient, ehMercadoPagoConfigurado } from '@/lib/mercadopago';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { criarClienteServidor } from '@/lib/supabase/servidor';
import { logger } from '@/lib/logger';
import { verificarRateLimit } from '@/lib/rateLimit';
import { TAXA_SERVICO_PERCENTUAL, TEMPO_EXPIRACAO_PIX_MINUTOS } from '@/lib/constantes';
import crypto from 'crypto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1';

  // 1. Rate limiting
  const rateLimit = verificarRateLimit(`checkout_pix_${ip}`, { janelaMs: 60000, maxRequisicoes: 20 });
  if (!rateLimit.permitido) {
    logger.warn('Rate limit excedido na criação de Pix transparente', { ip });
    return NextResponse.json(
      { erro: 'Muitas tentativas de compra em curto intervalo. Aguarde um minuto.' },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const { evento_id, lote_id, quantidade, comprador_id } = body;

    // 2. Autenticação e proteção IDOR
    const supabaseServidor = await criarClienteServidor();
    const { data: { user }, error: erroAuth } = await supabaseServidor.auth.getUser();

    if (erroAuth || !user) {
      logger.security('Tentativa não autorizada de criar Pix', { ip });
      return NextResponse.json({ erro: 'Autenticação necessária para realizar compras.' }, { status: 401 });
    }

    if (user.id !== comprador_id) {
      const { data: perfil } = await supabaseServidor.from('profiles').select('role').eq('id', user.id).single();
      if (!perfil || perfil.role !== 'admin') {
        logger.security('IDOR prevenido ao criar Pix', { caller: user.id, target: comprador_id });
        return NextResponse.json({ erro: 'Ação não autorizada para este comprador.' }, { status: 403 });
      }
    }

    // 3. Validação de dados
    if (!evento_id || !lote_id || !quantidade || !comprador_id) {
      return NextResponse.json({ erro: 'Dados incompletos para a realização da compra.' }, { status: 400 });
    }

    if (!UUID_REGEX.test(evento_id) || !UUID_REGEX.test(lote_id) || !UUID_REGEX.test(comprador_id)) {
      return NextResponse.json({ erro: 'Identificadores inválidos fornecidos.' }, { status: 400 });
    }

    const qtd = parseInt(String(quantidade), 10);
    if (isNaN(qtd) || qtd < 1 || qtd > 10) {
      return NextResponse.json({ erro: 'Quantidade de ingressos inválida (permitido de 1 a 10).' }, { status: 400 });
    }

    if (!ehMercadoPagoConfigurado()) {
      return NextResponse.json({ erro: 'O Mercado Pago não está configurado no servidor.' }, { status: 500 });
    }

    const supabase = criarClienteAdmin();

    // 4. Busca do lote e evento
    const { data: lote, error: erroLote } = await supabase
      .from('lotes_ingresso')
      .select('id, nome_lote, preco, quantidade_total, quantidade_vendida, ativo')
      .eq('id', lote_id)
      .single();

    if (erroLote || !lote || !lote.ativo) {
      return NextResponse.json({ erro: 'Lote de ingressos indisponível ou esgotado.' }, { status: 400 });
    }

    const restantes = lote.quantidade_total - lote.quantidade_vendida;
    if (restantes < qtd) {
      return NextResponse.json({ erro: 'Ingressos insuficientes para este lote.' }, { status: 400 });
    }

    const { data: evento } = await supabase
      .from('eventos')
      .select('id, titulo')
      .eq('id', evento_id)
      .single();

    if (!evento) {
      return NextResponse.json({ erro: 'Evento não encontrado.' }, { status: 404 });
    }

    const { data: comprador } = await supabase
      .from('profiles')
      .select('nome, email, telefone, cpf')
      .eq('id', comprador_id)
      .maybeSingle();

    const precoUnitario = Number(lote.preco);
    const subtotal = precoUnitario * qtd;
    const taxaServicoUnitaria = precoUnitario === 0 ? 0 : Math.round((precoUnitario * TAXA_SERVICO_PERCENTUAL) * 100) / 100;
    const taxaServicoTotal = taxaServicoUnitaria * qtd;
    const totalFinal = subtotal + taxaServicoTotal;

    // 5. Criação prévia do Pedido com Status 'pendente'
    const dataExpiracao = new Date(Date.now() + TEMPO_EXPIRACAO_PIX_MINUTOS * 60 * 1000);
    const clienteOrderId = body.pedido_id || body.idempotency_key;
    let orderId = (clienteOrderId && UUID_REGEX.test(clienteOrderId)) ? clienteOrderId : crypto.randomUUID();

    try {
      const { data: pedidoCriado } = await supabase
        .from('pedidos')
        .insert({
          id: orderId,
          comprador_id,
          evento_id,
          lote_id,
          quantidade: qtd,
          valor_unitario: precoUnitario,
          taxa_servico: taxaServicoTotal,
          valor_total: totalFinal,
          status: 'pendente',
          metodo_pagamento: 'pix',
          expira_em: dataExpiracao.toISOString(),
        })
        .select('id')
        .maybeSingle();

      if (pedidoCriado?.id) {
        orderId = pedidoCriado.id;
      }
    } catch (dbErr) {
      logger.warn('Erro ao inserir pedido pendente Pix no Supabase, prosseguindo com orderId UUID', { erro: dbErr });
    }

    // 6. Configuração da URL de Webhook Canônica (Sempre HTTPS pública para o Mercado Pago aceitar)
    const dominioPrincipal = (process.env.NEXT_PUBLIC_DOMINIO_PRINCIPAL || 'meuingrss.com.br').replace(/\/+$/, '');
    const protocoloConfig = process.env.NEXT_PUBLIC_PROTOCOLO || 'https';
    let webhookUrl = `${protocoloConfig}://${dominioPrincipal}/api/webhook-mercadopago`;
    if (!webhookUrl.startsWith('https://')) {
      webhookUrl = `https://${dominioPrincipal}/api/webhook-mercadopago`;
    }

    // 7. Montagem dos dados do comprador
    const nomePartes = (comprador?.nome || user.email || 'Comprador').trim().split(' ');
    const primeiroNome = nomePartes[0] || 'Comprador';
    const sobrenome = nomePartes.slice(1).join(' ') || 'Cliente';
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

    // 8. Chamada transparente à API de Pagamentos do Mercado Pago (com Idempotência)
    const payloadPagamento = {
      transaction_amount: Number(totalFinal.toFixed(2)),
      description: `${evento.titulo} — ${lote.nome_lote} (${qtd}x)`,
      payment_method_id: 'pix',
      statement_descriptor: 'MEUINGRSS',
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
        pedido_id: orderId,
        evento_id,
        lote_id,
        comprador_id,
        quantidade: qtd,
        preco_unitario: precoUnitario,
        taxa: taxaServicoTotal,
        total_final: totalFinal,
      },
    };

    const mpRes = await paymentClient.create({
      body: payloadPagamento,
      requestOptions: {
        idempotencyKey: orderId,
      },
    });

    if (!mpRes || !mpRes.id) {
      logger.error('Mercado Pago não retornou ID de pagamento Pix', null, { payloadPagamento });
      return NextResponse.json({ erro: 'Não foi possível gerar a cobrança Pix.' }, { status: 500 });
    }

    const pointData = mpRes.point_of_interaction?.transaction_data;
    const qrCode = pointData?.qr_code || '';
    const qrCodeBase64 = pointData?.qr_code_base64 || '';
    const dateOfExpiration = mpRes.date_of_expiration || dataExpiracao.toISOString();

    // 9. Atualiza o pedido no banco com o gateway_payment_id
    await supabase
      .from('pedidos')
      .update({
        gateway_payment_id: String(mpRes.id),
        gateway_transaction_id: String(mpRes.id),
      })
      .eq('id', orderId);

    logger.info('Pagamento Pix transparente criado com sucesso', {
      pedido_id: orderId,
      payment_id: mpRes.id,
      comprador_id,
    });

    return NextResponse.json({
      sucesso: true,
      pedido_id: orderId,
      payment_id: String(mpRes.id),
      qr_code: qrCode,
      qr_code_base64: qrCodeBase64,
      date_of_expiration: dateOfExpiration,
      status: mpRes.status,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao processar cobrança Pix';
    logger.error('Erro na criação de pagamento Pix transparente', error);
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}
