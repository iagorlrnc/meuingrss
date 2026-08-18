import { NextRequest, NextResponse } from 'next/server';
import { preferenceClient, ehMercadoPagoConfigurado } from '@/lib/mercadopago';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { criarClienteServidor } from '@/lib/supabase/servidor';
import { logger } from '@/lib/logger';
import { verificarRateLimit } from '@/lib/rateLimit';
import { gerarHashIngresso } from '@/lib/gerarQrCode';
import { TAXA_SERVICO_PERCENTUAL, TAXA_SERVICO_LABEL, TEMPO_EXPIRACAO_PIX_MINUTOS } from '@/lib/constantes';
import crypto from 'crypto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1';

  // 1. Rate Limiting: Máximo de 20 solicitações de checkout por minuto por IP
  const rateLimit = verificarRateLimit(`checkout_${ip}`, { janelaMs: 60000, maxRequisicoes: 20 });
  if (!rateLimit.permitido) {
    logger.warn('Rate limit excedido na criação de sessão de pagamento', { ip });
    return NextResponse.json(
      { erro: 'Muitas tentativas de compra em curto intervalo. Aguarde um minuto.' },
      { status: 429 }
    );
  }

  try {
    const { evento_id, lote_id, quantidade, comprador_id } = await request.json();

    // 2. Autenticação e proteção IDOR
    const supabaseServidor = await criarClienteServidor();
    const { data: { user }, error: erroAuth } = await supabaseServidor.auth.getUser();

    if (erroAuth || !user) {
      logger.security('Tentativa não autorizada de criar sessão de pagamento', { ip });
      return NextResponse.json({ erro: 'Autenticação necessária para realizar compras.' }, { status: 401 });
    }

    if (user.id !== comprador_id) {
      const { data: perfil } = await supabaseServidor.from('profiles').select('role').eq('id', user.id).single();
      if (!perfil || perfil.role !== 'admin') {
        logger.security('IDOR prevenido: usuário tentou criar checkout para outro comprador', { caller: user.id, target: comprador_id });
        return NextResponse.json({ erro: 'Ação não autorizada para este perfil de comprador.' }, { status: 403 });
      }
    }

    // 3. Validação estrita de entrada e sanitização de dados
    if (!evento_id || !lote_id || !quantidade || !comprador_id) {
      return NextResponse.json({ erro: 'Dados incompletos para a realização da compra.' }, { status: 400 });
    }

    if (!UUID_REGEX.test(evento_id) || !UUID_REGEX.test(lote_id) || !UUID_REGEX.test(comprador_id)) {
      logger.warn('Formato UUID inválido enviado na criação de checkout', { evento_id, lote_id, comprador_id });
      return NextResponse.json({ erro: 'Identificadores inválidos fornecidos.' }, { status: 400 });
    }

    const qtd = parseInt(String(quantidade), 10);
    if (isNaN(qtd) || qtd < 1 || qtd > 10) {
      return NextResponse.json({ erro: 'Quantidade de ingressos inválida (permitido de 1 a 10).' }, { status: 400 });
    }

    const supabase = criarClienteAdmin();

    // 4. Busca e validação do lote de ingressos
    const { data: lote, error: erroLote } = await supabase
      .from('lotes_ingresso')
      .select('id, nome_lote, preco, quantidade_total, quantidade_vendida, ativo')
      .eq('id', lote_id)
      .single();

    if (erroLote || !lote) {
      return NextResponse.json({ erro: 'Lote de ingressos não encontrado.' }, { status: 404 });
    }

    if (!lote.ativo) {
      return NextResponse.json({ erro: 'Este lote de ingressos não está disponível no momento.' }, { status: 400 });
    }

    const restantes = lote.quantidade_total - lote.quantidade_vendida;
    if (restantes < qtd) {
      return NextResponse.json(
        { erro: 'Ingressos esgotados ou insuficientes para este lote.' },
        { status: 400 }
      );
    }

    // 5. Busca informações do evento e do comprador
    const { data: evento, error: erroEvento } = await supabase
      .from('eventos')
      .select('id, titulo, descricao, imagem_url, data_evento, local, cidade')
      .eq('id', evento_id)
      .single();

    if (erroEvento || !evento) {
      return NextResponse.json({ erro: 'Evento não encontrado.' }, { status: 404 });
    }

    const { data: comprador } = await supabase
      .from('profiles')
      .select('nome, email, telefone, cpf')
      .eq('id', comprador_id)
      .maybeSingle();

    const TAXA_PERCENTUAL = TAXA_SERVICO_PERCENTUAL;
    const precoUnitario = Number(lote.preco);
    const subtotal = precoUnitario * qtd;
    const taxaServicoUnitaria = precoUnitario === 0 ? 0 : Math.round((precoUnitario * TAXA_PERCENTUAL) * 100) / 100;
    const taxaServicoTotal = taxaServicoUnitaria * qtd;
    const totalFinal = subtotal + taxaServicoTotal;

    // 6. Caso o ingresso seja GRATUITO (Preço = 0)
    if (precoUnitario === 0) {
      const freeGatewayId = `FREE-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
      
      // Cria o pedido aprovado diretamente
      const { data: pedidoGratuito, error: erroPedidoFree } = await supabase
        .from('pedidos')
        .insert({
          comprador_id,
          evento_id,
          lote_id,
          quantidade: qtd,
          valor_unitario: 0,
          taxa_servico: 0,
          valor_total: 0,
          status: 'aprovado',
          gateway_payment_id: freeGatewayId,
          metodo_pagamento: 'gratuito',
          pago_em: new Date().toISOString(),
        })
        .select('id')
        .single();

      const qrHashes: string[] = [];
      for (let i = 0; i < qtd; i++) {
        qrHashes.push(gerarHashIngresso(`FREE-${evento_id}-${i}-${Date.now()}`, evento_id));
      }

      // Emite ingressos diretamente
      for (let i = 0; i < qtd; i++) {
        const { data: ing } = await supabase
          .from('ingressos')
          .insert({
            evento_id,
            lote_id,
            comprador_id,
            qr_code_hash: qrHashes[i],
            status: 'valido',
          })
          .select('id')
          .single();

        if (ing) {
          await supabase.from('pagamentos').insert({
            ingresso_id: ing.id,
            valor: 0,
            status: 'aprovado',
            gateway_transaction_id: freeGatewayId,
            metodo_pagamento: 'gratuito',
          });
        }
      }

      logger.info('Ingresso gratuito emitido com sucesso', { comprador_id, evento_id, quantidade: qtd });
      return NextResponse.json({
        url: `/meus-ingressos?status_pedido=aprovado&pedido_id=${pedidoGratuito?.id || ''}&evento_id=${evento_id}&lote_id=${lote_id}&comprador_id=${comprador_id}`,
      });
    }

    // 7. Pagamento Pago: Verificar configuração do gateway
    if (!ehMercadoPagoConfigurado()) {
      return NextResponse.json(
        {
          erro: 'O gateway de pagamento do Mercado Pago não está configurado no servidor.',
        },
        { status: 500 }
      );
    }

    // 8. CRIAÇÃO PRÉVIA DO PEDIDO NO BANCO (STATUS = 'pendente')
    const dataInicio = new Date();
    const dataExpiracao = new Date(Date.now() + TEMPO_EXPIRACAO_PIX_MINUTOS * 60 * 1000); // 30 minutos de validade
    let orderId = crypto.randomUUID();

    try {
      const { data: pedidoCriado, error: erroCriarPedido } = await supabase
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
          expira_em: dataExpiracao.toISOString(),
        })
        .select('id')
        .maybeSingle();

      if (pedidoCriado?.id) {
        orderId = pedidoCriado.id;
      } else if (erroCriarPedido) {
        logger.warn('Tabela pedidos pendente de criação no Supabase via migração 026. Prosseguindo com order_id seguro.', {
          erro: erroCriarPedido.message,
          orderId,
        });
      }
    } catch (dbErr) {
      logger.warn('Exceção ao inserir em pedidos. Prosseguindo com order_id UUID resiliente.', { erro: dbErr });
    }


    // 9. Resolução da URL Base Canônica do sistema
    const hostHeader = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
    const dominioPrincipal = (process.env.NEXT_PUBLIC_DOMINIO_PRINCIPAL || 'meuingrss.com.br').replace(/\/+$/, '');
    const protocoloConfig = process.env.NEXT_PUBLIC_PROTOCOLO || 'https';

    let baseUrl = `${protocoloConfig}://${dominioPrincipal}`;
    if (hostHeader && (hostHeader.includes('localhost') || hostHeader.includes(dominioPrincipal.split(':')[0]))) {
      const protoHeader = request.headers.get('x-forwarded-proto') || (hostHeader.includes('localhost') ? 'http' : 'https');
      baseUrl = `${protoHeader}://${hostHeader}`;
    }
    baseUrl = baseUrl.replace(/\/+$/, '');

    const successUrl = `${baseUrl}/meus-ingressos?pedido_id=${orderId}&status_pedido=aguardando`;
    const failureUrl = `${baseUrl}/eventos/${evento_id}?pagamento_cancelado=true`;
    const pendingUrl = `${baseUrl}/meus-ingressos?pedido_id=${orderId}&status_pedido=aguardando`;

    // 10. Montagem da Preferência do Mercado Pago
    const dataFormatada = evento.data_evento
      ? new Date(evento.data_evento).toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';

    const descricaoEvento = [
      `Ingresso ${lote.nome_lote}`,
      dataFormatada ? `Data: ${dataFormatada}` : null,
      evento.local ? `Local: ${evento.local}` : null,
      evento.cidade ? `Cidade: ${evento.cidade}` : null,
    ].filter(Boolean).join(' | ');

    interface ItemPreferencePayload {
      id: string;
      title: string;
      description: string;
      category_id: string;
      quantity: number;
      unit_price: number;
      currency_id: string;
      picture_url?: string;
    }

    const itemsPayload: ItemPreferencePayload[] = [
      {
        id: lote_id,
        title: `${evento.titulo} — ${lote.nome_lote}`,
        description: descricaoEvento ? `${descricaoEvento} (R$ ${precoUnitario.toFixed(2).replace('.', ',')})` : `Ingresso para ${evento.titulo} (R$ ${precoUnitario.toFixed(2).replace('.', ',')})`,
        category_id: 'tickets',
        quantity: qtd,
        unit_price: Number(precoUnitario.toFixed(2)),
        currency_id: 'BRL',
      },
    ];

    if (taxaServicoUnitaria > 0) {
      itemsPayload.push({
        id: `TAXA-${lote_id}`,
        title: `Taxa da Plataforma (${TAXA_SERVICO_LABEL})`,
        description: `Taxa de intermediação da plataforma e processamento (R$ ${taxaServicoUnitaria.toFixed(2).replace('.', ',')})`,
        category_id: 'services',
        quantity: qtd,
        unit_price: Number(taxaServicoUnitaria.toFixed(2)),
        currency_id: 'BRL',
      });
    }

    if (evento.imagem_url) {
      const imgUrl = evento.imagem_url.startsWith('http')
        ? evento.imagem_url
        : `${baseUrl}${evento.imagem_url.startsWith('/') ? '' : '/'}${evento.imagem_url}`;
      itemsPayload[0].picture_url = imgUrl;
    }

    interface PayerDataPayload {
      email: string;
      name: string;
      surname: string;
      phone?: {
        area_code: string;
        number: string;
      };
      identification?: {
        type: string;
        number: string;
      };
    }

    let payerData: PayerDataPayload | undefined;
    if (comprador?.email) {
      const nomePartes = (comprador.nome || '').trim().split(' ');
      const primeiroNome = nomePartes[0] || '';
      const sobrenome = nomePartes.slice(1).join(' ') || '';

      payerData = {
        email: comprador.email,
        name: primeiroNome,
        surname: sobrenome,
      };

      if (comprador.telefone) {
        const telLimpo = comprador.telefone.replace(/\D/g, '');
        if (telLimpo.length >= 10) {
          payerData.phone = {
            area_code: telLimpo.substring(0, 2),
            number: telLimpo.substring(2),
          };
        }
      }

      if (comprador.cpf) {
        const cpfLimpo = comprador.cpf.replace(/\D/g, '');
        if (cpfLimpo.length === 11) {
          payerData.identification = {
            type: 'CPF',
            number: cpfLimpo,
          };
        }
      }
    }

    // URL Canônica do Webhook
    const webhookUrl = `${protocoloConfig}://${dominioPrincipal}/api/webhook-mercadopago`;

    const preferencePayload = {
      items: itemsPayload,
      back_urls: {
        success: successUrl,
        failure: failureUrl,
        pending: pendingUrl,
      },
      auto_return: 'approved',
      statement_descriptor: 'MEUINGRSS',
      expires: true,
      expiration_date_from: dataInicio.toISOString(),
      expiration_date_to: dataExpiracao.toISOString(),
      date_of_expiration: dataExpiracao.toISOString(),
      payment_methods: {
        excluded_payment_types: [{ id: 'ticket' }], // Oculta boleto bancário demorado
        installments: 12,
        default_installments: 1,
      },
      external_reference: orderId, // Chave única que amarra o webhook ao pedido exato
      metadata: {
        pedido_id: orderId,
        evento_id,
        lote_id,
        comprador_id,
        quantidade: qtd,
        preco_unitario: precoUnitario,
        subtotal: Number((precoUnitario * qtd).toFixed(2)),
        taxa: taxaServicoTotal,
        total_final: totalFinal,
      },
      payer: payerData,
      notification_url: webhookUrl,
    };

    try {
      const preference = await preferenceClient.create({
        body: preferencePayload,
      });

      const checkoutUrl = preference.init_point || preference.sandbox_init_point;

      if (!checkoutUrl) {
        logger.error('Mercado Pago respondeu sem URL de checkout', null, { preferencePayload });
        return NextResponse.json({ erro: 'Não foi possível gerar o link de pagamento.' }, { status: 500 });
      }

      // Atualiza o pedido com o preference_id gerado
      await supabase
        .from('pedidos')
        .update({ preference_id: preference.id })
        .eq('id', orderId);

      logger.info('Pedido e preferência criados com sucesso', {
        pedido_id: orderId,
        preference_id: preference.id,
        evento_id,
        comprador_id,
      });

      return NextResponse.json({
        url: checkoutUrl,
        preference_id: preference.id,
        pedido_id: orderId,
      });
    } catch (mpErr: unknown) {
      const msg = mpErr instanceof Error ? mpErr.message : 'Falha na comunicação com o Mercado Pago';
      logger.error('Erro ao criar preferência no Mercado Pago', mpErr);
      return NextResponse.json({ erro: `Falha no gateway de pagamento: ${msg}` }, { status: 502 });
    }
  } catch (error: unknown) {
    const mensagemErro = error instanceof Error ? error.message : 'Ocorreu um erro interno ao processar sua compra.';
    logger.error('Erro não tratado na rota de checkout', error);
    return NextResponse.json({ erro: mensagemErro }, { status: 500 });
  }
}
