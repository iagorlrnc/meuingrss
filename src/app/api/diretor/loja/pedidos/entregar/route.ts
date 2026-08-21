import { NextRequest, NextResponse } from 'next/server';
import { criarClienteServidor } from '@/lib/supabase/servidor';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  try {
    const supabase = await criarClienteServidor();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
    }

    const { data: perfil } = await supabase
      .from('profiles')
      .select('id, role, atletica_id, nome')
      .eq('id', user.id)
      .single();

    if (!perfil || (perfil.role !== 'diretor' && perfil.role !== 'admin')) {
      return NextResponse.json({ erro: 'Acesso restrito para diretores e administradores.' }, { status: 403 });
    }

    const body = await request.json();
    const { order_id, entregue = true } = body;

    if (!order_id || !UUID_REGEX.test(order_id)) {
      return NextResponse.json({ erro: 'ID de pedido inválido.' }, { status: 400 });
    }

    const admin = criarClienteAdmin();

    // 1. Busca o pedido para validar permissão da atlética
    const { data: order, error: errOrder } = await admin
      .from('store_orders')
      .select('id, atletica_id, status, metadata')
      .eq('id', order_id)
      .single();

    if (errOrder || !order) {
      return NextResponse.json({ erro: 'Pedido não encontrado.' }, { status: 404 });
    }

    if (perfil.role === 'diretor' && order.atletica_id !== perfil.atletica_id) {
      logger.security('Tentativa não autorizada de alterar entrega de pedido de outra atlética', {
        userId: user.id,
        orderId: order_id,
      });
      return NextResponse.json({ erro: 'Você não tem permissão para gerenciar pedidos desta atlética.' }, { status: 403 });
    }

    const metadataAtual = (order.metadata && typeof order.metadata === 'object') ? order.metadata : {};

    // Validação: Não permite desmarcar entrega se já foi entregue
    if (metadataAtual.entregue) {
      return NextResponse.json(
        { erro: 'Este pedido já foi marcado como entregue e não pode ser desmarcado.' },
        { status: 400 }
      );
    }

    const novoMetadata = {
      ...metadataAtual,
      entregue: true,
      entregue_em: new Date().toISOString(),
      entregue_por_nome: perfil.nome || 'Diretoria',
      entregue_por_id: user.id,
    };

    const { data: orderAtualizado, error: errUpdate } = await admin
      .from('store_orders')
      .update({
        metadata: novoMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order_id)
      .select(`
        *,
        user:profiles(id, nome, email, telefone, cpf),
        items:store_order_items(*)
      `)
      .single();

    if (errUpdate || !orderAtualizado) {
      logger.error('Erro ao atualizar status de entrega do pedido', { erro: errUpdate?.message });
      return NextResponse.json({ erro: 'Falha ao atualizar status de entrega.' }, { status: 500 });
    }

    logger.info('Status de entrega do pedido atualizado com sucesso', {
      orderId: order_id,
      entregue: Boolean(entregue),
      usuarioId: user.id,
    });

    return NextResponse.json({
      sucesso: true,
      mensagem: entregue ? 'Pedido marcado como entregue!' : 'Status de entrega desmarcado.',
      order: orderAtualizado,
    });
  } catch (error) {
    logger.error('Erro inesperado ao atualizar entrega do pedido', {
      erro: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ erro: 'Erro interno no servidor.' }, { status: 500 });
  }
}
