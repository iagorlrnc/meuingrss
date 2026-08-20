import { NextRequest, NextResponse } from 'next/server';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { criarClienteServidor } from '@/lib/supabase/servidor';
import { logger } from '@/lib/logger';
import { verificarRateLimit } from '@/lib/rateLimit';
import { gerarHashIngresso } from '@/lib/gerarQrCode';
import { enviarNotificacaoIngressoLiberado } from '@/lib/notificacoes';
import crypto from 'crypto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1';

  // 1. Rate Limiting: Máximo de 20 solicitações por minuto por IP
  const rateLimit = verificarRateLimit(`checkout_free_${ip}`, { janelaMs: 60000, maxRequisicoes: 20 });
  if (!rateLimit.permitido) {
    logger.warn('Rate limit excedido na emissão de ingresso gratuito', { ip });
    return NextResponse.json(
      { erro: 'Muitas tentativas em curto intervalo. Aguarde um minuto.' },
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
      logger.security('Tentativa não autorizada de reservar ingresso gratuito', { ip });
      return NextResponse.json({ erro: 'Autenticação necessária para reservar ingressos.' }, { status: 401 });
    }

    if (user.id !== comprador_id) {
      const { data: perfil } = await supabaseServidor.from('profiles').select('role').eq('id', user.id).single();
      if (!perfil || perfil.role !== 'admin') {
        logger.security('IDOR prevenido ao reservar ingresso gratuito', { caller: user.id, target: comprador_id });
        return NextResponse.json({ erro: 'Ação não autorizada para este comprador.' }, { status: 403 });
      }
    }

    // 3. Validação de dados
    if (!evento_id || !lote_id || !quantidade || !comprador_id) {
      return NextResponse.json({ erro: 'Dados incompletos para a reserva do ingresso.' }, { status: 400 });
    }

    if (!UUID_REGEX.test(evento_id) || !UUID_REGEX.test(lote_id) || !UUID_REGEX.test(comprador_id)) {
      return NextResponse.json({ erro: 'Identificadores inválidos fornecidos.' }, { status: 400 });
    }

    const qtd = parseInt(String(quantidade), 10);
    if (isNaN(qtd) || qtd < 1 || qtd > 10) {
      return NextResponse.json({ erro: 'Quantidade de ingressos inválida (permitido de 1 a 10).' }, { status: 400 });
    }

    const supabase = criarClienteAdmin();

    // 4. Busca do lote e validação de gratuidade (Anti Price Tampering)
    const { data: lote, error: erroLote } = await supabase
      .from('lotes_ingresso')
      .select('id, nome_lote, preco, quantidade_total, quantidade_vendida, ativo')
      .eq('id', lote_id)
      .single();

    if (erroLote || !lote || !lote.ativo) {
      return NextResponse.json({ erro: 'Lote de ingressos indisponível ou esgotado.' }, { status: 400 });
    }

    if (Number(lote.preco) !== 0) {
      logger.security('Tentativa de reservar lote pago via endpoint gratuito', { loteId: lote.id, preco: lote.preco, userId: user.id });
      return NextResponse.json({ erro: 'Este lote não é gratuito. Prossiga pelo fluxo de pagamento regular.' }, { status: 400 });
    }

    const restantes = lote.quantidade_total - lote.quantidade_vendida;
    if (restantes < qtd) {
      return NextResponse.json({ erro: 'Ingressos insuficientes para este lote gratuito.' }, { status: 400 });
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
      .select('nome, email')
      .eq('id', comprador_id)
      .maybeSingle();

    // 5. Criação do Pedido Aprovado e Geração Atômica dos Ingressos
    const orderId = crypto.randomUUID();
    const freeGatewayId = `FREE-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;

    const { data: pedidoCriado, error: erroPedido } = await supabase
      .from('pedidos')
      .insert({
        id: orderId,
        comprador_id,
        evento_id,
        lote_id,
        quantidade: qtd,
        valor_unitario: 0,
        taxa_servico: 0,
        valor_total: 0,
        status: 'aprovado',
        gateway_payment_id: freeGatewayId,
        gateway_transaction_id: freeGatewayId,
        metodo_pagamento: 'gratuito',
        pago_em: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (erroPedido || !pedidoCriado) {
      logger.error('Erro ao criar pedido gratuito', erroPedido);
      return NextResponse.json({ erro: 'Falha ao processar reserva do ingresso gratuito.' }, { status: 500 });
    }

    const qrHashes: string[] = [];
    for (let i = 0; i < qtd; i++) {
      qrHashes.push(gerarHashIngresso(`FREE-${evento_id}-${orderId}-${i}`, evento_id));
    }

    // Tenta executar via RPC Atômica
    const { data: resRpc, error: errRpc } = await supabase.rpc('processar_pagamento_aprovado', {
      p_pedido_id: orderId,
      p_gateway_payment_id: freeGatewayId,
      p_metodo_pagamento: 'gratuito',
      p_qr_hashes: qrHashes,
    });

    if (errRpc || !resRpc?.sucesso) {
      // Fallback JS
      for (let i = 0; i < qtd; i++) {
        const hash = qrHashes[i];
        const { data: ing } = await supabase.from('ingressos').insert({
          evento_id,
          lote_id,
          comprador_id,
          qr_code_hash: hash,
          status: 'valido',
        }).select('id').single();

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
    }

    enviarNotificacaoIngressoLiberado({
      comprador_id,
      quantidade: qtd,
      gateway_transaction_id: freeGatewayId,
      email_comprador: comprador?.email || user.email,
    });

    logger.info('Ingresso gratuito reservado com sucesso', { orderId, evento_id, comprador_id, quantidade: qtd });

    return NextResponse.json({
      sucesso: true,
      pedido_id: orderId,
      status: 'approved',
      mensagem: 'Ingresso gratuito garantido com sucesso!',
      url: `/meus-ingressos?pedido_id=${orderId}&status_pedido=aprovado`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao processar ingresso gratuito';
    logger.error('Erro na emissão de ingresso gratuito', error);
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}
