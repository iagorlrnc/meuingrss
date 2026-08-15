import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const redirecionar = searchParams.get('redirecionar') || '/';

  if (code) {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder',
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              
            }
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data: perfil } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        if (!perfil) {
          // Se for o primeiro login via Google, cria o perfil automaticamente
          await supabase.from('profiles').upsert({
            id: user.id,
            nome: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Usuário',
            email: user.email || '',
            role: 'cliente',
            avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
            status: 'ativo',
            criado_em: new Date().toISOString(),
            atualizado_em: new Date().toISOString(),
          });
        } else {
          const protocolo = process.env.NEXT_PUBLIC_PROTOCOLO || 'https';

          if (perfil.role === 'diretor') {
            const dominioDiretoria = (process.env.NEXT_PUBLIC_SUBDOMINIO_DIRETORIA || process.env.NEXT_PUBLIC_SUBDOMINIO_DIRETOR || 'diretoria.meuingrss.com.br').replace(/\/+$/, '');
            return NextResponse.redirect(new URL(`${protocolo}://${dominioDiretoria}/`));
          }

          if (perfil.role === 'admin') {
            const dominioDev = (process.env.NEXT_PUBLIC_SUBDOMINIO_DEV || process.env.NEXT_PUBLIC_SUBDOMINIO_ADMIN || 'dev.meuingrss.com.br').replace(/\/+$/, '');
            return NextResponse.redirect(new URL(`${protocolo}://${dominioDev}/`));
          }
        }
      }

      return NextResponse.redirect(new URL(redirecionar, origin));
    }
  }

  
  return NextResponse.redirect(new URL('/autenticacao/entrar?erro=callback', origin));
}
