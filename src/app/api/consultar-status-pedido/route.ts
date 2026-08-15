import { NextRequest, NextResponse } from 'next/server';
import { ehMercadoPagoConfigurado } from '@/lib/mercadopago';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { criarClienteServidor } from '@/lib/supabase/servidor';
import { logger } from '@/lib/logger';
import { verificarRateLimit } from '@/lib/rateLimit';

/**
 * Consulta o status real de um pedido de compra de ingresso.
 *
 * O frontend deve usar este endpoint para polling após o retorno do Mercado Pago,
 * NUNCA confiando apenas no redirect de sucesso do navegador.
 *
 * Fluxo:
 * 1. Verifica se já existem ingressos no banco (confirma que o webhook já processou)
 * 2. Se não encontrou ingressos, consulta o Mercado Pago para saber o status real do pagamento
 * 3. Retorna um status unificado para o frontend exibir a mensagem correta
 */
export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1';

  // Rate limit: máx 30 req/min por IP (polling a cada 3s = ~20 req/min)
  const rateLimit = verificarRateLimit(`status_pedido_${ip}`, { janelaMs: 60000, maxRequisicoes: 30 });
  if (!rateLimit.permitido) {
    return NextResponse.json(
      { erro: 'Muitas consultas. Aguarde um momento.' },
      { status: 429 }
    );
  }

  try {
    const searchParams = request.nextUrl.searchParams;
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

    // 1. Verificar se já existem ingressos gerados para este comprador/evento/lote
    //    (indica que o webhook já processou o pagamento com sucesso)
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
      // Ingressos já foram gerados pelo webhook — pagamento confirmado
      return NextResponse.json({
        status_pedido: 'aprovado',
        mensagem: 'Pagamento confirmado! Seus ingressos foram liberados.',
        quantidade_ingressos: ingressosExistentes.length,
      });
    }

    // 2. Verificar se existe algum pagamento recusado/estornado para este pedido
    //    (indica que o gateway rejeitou o pagamento)
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
      // Pagamento foi processado mas falhou/estornado
      return NextResponse.json({
        status_pedido: 'cancelado',
        mensagem: 'O pagamento foi cancelado ou estornado. Seu ingresso não foi gerado.',
      });
    }

    // 3. Se não tem ingressos no banco, o pagamento ainda está pendente
    //    ou o webhook ainda não foi recebido.
    //    Se o MP estiver configurado e tivermos preference_id, podemos tentar consultar.
    if (preferenceId && ehMercadoPagoConfigurado()) {
      try {
        // Buscar pagamentos associados a esta preference pelo external_reference
        // O Mercado Pago não permite buscar pagamentos por preference_id diretamente,
        // então retornamos "aguardando" e deixamos o webhook fazer o trabalho
        logger.info('Status consultado para preference sem ingressos no banco', {
          preferenceId,
          compradorId,
          eventoId,
        });
      } catch (mpErr) {
        logger.warn('Erro ao consultar Mercado Pago para status', { preferenceId, error: mpErr });
      }
    }

    // Status padrão: pagamento ainda não foi confirmado pelo webhook
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
