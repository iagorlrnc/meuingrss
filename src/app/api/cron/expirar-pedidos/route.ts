import { NextRequest, NextResponse } from 'next/server';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

/**
 * Endpoint de expiração de pedidos abandonados.
 *
 * Este endpoint deve ser chamado por um cron job externo (ex: Vercel Cron,
 * Supabase Edge Functions, cron-job.org) a cada 5 minutos.
 *
 * O que ele faz:
 * - Busca ingressos com status "valido" que foram criados recentemente (últimos 30 min)
 *   e que NÃO possuem pagamento associado com status "aprovado"
 * - Cancela esses ingressos e libera o estoque
 *
 * Na prática, com a arquitetura atual (ingressos só criados via webhook após aprovação),
 * isso serve como rede de segurança adicional contra inconsistências.
 *
 * Também limpa transações de teste/gratuitas com mais de 24h sem uso.
 *
 * Protegido por CRON_SECRET no header Authorization.
 */
export async function POST(request: NextRequest) {
  // Validação do secret para evitar chamadas não autorizadas
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    logger.error('CRON_SECRET não configurado no ambiente', null);
    return NextResponse.json(
      { erro: 'Configuração de cron incompleta no servidor' },
      { status: 500 }
    );
  }

  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    logger.security('Tentativa de acesso não autorizado ao endpoint de expiração de pedidos', {
      ip: request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1',
    });
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 });
  }

  try {
    const supabase = criarClienteAdmin();
    let totalExpirados = 0;

    // 1. Buscar ingressos "válidos" que possuem pagamentos com status "pendente"
    //    há mais de 30 minutos (indica pedido abandonado/expirado)
    const limiteExpiracao = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const { data: pagamentosPendentes, error: erroPagamentos } = await supabase
      .from('pagamentos')
      .select('id, ingresso_id, criado_em')
      .eq('status', 'pendente')
      .lt('criado_em', limiteExpiracao);

    if (erroPagamentos) {
      logger.error('Erro ao buscar pagamentos pendentes para expiração', erroPagamentos);
    }

    if (pagamentosPendentes && pagamentosPendentes.length > 0) {
      const ingressoIds = pagamentosPendentes.map(p => p.ingresso_id);

      // Atualiza pagamentos para "recusado"
      await supabase
        .from('pagamentos')
        .update({ status: 'recusado' })
        .in('id', pagamentosPendentes.map(p => p.id));

      // Cancela os ingressos associados (o trigger ao_cancelar_ingresso
      // vai decrementar automaticamente a quantidade_vendida no lote)
      const { data: cancelados } = await supabase
        .from('ingressos')
        .update({ status: 'cancelado' })
        .in('id', ingressoIds)
        .eq('status', 'valido')
        .select('id');

      totalExpirados = cancelados?.length || 0;

      if (totalExpirados > 0) {
        logger.info(`Expiração de pedidos: ${totalExpirados} ingresso(s) cancelado(s) por timeout`, {
          ingressos_expirados: totalExpirados,
        });
      }
    }

    // 2. Limpar pedidos com status 'pendente' criados há mais de 30 minutos
    const { data: pedidosExpirados } = await supabase
      .from('pedidos')
      .update({ status: 'recusado', atualizado_em: new Date().toISOString() })
      .eq('status', 'pendente')
      .lt('criado_em', limiteExpiracao)
      .select('id');

    const totalPedidosExpirados = pedidosExpirados?.length || 0;
    if (totalPedidosExpirados > 0) {
      logger.info(`Expiração de pedidos: ${totalPedidosExpirados} pedido(s) pendente(s) cancelado(s) por timeout.`);
    }

    return NextResponse.json({
      sucesso: true,
      ingressos_expirados: totalExpirados,
      pedidos_expirados: totalPedidosExpirados,
      executado_em: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Erro crítico no job de expiração de pedidos', error);
    return NextResponse.json(
      { erro: 'Erro ao executar expiração de pedidos' },
      { status: 500 }
    );
  }
}

// GET para verificação de health check do cron
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    servico: 'Cron de expiração de pedidos meuingrss',
    descricao: 'Envie um POST com Authorization: Bearer {CRON_SECRET} para executar',
  });
}
