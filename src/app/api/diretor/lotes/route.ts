import { NextRequest, NextResponse } from 'next/server';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { criarClienteServidor } from '@/lib/supabase/servidor';
import { logger } from '@/lib/logger';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Obtém o usuário autenticado suportando Authorization Bearer header e Cookies
 */
async function obterUsuarioAutenticado(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const supabaseAdmin = criarClienteAdmin();

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '').trim();
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (!userError && userData?.user) {
      return userData.user;
    }
  }

  try {
    const supabaseServidor = await criarClienteServidor();
    const { data: userData, error: userError } = await supabaseServidor.auth.getUser();
    if (!userError && userData?.user) {
      return userData.user;
    }
  } catch {
    // Continua
  }

  return null;
}

/**
 * Endpoint de Gerenciamento de Lotes de Ingresso (Diretor e Admin)
 */
export async function POST(request: NextRequest) {
  try {
    const user = await obterUsuarioAutenticado(request);

    if (!user) {
      return NextResponse.json({ erro: 'Sessão expirada. Faça login novamente para continuar.' }, { status: 401 });
    }

    const supabase = criarClienteAdmin();

    const { data: perfil } = await supabase
      .from('profiles')
      .select('id, role, atletica_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!perfil || (perfil.role !== 'diretor' && perfil.role !== 'admin')) {
      return NextResponse.json({ erro: 'Acesso restrito a diretores ou administradores de atléticas.' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const { lote_id, evento_id, nome_lote, preco, quantidade_total, ativo } = body;

    if (!evento_id || !UUID_REGEX.test(evento_id)) {
      return NextResponse.json({ erro: 'ID do evento inválido ou ausente.' }, { status: 400 });
    }

    if (!nome_lote || typeof nome_lote !== 'string' || !nome_lote.trim()) {
      return NextResponse.json({ erro: 'Nome do lote é obrigatório.' }, { status: 400 });
    }

    const precoNum = Number(preco);
    if (isNaN(precoNum) || precoNum < 0) {
      return NextResponse.json({ erro: 'Preço deve ser maior ou igual a zero.' }, { status: 400 });
    }

    const qtdNum = parseInt(String(quantidade_total), 10);
    if (isNaN(qtdNum) || qtdNum < 1) {
      return NextResponse.json({ erro: 'Quantidade total deve ser de no mínimo 1.' }, { status: 400 });
    }

    // 1. Verifica se o evento existe e se o usuário tem permissão sobre ele
    const { data: evento } = await supabase
      .from('eventos')
      .select('id, atletica_id, titulo')
      .eq('id', evento_id)
      .maybeSingle();

    if (!evento) {
      return NextResponse.json({ erro: 'Evento não encontrado.' }, { status: 404 });
    }

    if (perfil.role !== 'admin' && evento.atletica_id !== perfil.atletica_id) {
      logger.security('Tentativa não autorizada de criar lote em evento de outra atlética', {
        userId: user.id,
        userAtletica: perfil.atletica_id,
        eventoAtletica: evento.atletica_id,
      });
      return NextResponse.json({ erro: 'Você não tem permissão para gerenciar lotes deste evento.' }, { status: 403 });
    }

    // 2. Atualização ou Criação de Lote
    if (lote_id && UUID_REGEX.test(lote_id)) {
      // Atualização
      const { data: loteAtual } = await supabase
        .from('lotes_ingresso')
        .select('quantidade_vendida')
        .eq('id', lote_id)
        .maybeSingle();

      if (loteAtual && qtdNum < loteAtual.quantidade_vendida) {
        return NextResponse.json({
          erro: `A quantidade total não pode ser menor que os ingressos já vendidos (${loteAtual.quantidade_vendida}).`,
        }, { status: 400 });
      }

      const { data: loteAtualizado, error: errUpdate } = await supabase
        .from('lotes_ingresso')
        .update({
          nome_lote: nome_lote.trim(),
          preco: precoNum,
          quantidade_total: qtdNum,
          ativo: ativo !== undefined ? Boolean(ativo) : true,
        })
        .eq('id', lote_id)
        .select('*')
        .single();

      if (errUpdate) {
        logger.error('Erro ao atualizar lote de ingresso', errUpdate);
        return NextResponse.json({ erro: errUpdate.message || 'Erro ao atualizar lote' }, { status: 500 });
      }

      return NextResponse.json({ sucesso: true, lote: loteAtualizado, mensagem: 'Lote atualizado com sucesso' });
    } else {
      // Criação de novo lote
      const { data: lotesExistentes } = await supabase
        .from('lotes_ingresso')
        .select('id')
        .eq('evento_id', evento_id);

      const ordem = lotesExistentes?.length || 0;

      const { data: novoLote, error: errInsert } = await supabase
        .from('lotes_ingresso')
        .insert({
          evento_id,
          nome_lote: nome_lote.trim(),
          preco: precoNum,
          quantidade_total: qtdNum,
          quantidade_vendida: 0,
          ordem,
          ativo: ativo !== undefined ? Boolean(ativo) : true,
        })
        .select('*')
        .single();

      if (errInsert) {
        logger.error('Erro ao criar lote de ingresso', errInsert);
        return NextResponse.json({ erro: errInsert.message || 'Erro ao criar lote' }, { status: 500 });
      }

      return NextResponse.json({ sucesso: true, lote: novoLote, mensagem: 'Novo lote criado com sucesso' });
    }
  } catch (error) {
    logger.error('Erro interno na API de lotes do diretor', error);
    return NextResponse.json({ erro: 'Erro interno ao salvar lote' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await obterUsuarioAutenticado(request);

    if (!user) {
      return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
    }

    const supabase = criarClienteAdmin();

    const { data: perfil } = await supabase
      .from('profiles')
      .select('id, role, atletica_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!perfil || (perfil.role !== 'diretor' && perfil.role !== 'admin')) {
      return NextResponse.json({ erro: 'Acesso restrito a diretores ou administradores' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const loteId = searchParams.get('lote_id');

    if (!loteId || !UUID_REGEX.test(loteId)) {
      return NextResponse.json({ erro: 'ID do lote inválido' }, { status: 400 });
    }

    const { data: lote } = await supabase
      .from('lotes_ingresso')
      .select('id, quantidade_vendida, evento_id, eventos(atletica_id)')
      .eq('id', loteId)
      .maybeSingle();

    if (!lote) {
      return NextResponse.json({ erro: 'Lote não encontrado' }, { status: 404 });
    }

    if (lote.quantidade_vendida > 0) {
      return NextResponse.json({ erro: 'Não é possível excluir um lote que já possui ingressos vendidos' }, { status: 400 });
    }

    const eventoAtletica = (lote.eventos as { atletica_id?: string } | null)?.atletica_id;
    if (perfil.role !== 'admin' && eventoAtletica !== perfil.atletica_id) {
      return NextResponse.json({ erro: 'Você não tem permissão para excluir este lote' }, { status: 403 });
    }

    const { error: errDelete } = await supabase
      .from('lotes_ingresso')
      .delete()
      .eq('id', loteId);

    if (errDelete) {
      return NextResponse.json({ erro: errDelete.message }, { status: 500 });
    }

    return NextResponse.json({ sucesso: true, mensagem: 'Lote excluído com sucesso' });
  } catch (error) {
    return NextResponse.json({ erro: 'Erro interno ao excluir lote' }, { status: 500 });
  }
}
