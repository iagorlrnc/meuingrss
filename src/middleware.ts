import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { obterSubdominio } from '@/lib/dominios';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hostname = request.headers.get('host') || '';
  const subdominio = obterSubdominio(hostname);

  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder',
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, {
              ...options,
              domain: process.env.NEXT_PUBLIC_DOMINIO_COOKIE || undefined,
            })
          );
        },
      },
    }
  );

  const dominioDiretoria = (
    process.env.NEXT_PUBLIC_SUBDOMINIO_DIRETORIA ||
    process.env.NEXT_PUBLIC_SUBDOMINIO_DIRETOR ||
    'diretoria.meuingrss.com.br'
  ).replace(/\/+$/, '');

  const dominioDev = (
    process.env.NEXT_PUBLIC_SUBDOMINIO_DEV ||
    process.env.NEXT_PUBLIC_SUBDOMINIO_ADMIN ||
    'dev.meuingrss.com.br'
  ).replace(/\/+$/, '');

  // Helper para preservar cookies em redirecionamentos e reescritas
  function redirecionarComCookies(url: string | URL): NextResponse {
    const resRedir = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => resRedir.cookies.set(c.name, c.value, c));
    return resRedir;
  }

  function reescreverComCookies(url: URL): NextResponse {
    const resRewr = NextResponse.rewrite(url, { headers: response.headers });
    response.cookies.getAll().forEach((c) => resRewr.cookies.set(c.name, c.value, c));
    return resRewr;
  }

  const ehAreaDiretor = subdominio === 'diretoria';
  const ehAreaAdmin = subdominio === 'dev';

  // Redireciona acessos legados com /diretor, /diretoria, /admin ou /dev para URLs limpas no respectivo subdomínio
  if (pathname.startsWith('/diretor') || pathname.startsWith('/diretoria')) {
    const caminhoLimpo = pathname.replace(/^\/(diretor|diretoria)/, '') || '/';
    const urlLimpa = request.nextUrl.clone();
    urlLimpa.host = dominioDiretoria;
    urlLimpa.pathname = caminhoLimpo;
    return redirecionarComCookies(urlLimpa);
  }

  if (pathname.startsWith('/admin') || pathname.startsWith('/dev')) {
    const caminhoLimpo = pathname.replace(/^\/(admin|dev)/, '') || '/';
    const urlLimpa = request.nextUrl.clone();
    urlLimpa.host = dominioDev;
    urlLimpa.pathname = caminhoLimpo;
    return redirecionarComCookies(urlLimpa);
  }

  if (pathname.startsWith('/cliente')) {
    const url404 = request.nextUrl.clone();
    url404.pathname = '/_not-found';
    return reescreverComCookies(url404);
  }
  const rotasClienteProtegidas = ['/meus-ingressos', '/checkout'];
  const precisaAuthCliente = rotasClienteProtegidas.some((rota) => pathname.startsWith(rota)) || pathname.includes('/checkout');

  let user = null;
  if (ehAreaDiretor || ehAreaAdmin || precisaAuthCliente) {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  }

  // --- REGRAS DO SUBDOMÍNIO DIRETORIA ---
  if (ehAreaDiretor) {
    const ehAuthDiretor = pathname === '/autenticacao/entrar' || pathname === '/autenticacao/cadastro';

    if (ehAuthDiretor) {
      const url = request.nextUrl.clone();
      url.pathname = `/diretor${pathname}`;
      return reescreverComCookies(url);
    }

    if (!user) {
      const urlLogin = request.nextUrl.clone();
      urlLogin.pathname = '/autenticacao/entrar';
      urlLogin.searchParams.set('redirecionar', pathname);
      return redirecionarComCookies(urlLogin);
    }

    // Verificar permissão
    const { data: perfil } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!perfil || (perfil.role !== 'diretor' && perfil.role !== 'admin')) {
      const urlLogin = request.nextUrl.clone();
      urlLogin.pathname = '/autenticacao/entrar';
      urlLogin.searchParams.set('erro', 'permissao_negada');
      return redirecionarComCookies(urlLogin);
    }

    const url = request.nextUrl.clone();
    url.pathname = pathname === '/' ? '/diretor' : `/diretor${pathname}`;
    return reescreverComCookies(url);
  }

  // --- REGRAS DO SUBDOMÍNIO DEV / ADMIN ---
  if (ehAreaAdmin) {
    const ehLoginAdmin = pathname === '/autenticacao/entrar';

    if (ehLoginAdmin) {
      const url = request.nextUrl.clone();
      url.pathname = '/admin/autenticacao/entrar';
      return reescreverComCookies(url);
    }

    if (!user) {
      const urlLogin = request.nextUrl.clone();
      urlLogin.pathname = '/autenticacao/entrar';
      urlLogin.searchParams.set('redirecionar', pathname);
      return redirecionarComCookies(urlLogin);
    }

    // Verificar permissão de admin
    const { data: perfil } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!perfil || perfil.role !== 'admin') {
      const urlLogin = request.nextUrl.clone();
      urlLogin.pathname = '/autenticacao/entrar';
      urlLogin.searchParams.set('erro', 'permissao_negada');
      return redirecionarComCookies(urlLogin);
    }

    const url = request.nextUrl.clone();
    url.pathname = pathname === '/' ? '/admin' : `/admin${pathname}`;
    return reescreverComCookies(url);
  }

  // --- REGRAS DO SUBDOMÍNIO CLIENTE (PRINCIPAL) & APIS ---
  if (precisaAuthCliente && !user) {
    const urlLogin = request.nextUrl.clone();
    urlLogin.pathname = '/autenticacao/entrar';
    urlLogin.searchParams.set('redirecionar', pathname);
    return redirecionarComCookies(urlLogin);
  }

  if (pathname.startsWith('/api')) {
    return response;
  }

  const url = request.nextUrl.clone();
  url.pathname = pathname === '/' ? '/cliente' : `/cliente${pathname}`;
  return reescreverComCookies(url);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|imagens/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
