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

  const protocolo = process.env.NEXT_PUBLIC_PROTOCOLO || 'https';
  const dominioDiretor = (process.env.NEXT_PUBLIC_SUBDOMINIO_DIRETOR || 'diretoria.meuingrss.com.br').replace(/\/+$/, '');
  const dominioAdmin = (process.env.NEXT_PUBLIC_SUBDOMINIO_ADMIN || 'dev.meuingrss.com.br').replace(/\/+$/, '');

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

  // --- REDIRECIONAMENTOS DE EXCLUSIVIDADE & HIGIENIZAÇÃO DE URL ---

  // 1. Acesso a rotas de Diretor tentado fora do subdomínio de Diretoria (redireciona para subdomínio exclusivo)
  if (subdominio !== 'diretor' && (pathname.startsWith('/diretor') || pathname.startsWith('/diretoria'))) {
    const caminhoLimpo = pathname
      .replace(/^\/diretor\b/, '')
      .replace(/^\/diretoria\b/, '');
    const urlDestino = `${protocolo}://${dominioDiretor}${caminhoLimpo || '/'}${request.nextUrl.search}`;
    return redirecionarComCookies(urlDestino);
  }

  // 2. Acesso a rotas de Admin tentado fora do subdomínio de Admin (dev) (redireciona para subdomínio exclusivo)
  if (subdominio !== 'admin' && (pathname.startsWith('/admin') || pathname.startsWith('/dev'))) {
    const caminhoLimpo = pathname
      .replace(/^\/admin\b/, '')
      .replace(/^\/dev\b/, '');
    const urlDestino = `${protocolo}://${dominioAdmin}${caminhoLimpo || '/'}${request.nextUrl.search}`;
    return redirecionarComCookies(urlDestino);
  }

  // 3. Se estiver NO subdomínio de Diretoria mas a URL ainda contiver /diretor ou /diretoria no caminho exposto
  if (subdominio === 'diretor' && (pathname.startsWith('/diretor') || pathname.startsWith('/diretoria'))) {
    const caminhoLimpo = pathname
      .replace(/^\/diretor\b/, '')
      .replace(/^\/diretoria\b/, '');
    const urlDestino = `${protocolo}://${hostname}${caminhoLimpo || '/'}${request.nextUrl.search}`;
    return redirecionarComCookies(urlDestino);
  }

  // 4. Se estiver NO subdomínio de Admin (dev) mas a URL ainda contiver /admin ou /dev no caminho exposto
  if (subdominio === 'admin' && (pathname.startsWith('/admin') || pathname.startsWith('/dev'))) {
    const caminhoLimpo = pathname
      .replace(/^\/admin\b/, '')
      .replace(/^\/dev\b/, '');
    const urlDestino = `${protocolo}://${hostname}${caminhoLimpo || '/'}${request.nextUrl.search}`;
    return redirecionarComCookies(urlDestino);
  }

  // 5. Se no subdomínio Principal a URL contiver /cliente no caminho exposto, redireciona para a rota limpa
  if (subdominio === 'cliente' && pathname.startsWith('/cliente')) {
    const caminhoLimpo = pathname.replace(/^\/cliente\b/, '');
    const urlDestino = `${protocolo}://${hostname}${caminhoLimpo || '/'}${request.nextUrl.search}`;
    return redirecionarComCookies(urlDestino);
  }

  // --- LÓGICA DE AUTENTICAÇÃO E REESCRITA INTERNA (APP ROUTER) ---

  const ehAreaDiretor = subdominio === 'diretor';
  const ehAreaAdmin = subdominio === 'admin';
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
