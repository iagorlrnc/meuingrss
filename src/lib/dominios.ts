import { TipoSubdominio } from '@/tipos';

const DOMINIO_PRINCIPAL = process.env.NEXT_PUBLIC_DOMINIO_PRINCIPAL || 'meuingrss.com.br';
const SUBDOMINIO_DIRETORIA = process.env.NEXT_PUBLIC_SUBDOMINIO_DIRETORIA || process.env.NEXT_PUBLIC_SUBDOMINIO_DIRETOR || 'diretoria.meuingrss.com.br';
const SUBDOMINIO_DEV = process.env.NEXT_PUBLIC_SUBDOMINIO_DEV || process.env.NEXT_PUBLIC_SUBDOMINIO_ADMIN || 'dev.meuingrss.com.br';
const PROTOCOLO = process.env.NEXT_PUBLIC_PROTOCOLO || 'https';

export function obterSubdominio(hostname: string): TipoSubdominio {
  
  const hostSemPorta = hostname.split(':')[0];

  if (hostSemPorta.startsWith('diretoria.')) {
    return 'diretoria';
  }

  if (hostSemPorta.startsWith('dev.')) {
    return 'dev';
  }

  return 'cliente';
}

export function construirUrl(subdominio: TipoSubdominio | 'diretor' | 'admin', caminho: string = '/'): string {
  let dominio: string;

  switch (subdominio) {
    case 'diretoria':
    case 'diretor':
      dominio = SUBDOMINIO_DIRETORIA;
      break;
    case 'dev':
    case 'admin':
      dominio = SUBDOMINIO_DEV;
      break;
    default:
      dominio = DOMINIO_PRINCIPAL;
  }

  const dominioLimpo = dominio.replace(/\/+$/, '');
  const caminhoFormatado = caminho.startsWith('/') ? caminho : `/${caminho}`;
  return `${PROTOCOLO}://${dominioLimpo}${caminhoFormatado}`;
}

export function obterDominioCookie(): string | undefined {
  const dom = process.env.NEXT_PUBLIC_DOMINIO_COOKIE;
  return dom && !dom.includes('localhost') ? dom.replace(/\/+$/, '') : undefined;
}

export function ehDominioPrincipal(hostname: string): boolean {
  return obterSubdominio(hostname) === 'cliente';
}

export function obterUrlLogin(): string {
  return construirUrl('cliente', '/autenticacao/entrar');
}

export function obterUrlPorRole(role: string): string {
  switch (role) {
    case 'diretor':
      return construirUrl('diretoria', '/');
    case 'admin':
      return construirUrl('dev', '/');
    default:
      return construirUrl('cliente', '/');
  }
}
