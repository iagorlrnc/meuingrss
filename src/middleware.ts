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

  
  const ehAreaDiretor = subdominio === 'diretor' || pathname.startsWith('/diretor');
  const ehAreaAdmin = subdominio === 'admin' || pathname.startsWith('/admin');
  const rotasClienteProtegidas = ['/meus-ingressos', '/checkout', '/cliente/meus-ingressos'];
  const precisaAuthCliente = rotasClienteProtegidas.some((rota) => pathname.startsWith(rota)) || pathname.includes('/checkout');

  // Só executa o fetch de autenticação se a rota exigir verificação de permissão
  let user = null;
  if (ehAreaDiretor || ehAreaAdmin || precisaAuthCliente) {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  }

  // Helper para preservar cookies em redirecionamentos e reescritas
  function redirecionarComCookies(url: URL): NextResponse {
    const resRedir = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => resRedir.cookies.set(c.name, c.value, c));
    return resRedir;
  }

  function reescreverComCookies(url: URL): NextResponse {
    const resRewr = NextResponse.rewrite(url, { headers: response.headers });
    response.cookies.getAll().forEach((c) => resRewr.cookies.set(c.name, c.value, c));
    return resRewr;
  }

  // --- REGRA 1: ÁREA DO DIRETOR ---
  if (ehAreaDiretor) {
    const ehAuthDiretor = pathname.includes('/autenticacao/entrar') || pathname.includes('/autenticacao/cadastro');

    if (ehAuthDiretor) {
      if (pathname.startsWith('/diretor/')) return response;
      const url = request.nextUrl.clone();
      url.pathname = pathname.includes('/autenticacao/cadastro') ? '/diretor/autenticacao/cadastro' : '/diretor/autenticacao/entrar';
      return reescreverComCookies(url);
    }

    if (!user) {
      const urlLogin = request.nextUrl.clone();
      urlLogin.pathname = '/diretor/autenticacao/entrar';
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
      urlLogin.pathname = '/diretor/autenticacao/entrar';
      urlLogin.searchParams.set('erro', 'permissao_negada');
      return redirecionarComCookies(urlLogin);
    }

    if (pathname.startsWith('/diretor')) return response;

    const url = request.nextUrl.clone();
    url.pathname = pathname === '/' ? '/diretor' : `/diretor${pathname}`;
    return reescreverComCookies(url);
  }

  // --- REGRA 2: ÁREA DO ADMIN ---
  if (ehAreaAdmin) {
    const ehLoginAdmin = pathname.includes('/autenticacao/entrar');

    if (ehLoginAdmin) {
      if (pathname.startsWith('/admin/')) return response;
      const url = request.nextUrl.clone();
      url.pathname = '/admin/autenticacao/entrar';
      return reescreverComCookies(url);
    }

    if (!user) {
      const urlLogin = request.nextUrl.clone();
      urlLogin.pathname = '/admin/autenticacao/entrar';
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
      urlLogin.pathname = '/admin/autenticacao/entrar';
      urlLogin.searchParams.set('erro', 'permissao_negada');
      return redirecionarComCookies(urlLogin);
    }

    if (pathname.startsWith('/admin')) return response;

    const url = request.nextUrl.clone();
    url.pathname = pathname === '/' ? '/admin' : `/admin${pathname}`;
    return reescreverComCookies(url);
  }

  // --- REGRA 3: ÁREA DO CLIENTE & APIs ---
  if (precisaAuthCliente && !user) {
    const urlLogin = request.nextUrl.clone();
    urlLogin.pathname = '/cliente/autenticacao/entrar';
    urlLogin.searchParams.set('redirecionar', pathname);
    return redirecionarComCookies(urlLogin);
  }

  if (pathname.startsWith('/cliente') || pathname.startsWith('/api')) {
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
