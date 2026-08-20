import { NextRequest, NextResponse } from 'next/server';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { criarClienteServidor } from '@/lib/supabase/servidor';

export async function POST(request: NextRequest) {
  try {
    const supabaseServidor = await criarClienteServidor();
    const { data: { user } } = await supabaseServidor.auth.getUser();

    if (!user) {
      return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 });
    }

    const { nome, cpf, telefone } = await request.json();
    const payload: Record<string, any> = {};

    if (nome && typeof nome === 'string' && nome.trim()) payload.nome = nome.trim();
    if (cpf && typeof cpf === 'string') payload.cpf = cpf;
    if (telefone && typeof telefone === 'string') payload.telefone = telefone;

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ ok: true, mensagem: 'Nenhum dado para atualizar' });
    }

    payload.atualizado_em = new Date().toISOString();

    const supabaseAdmin = criarClienteAdmin();
    const { error } = await supabaseAdmin
      .from('profiles')
      .update(payload)
      .eq('id', user.id);

    if (error) {
      return NextResponse.json({ erro: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, payload });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao sincronizar perfil';
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}
