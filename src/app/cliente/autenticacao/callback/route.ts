import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

function obterOrigemPublica(request: Request): string {
  const hostHeader = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const protoHeader = request.headers.get('x-forwarded-proto') || process.env.NEXT_PUBLIC_PROTOCOLO || 'https';
  
  if (hostHeader && !hostHeader.includes('localhost') && !hostHeader.includes('127.0.0.1')) {
    return `${protoHeader}://${hostHeader}`;
  }

  const envDominio = process.env.NEXT_PUBLIC_DOMINIO_PRINCIPAL;
  const envProto = process.env.NEXT_PUBLIC_PROTOCOLO || 'https';
  if (envDominio && !envDominio.includes('localhost')) {
    return `${envProto}://${envDominio.replace(/\/+$/, '')}`;
  }

  return new URL(request.url).origin;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  let redirecionar = searchParams.get('redirecionar') || '/';

  // Sanitizar URL de destino para prevenir mal-uso ou loops
  if (!redirecionar.startsWith('/') || redirecionar.startsWith('//') || redirecionar.includes('/autenticacao/entrar') || redirecionar.includes('/autenticacao/cadastro')) {
    redirecionar = '/';
  }

  const origemPublica = obterOrigemPublica(request);
  const cookieStore = await cookies();
  const cookiesParaDefinir: { name: string; value: string; options: any }[] = [];

  function criarRespostaRedirecionamento(caminhoOuUrl: string): NextResponse {
    const urlDestino = caminhoOuUrl.startsWith('http://') || caminhoOuUrl.startsWith('https://')
      ? new URL(caminhoOuUrl)
      : new URL(caminhoOuUrl, origemPublica);

    const resRedir = NextResponse.redirect(urlDestino);
    const domainCookie = process.env.NEXT_PUBLIC_DOMINIO_COOKIE || undefined;

    cookiesParaDefinir.forEach(({ name, value, options }) => {
      resRedir.cookies.set(name, value, {
        ...options,
        domain: domainCookie || options?.domain,
      });
    });

    return resRedir;
  }

  if (code) {
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
              cookiesToSet.forEach(({ name, value, options }) => {
                cookieStore.set(name, value, options);
                cookiesParaDefinir.push({ name, value, options });
              });
            } catch {
              // Silencioso em caso de restrição de cookie no servidor
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
          .select('role, status')
          .eq('id', user.id)
          .single();

        if (!perfil) {
          // Se for o primeiro cadastro/login via Google, cria o perfil do cliente automaticamente
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
          if (perfil.status === 'bloqueado') {
            await supabase.auth.signOut();
            return criarRespostaRedirecionamento('/autenticacao/entrar?erro=conta_bloqueada');
          }

          const protocolo = process.env.NEXT_PUBLIC_PROTOCOLO || 'https';

          if (perfil.role === 'diretor') {
            const dominioDiretoria = (process.env.NEXT_PUBLIC_SUBDOMINIO_DIRETORIA || process.env.NEXT_PUBLIC_SUBDOMINIO_DIRETOR || 'diretoria.meuingrss.com.br').replace(/\/+$/, '');
            return criarRespostaRedirecionamento(`${protocolo}://${dominioDiretoria}/`);
          }

          if (perfil.role === 'admin') {
            const dominioDev = (process.env.NEXT_PUBLIC_SUBDOMINIO_DEV || process.env.NEXT_PUBLIC_SUBDOMINIO_ADMIN || 'dev.meuingrss.com.br').replace(/\/+$/, '');
            return criarRespostaRedirecionamento(`${protocolo}://${dominioDev}/`);
          }
        }
      }

      return criarRespostaRedirecionamento(redirecionar);
    }
  }

  return criarRespostaRedirecionamento('/autenticacao/entrar?erro=callback');
}

