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
 * Endpoint para Cancelamento de Ingresso pelo Diretor ou Administrador
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
    const { ingresso_id } = body;

    if (!ingresso_id || !UUID_REGEX.test(ingresso_id)) {
      return NextResponse.json({ erro: 'ID do ingresso inválido ou ausente.' }, { status: 400 });
    }

    // Busca o ingresso e o evento correspondente para checar permissão
    const { data: ingresso, error: erroIngresso } = await supabase
      .from('ingressos')
      .select('id, evento_id, status, evento:eventos(id, atletica_id, titulo)')
      .eq('id', ingresso_id)
      .maybeSingle();

    if (erroIngresso || !ingresso) {
      return NextResponse.json({ erro: 'Ingresso não encontrado.' }, { status: 404 });
    }

    const evento = Array.isArray(ingresso.evento) ? ingresso.evento[0] : ingresso.evento;

    if (perfil.role !== 'admin' && evento?.atletica_id !== perfil.atletica_id) {
      logger.security('Tentativa não autorizada de cancelar ingresso de outra atlética', {
        userId: user.id,
        userAtletica: perfil.atletica_id,
        eventoAtletica: evento?.atletica_id,
      });
      return NextResponse.json({ erro: 'Você não tem permissão para cancelar ingressos deste evento.' }, { status: 403 });
    }

    // Atualiza o status do ingresso para 'cancelado'
    const { error: erroUpdate } = await supabase
      .from('ingressos')
      .update({ status: 'cancelado' })
      .eq('id', ingresso_id);

    if (erroUpdate) {
      logger.error('Erro ao atualizar status do ingresso no banco', erroUpdate);
      return NextResponse.json({ erro: 'Falha ao atualizar o status do ingresso no banco de dados.' }, { status: 500 });
    }

    return NextResponse.json({
      sucesso: true,
      mensagem: 'Ingresso cancelado com sucesso.',
    });
  } catch (err: unknown) {
    const mensagem = err instanceof Error ? err.message : 'Erro interno do servidor ao cancelar ingresso.';
    logger.error('Exceção ao cancelar ingresso:', err);
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
