import { NextRequest, NextResponse } from 'next/server';
import { ehMercadoPagoConfigurado } from '@/lib/mercadopago';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { criarClienteServidor } from '@/lib/supabase/servidor';
import { logger } from '@/lib/logger';
import { verificarRateLimit } from '@/lib/rateLimit';
import { reconciliarEPagamentoeEmitirIngressos } from '@/lib/processarPagamento';

/**
 * Consulta o status real de um pedido de compra de ingresso.
 *
 * O frontend usa este endpoint para polling pós-checkout ou ao retornar do Mercado Pago.
 *
 * Fluxo:
 * 1. Verifica se já existem ingressos no banco (confirma que o webhook já processou)
 * 2. Se não encontrou ingressos no banco, mas recebeu um payment_id/collection_id do gateway,
 *    consulta a API do Mercado Pago diretamente e EMITE os ingressos de forma síncrona/atômica.
 * 3. Retorna o status final unificado para o cliente.
 */
export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1';

  // Rate limit: máx 30 req/min por IP
  const rateLimit = verificarRateLimit(`status_pedido_${ip}`, { janelaMs: 60000, maxRequisicoes: 30 });
  if (!rateLimit.permitido) {
    return NextResponse.json(
      { erro: 'Muitas consultas. Aguarde um momento.' },
      { status: 429 }
    );
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const paymentId = searchParams.get('payment_id') || searchParams.get('collection_id');
    const preferenceId = searchParams.get('preference_id');
    const compradorId = searchParams.get('comprador_id');
    const eventoId = searchParams.get('evento_id');
    const loteId = searchParams.get('lote_id');

    if (!compradorId || !eventoId || !loteId) {
      return NextResponse.json(
        { erro: 'Parâmetros obrigatórios: comprador_id, evento_id, lote_id' },
        { status: 400 }
      );
    }

    // 0. Proteção IDOR: Verificar se o usuário autenticado é o dono do comprador_id ou é admin
    const supabaseServidor = await criarClienteServidor();
    const { data: { user } } = await supabaseServidor.auth.getUser();

    if (!user) {
      return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 });
    }

    if (user.id !== compradorId) {
      const { data: perfil } = await supabaseServidor.from('profiles').select('role').eq('id', user.id).single();
      if (!perfil || perfil.role !== 'admin') {
        logger.security('IDOR prevenido: tentativa de consultar pedido de outro usuário', { caller: user.id, target: compradorId });
        return NextResponse.json({ erro: 'Acesso não autorizado aos dados deste pedido' }, { status: 403 });
      }
    }

    const supabase = criarClienteAdmin();

    // 0. Consultar primeiro a tabela oficial de `pedidos` se disponível
    try {
      const { data: pedido } = await supabase
        .from('pedidos')
        .select('status, quantidade, id')
        .eq('comprador_id', compradorId)
        .eq('evento_id', eventoId)
        .eq('lote_id', loteId)
        .order('criado_em', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pedido) {
        if (pedido.status === 'approved') {
          return NextResponse.json({
            status_pedido: 'aprovado',
            mensagem: 'Pagamento confirmado! Seus ingressos foram liberados.',
            quantidade_ingressos: pedido.quantidade,
          });
        }
        if (['rejected', 'cancelled', 'refunded', 'charged_back'].includes(pedido.status)) {
          return NextResponse.json({
            status_pedido: 'cancelado',
            mensagem: 'O pagamento foi recusado, cancelado ou estornado pelo gateway.',
          });
        }
      }
    } catch {
      // Ignora se tabela pedidos estiver ausente em dev
    }

    // 1. Verificar se já existem ingressos gerados para este comprador/evento/lote
    //    (indica que o webhook ou reconciliação prévia já liberou os ingressos)
    const { data: ingressosExistentes, error: erroIngressos } = await supabase
      .from('ingressos')
      .select('id, status, data_compra')
      .eq('comprador_id', compradorId)
      .eq('evento_id', eventoId)
      .eq('lote_id', loteId)
      .in('status', ['valido', 'utilizado'])
      .order('data_compra', { ascending: false })
      .limit(10);

    if (!erroIngressos && ingressosExistentes && ingressosExistentes.length > 0) {
      return NextResponse.json({
        status_pedido: 'aprovado',
        mensagem: 'Pagamento confirmado! Seus ingressos foram liberados.',
        quantidade_ingressos: ingressosExistentes.length,
      });
    }

    // 2. Se o gateway enviou o payment_id no retorno do checkout ou query param
    //    e os ingressos ainda não estão no banco, realiza a reconciliação direta
    if (paymentId && ehMercadoPagoConfigurado()) {
      logger.info('Iniciando reconciliação direta via payment_id no consultar-status-pedido', {
        paymentId,
        compradorId,
        eventoId,
      });

      const resultadoReconciliacao = await reconciliarEPagamentoeEmitirIngressos(paymentId, supabase);

      if (resultadoReconciliacao.status_pedido === 'aprovado') {
        return NextResponse.json({
          status_pedido: 'aprovado',
          mensagem: resultadoReconciliacao.mensagem,
          quantidade_ingressos: resultadoReconciliacao.quantidade_ingressos,
        });
      }

      if (resultadoReconciliacao.status_pedido === 'cancelado') {
        return NextResponse.json({
          status_pedido: 'cancelado',
          mensagem: resultadoReconciliacao.mensagem,
        });
      }
    }

    // 3. Verificar se a transação foi estornada por falta de estoque no lote (proteção anti-sobrevenda)
    const { data: transacaoProcessada } = await supabase
      .from('transacoes_processadas')
      .select('status')
      .eq('comprador_id', compradorId)
      .eq('evento_id', eventoId)
      .eq('lote_id', loteId)
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (transacaoProcessada && (transacaoProcessada.status === 'refunded' || transacaoProcessada.status === 'charged_back' || transacaoProcessada.status === 'estoque_esgotado')) {
      return NextResponse.json({
        status_pedido: 'estoque_esgotado',
        mensagem: 'O estoque do lote esgotou durante a compra. A emissão do ingresso foi impedida para evitar sobrevenda e o pagamento será estornado.',
      });
    }

    // 4. Verificar se existe algum pagamento recusado/estornado para este pedido
    const { data: ingressosCancelados } = await supabase
      .from('ingressos')
      .select('id, status')
      .eq('comprador_id', compradorId)
      .eq('evento_id', eventoId)
      .eq('lote_id', loteId)
      .eq('status', 'cancelado')
      .order('data_compra', { ascending: false })
      .limit(1);

    if (ingressosCancelados && ingressosCancelados.length > 0) {
      return NextResponse.json({
        status_pedido: 'cancelado',
        mensagem: 'O pagamento foi cancelado ou estornado. Seu ingresso não foi gerado.',
      });
    }

    // Status padrão: pagamento ainda não foi confirmado pelo webhook nem pelo gateway
    return NextResponse.json({
      status_pedido: 'aguardando',
      mensagem: 'Aguardando confirmação do pagamento pelo gateway...',
    });
  } catch (error) {
    logger.error('Erro ao consultar status do pedido', error);
    return NextResponse.json(
      { erro: 'Erro interno ao consultar status do pedido' },
      { status: 500 }
    );
  }
}
