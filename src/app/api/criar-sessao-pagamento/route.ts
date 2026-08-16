import { NextRequest, NextResponse } from 'next/server';
import { preferenceClient, ehMercadoPagoConfigurado } from '@/lib/mercadopago';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { criarClienteServidor } from '@/lib/supabase/servidor';
import { logger } from '@/lib/logger';
import { verificarRateLimit } from '@/lib/rateLimit';
import { gerarHashIngresso } from '@/lib/gerarQrCode';
import crypto from 'crypto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1';

  // Rate Limiting: Máximo de 20 solicitações de checkout por minuto por IP
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

    // 0. Autenticação e proteção IDOR
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

    // 1. Validação estrita de entrada e sanitização de dados
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

    // 2. Busca e validação do lote de ingressos
    const { data: lote, error: erroLote } = await supabase
      .from('lotes_ingresso')
      .select('*')
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
        { erro: 'Ingressos esgotados ou insuficientes. Devido à alta demanda de acessos simultâneos, este lote acaba de atingir o limite de vendas.' },
        { status: 400 }
      );
    }

    // 3. Busca informações do evento e do comprador
    const { data: evento, error: erroEvento } = await supabase
      .from('eventos')
      .select('titulo, descricao, imagem_url, data_evento, local, cidade')
      .eq('id', evento_id)
      .single();

    if (erroEvento || !evento) {
      return NextResponse.json({ erro: 'Evento não encontrado.' }, { status: 404 });
    }

    const { data: comprador } = await supabase
      .from('profiles')
      .select('nome, email, telefone')
      .eq('id', comprador_id)
      .maybeSingle();

    // 4. Caso o ingresso seja gratuito (Preço = 0)
    if (Number(lote.preco) === 0) {
      const freeTransactionId = `FREE-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
      const qrHashes: string[] = [];

      for (let i = 0; i < qtd; i++) {
        qrHashes.push(gerarHashIngresso(`FREE-${evento_id}-${i}`, evento_id));
      }

      const { data: resultadoRpc, error: erroRpc } = await supabase.rpc('processar_pagamento_aprovado', {
        p_gateway_transaction_id: freeTransactionId,
        p_evento_id: evento_id,
        p_lote_id: lote_id,
        p_comprador_id: comprador_id,
        p_quantidade: qtd,
        p_valor_unitario: 0,
        p_metodo_pagamento: 'gratuito',
        p_qr_hashes: qrHashes,
      });

      if (erroRpc || !resultadoRpc?.sucesso) {
        logger.error('Erro ao emitir ingresso gratuito via RPC', erroRpc || resultadoRpc?.erro, {
          evento_id,
          comprador_id,
        });
        return NextResponse.json({ erro: 'Não foi possível registrar o ingresso gratuito.' }, { status: 500 });
      }

      logger.info('Ingresso gratuito emitido com sucesso', { comprador_id, evento_id, quantidade: qtd });
      return NextResponse.json({
        url: `/meus-ingressos?status_pedido=aprovado&evento_id=${evento_id}&lote_id=${lote_id}&comprador_id=${comprador_id}`,
      });
    }

    // 5. Pagamento Pago: Verificar se a API do Mercado Pago está devidamente configurada
    if (!ehMercadoPagoConfigurado()) {
      return NextResponse.json(
        {
          erro: 'O gateway de pagamento do Mercado Pago não está configurado. Adicione o MERCADOPAGO_ACCESS_TOKEN no arquivo .env.local.',
        },
        { status: 400 }
      );
    }

    // 6. Resolução dinâmica e limpa da URL Base do sistema
    const hostHeader = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
    const dominioPrincipal = (process.env.NEXT_PUBLIC_DOMINIO_PRINCIPAL || 'meuingrss.com.br').replace(/\/+$/, '');
    const protocoloConfig = process.env.NEXT_PUBLIC_PROTOCOLO || 'https';

    // Validar se o host enviado corresponde aos domínios confiáveis do sistema
    let baseUrl = `${protocoloConfig}://${dominioPrincipal}`;
    if (hostHeader && (hostHeader.includes('localhost') || hostHeader.includes(dominioPrincipal.split(':')[0]))) {
      const protoHeader = request.headers.get('x-forwarded-proto') || (hostHeader.includes('localhost') ? 'http' : 'https');
      baseUrl = `${protoHeader}://${hostHeader}`;
    }
    baseUrl = baseUrl.replace(/\/+$/, '');

    const statusParams = `evento_id=${evento_id}&lote_id=${lote_id}&comprador_id=${comprador_id}`;
    const successUrl = `${baseUrl}/meus-ingressos?status_pedido=aguardando&${statusParams}`;
    const failureUrl = `${baseUrl}/eventos/${evento_id}?pagamento_cancelado=true`;
    const pendingUrl = `${baseUrl}/meus-ingressos?status_pedido=aguardando&${statusParams}`;

    const TAXA_PERCENTUAL = 0.12;
    const subtotal = Number(lote.preco) * qtd;
    const taxaServicoUnitaria = Number(lote.preco) === 0 ? 0 : Math.round((Number(lote.preco) * TAXA_PERCENTUAL) * 100) / 100;
    const taxaServicoTotal = taxaServicoUnitaria * qtd;
    const totalFinal = subtotal + taxaServicoTotal;

    const metadata = {
      evento_id,
      lote_id,
      comprador_id,
      quantidade: String(qtd),
      preco_unitario: String(lote.preco),
      subtotal: String(subtotal),
      taxa: String(taxaServicoTotal),
      total_final: String(totalFinal),
    };

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
        description: descricaoEvento || `Ingresso para ${evento.titulo}`,
        category_id: 'tickets',
        quantity: qtd,
        unit_price: Number(lote.preco),
        currency_id: 'BRL',
      },
    ];

    if (taxaServicoUnitaria > 0) {
      itemsPayload.push({
        id: `TAXA-${lote_id}`,
        title: 'Taxa de Serviço e Plataforma (12%)',
        description: 'Taxa da plataforma e custos de processamento bancário',
        category_id: 'services',
        quantity: qtd,
        unit_price: taxaServicoUnitaria,
        currency_id: 'BRL',
      });
    }

    if (evento.imagem_url) {
      const imgUrl = evento.imagem_url.startsWith('http')
        ? evento.imagem_url
        : `${baseUrl}${evento.imagem_url.startsWith('/') ? '' : '/'}${evento.imagem_url}`;
      itemsPayload[0].picture_url = imgUrl;
    }

    // Define a validade da preferência e do QR Code PIX em exatamente 5 minutos
    const dataInicio = new Date();
    const dataExpiracao = new Date(dataInicio.getTime() + 5 * 60 * 1000); // 5 minutos

    interface PayerDataPayload {
      email: string;
      name: string;
      surname: string;
      phone?: {
        area_code: string;
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
    }

    // URL do Webhook oficial
    const ehUrlPublica = !baseUrl.includes('localhost') && !baseUrl.includes('127.0.0.1') && !baseUrl.includes('.local');

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
      payment_methods: {
        excluded_payment_types: [{ id: 'ticket' }], // Oculta boleto e pagamentos offline em lotéricas
        installments: 12, // Permite parcelamento em até 12x no cartão de crédito
        default_installments: 1,
      },
      external_reference: JSON.stringify(metadata),
      metadata: metadata,
      payer: payerData,
      notification_url: ehUrlPublica ? `${baseUrl}/api/webhook-mercadopago` : undefined,
    };

    try {
      const preference = await preferenceClient.create({
        body: preferencePayload,
      });

      const checkoutUrl = preference.init_point || preference.sandbox_init_point;

      if (!checkoutUrl) {
        logger.error('API do Mercado Pago respondeu sem init_point de checkout', null, { preferencePayload });
        return NextResponse.json({ erro: 'Não foi possível obter o link de checkout do Mercado Pago.' }, { status: 500 });
      }

      logger.info('Sessão de pagamento criada com sucesso no Mercado Pago (Validade Pix: 10 min, Parcelamento: até 12x)', {
        evento_id,
        comprador_id,
        preference_id: preference.id,
        expiracao: dataExpiracao.toISOString(),
      });

      return NextResponse.json({ url: checkoutUrl, preference_id: preference.id });
    } catch (mpErr: unknown) {
      const msg = mpErr instanceof Error ? mpErr.message : 'Falha na comunicação com o Mercado Pago';
      logger.error('Erro ao comunicar com a API do Mercado Pago', mpErr);
      return NextResponse.json({ erro: `Falha no Mercado Pago: ${msg}` }, { status: 400 });
    }
  } catch (error: unknown) {
    const mensagemErro = error instanceof Error ? error.message : 'Ocorreu um erro interno ao processar sua solicitação.';
    logger.error('Erro não tratado na rota de criação de sessão de pagamento', error);
    return NextResponse.json({ erro: mensagemErro }, { status: 500 });
  }
}
