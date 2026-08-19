import { NextRequest, NextResponse } from 'next/server';
import { paymentClient, ehMercadoPagoConfigurado, traduzirStatusRecusaCartao } from '@/lib/mercadopago';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { criarClienteServidor } from '@/lib/supabase/servidor';
import { logger } from '@/lib/logger';
import { verificarRateLimit } from '@/lib/rateLimit';
import { TAXA_SERVICO_PERCENTUAL } from '@/lib/constantes';
import { gerarHashIngresso } from '@/lib/gerarQrCode';
import { enviarNotificacaoIngressoLiberado } from '@/lib/notificacoes';
import crypto from 'crypto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1';

  // 1. Rate Limiting (15 requisições por minuto por IP para cartão)
  const rateLimit = verificarRateLimit(`checkout_card_${ip}`, { janelaMs: 60000, maxRequisicoes: 15 });
  if (!rateLimit.permitido) {
    logger.warn('Rate limit excedido no checkout de cartão de crédito', { ip });
    return NextResponse.json(
      { erro: 'Muitas tentativas de compra em curto intervalo. Aguarde um minuto.' },
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
      evento_id,
      lote_id,
      quantidade,
      comprador_id,
    } = body;

    // 2. Autenticação e proteção IDOR
    const supabaseServidor = await criarClienteServidor();
    const { data: { user }, error: erroAuth } = await supabaseServidor.auth.getUser();

    if (erroAuth || !user) {
      logger.security('Tentativa não autorizada de pagamento com cartão', { ip });
      return NextResponse.json({ erro: 'Autenticação necessária para realizar compras.' }, { status: 401 });
    }

    if (user.id !== comprador_id) {
      const { data: perfil } = await supabaseServidor.from('profiles').select('role').eq('id', user.id).single();
      if (!perfil || perfil.role !== 'admin') {
        logger.security('IDOR prevenido no pagamento com cartão', { caller: user.id, target: comprador_id });
        return NextResponse.json({ erro: 'Ação não autorizada para este comprador.' }, { status: 403 });
      }
    }

    const rawPm = payment_method_id || body.paymentMethodId || (body.formData as any)?.payment_method_id || (body.formData as any)?.paymentMethodId;
    const paymentMethodIdValido = (rawPm && rawPm !== 'undefined' && rawPm !== 'null') ? String(rawPm).toLowerCase() : 'visa';

    // 3. Validação dos Parâmetros do Cartão
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ erro: 'Token de cartão ausente ou inválido.' }, { status: 400 });
    }

    if (!evento_id || !lote_id || !quantidade || !comprador_id) {
      return NextResponse.json({ erro: 'Dados de pagamento incompletos.' }, { status: 400 });
    }


    if (!UUID_REGEX.test(evento_id) || !UUID_REGEX.test(lote_id) || !UUID_REGEX.test(comprador_id)) {
      return NextResponse.json({ erro: 'Identificadores inválidos fornecidos.' }, { status: 400 });
    }

    const qtd = parseInt(String(quantidade), 10);
    if (isNaN(qtd) || qtd < 1 || qtd > 10) {
      return NextResponse.json({ erro: 'Quantidade de ingressos inválida (1 a 10).' }, { status: 400 });
    }

    if (!ehMercadoPagoConfigurado()) {
      return NextResponse.json({ erro: 'O gateway do Mercado Pago não está configurado no servidor.' }, { status: 500 });
    }

    const supabase = criarClienteAdmin();

    // 4. Busca e Validação de Lote e Estoque
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

    // 5. Criação Prévia do Pedido com Status 'pendente'
    let orderId = crypto.randomUUID();

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
          metodo_pagamento: paymentMethodIdValido,

        })
        .select('id')
        .maybeSingle();

      if (pedidoCriado?.id) {
        orderId = pedidoCriado.id;
      }
    } catch (dbErr) {
      logger.warn('Exceção ao inserir pedido para cartão, prosseguindo com orderId UUID', { erro: dbErr });
    }

    // 6. URL do Webhook Canônica (Sempre HTTPS pública para o Mercado Pago aceitar)
    const dominioPrincipal = (process.env.NEXT_PUBLIC_DOMINIO_PRINCIPAL || 'meuingrss.com.br').replace(/\/+$/, '');
    const protocoloConfig = process.env.NEXT_PUBLIC_PROTOCOLO || 'https';
    let webhookUrl = `${protocoloConfig}://${dominioPrincipal}/api/webhook-mercadopago`;
    if (!webhookUrl.startsWith('https://')) {
      webhookUrl = `https://${dominioPrincipal}/api/webhook-mercadopago`;
    }


    // 7. Dados do Payer
    const nomePartes = (comprador?.nome || user.email || 'Comprador').trim().split(' ');
    const primeiroNome = payer?.first_name || nomePartes[0] || 'Comprador';
    const sobrenome = payer?.last_name || nomePartes.slice(1).join(' ') || 'Cliente';
    let emailPayer = (payer?.email && payer.email.includes('@'))
      ? payer.email
      : (comprador?.email && comprador.email.includes('@'))
      ? comprador.email
      : (user?.email && user.email.includes('@'))
      ? user.email
      : 'comprador.meuingrss@gmail.com';

    if (emailPayer.includes('@testuser.com') || emailPayer.includes('@placeholder')) {
      emailPayer = 'comprador.meuingrss@gmail.com';
    }

    const cpfLimpo = (payer?.identification?.number || comprador?.cpf || '').replace(/\D/g, '');



    // 8. Chamada Transparente ao Mercado Pago com Token (PCI Compliant & Idempotência)
    const payloadPagamento = {
      transaction_amount: Number(totalFinal.toFixed(2)),
      token,
      description: `${evento.titulo} — ${lote.nome_lote} (${qtd}x)`,
      installments: Number(installments || 1),
      payment_method_id: paymentMethodIdValido,

      issuer_id: (issuer_id ? String(issuer_id) : undefined) as any,

      payer: {
        email: emailPayer,
        first_name: primeiroNome,
        last_name: sobrenome,
        identification: cpfLimpo.length === 11 ? { type: 'CPF', number: cpfLimpo } : undefined,
      },
      external_reference: orderId,
      notification_url: webhookUrl,
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
      logger.error('Mercado Pago não retornou resposta válida para pagamento com cartão', null, { payloadPagamento });
      return NextResponse.json({ erro: 'Não foi possível processar a cobrança do cartão.' }, { status: 500 });
    }

    const gatewayPaymentId = String(mpRes.id);
    const statusPagamento = String(mpRes.status || '');
    const statusDetail = String(mpRes.status_detail || '');

    logger.info('Resposta da API Mercado Pago para Cartão de Crédito', {
      pedido_id: orderId,
      payment_id: gatewayPaymentId,
      status: statusPagamento,
      status_detail: statusDetail,
    });

    // 9. Processamento conforme Status da Resposta
    if (statusPagamento === 'approved') {
      // Gera hashes determinísticas para liberação de ingressos
      const qrHashes: string[] = [];
      for (let i = 0; i < qtd; i++) {
        qrHashes.push(gerarHashIngresso(`${evento_id}-${gatewayPaymentId}-${i}`, evento_id));
      }

      // Executa liberação atômica via RPC
      const { data: resRpc, error: errRpc } = await supabase.rpc('processar_pagamento_aprovado', {
        p_pedido_id: orderId,
        p_gateway_payment_id: gatewayPaymentId,
        p_metodo_pagamento: paymentMethodIdValido,

        p_qr_hashes: qrHashes,
      });

      if (errRpc || !resRpc?.sucesso) {
        // Fallback JS
        await supabase.from('pedidos').update({
          status: 'aprovado',
          gateway_payment_id: gatewayPaymentId,
          gateway_transaction_id: gatewayPaymentId,
          pago_em: new Date().toISOString(),
        }).eq('id', orderId);

        for (let i = 0; i < qtd; i++) {
          const { data: ing } = await supabase.from('ingressos').insert({
            evento_id,
            lote_id,
            comprador_id,
            qr_code_hash: qrHashes[i],
            status: 'valido',
          }).select('id').single();

          if (ing) {
            await supabase.from('pagamentos').insert({
              ingresso_id: ing.id,
              valor: precoUnitario,
              status: 'aprovado',
              gateway_transaction_id: gatewayPaymentId,
              metodo_pagamento: paymentMethodIdValido,

            });
          }
        }
      }

      enviarNotificacaoIngressoLiberado({
        comprador_id,
        quantidade: qtd,
        gateway_transaction_id: gatewayPaymentId,
        email_comprador: emailPayer,
      });

      return NextResponse.json({
        sucesso: true,
        status: 'approved',
        pedido_id: orderId,
        payment_id: gatewayPaymentId,
        mensagem: 'Pagamento aprovado com sucesso! Seus ingressos foram gerados.',
      });
    }

    if (['in_process', 'pending'].includes(statusPagamento)) {
      await supabase.from('pedidos').update({
        status: 'em_analise',
        gateway_payment_id: gatewayPaymentId,
        gateway_transaction_id: gatewayPaymentId,
      }).eq('id', orderId);

      return NextResponse.json({
        sucesso: true,
        status: statusPagamento,
        pedido_id: orderId,
        payment_id: gatewayPaymentId,
        mensagem: 'Seu pagamento está em análise pelo gateway ou operadora do cartão.',
      });
    }

    // Caso de recusa/rejeição (status === 'rejected' ou outros)
    await supabase.from('pedidos').update({
      status: 'recusado',
      gateway_payment_id: gatewayPaymentId,
      gateway_transaction_id: gatewayPaymentId,
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
    const msg = error instanceof Error ? error.message : 'Erro ao processar pagamento de cartão';
    logger.error('Erro na criação de pagamento por cartão transparente', error);
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}
