import { TipoSubdominio } from '@/tipos';

const DOMINIO_PRINCIPAL = process.env.NEXT_PUBLIC_DOMINIO_PRINCIPAL || 'localhost:3000';
const SUBDOMINIO_DIRETOR = process.env.NEXT_PUBLIC_SUBDOMINIO_DIRETOR || 'diretor.localhost:3000';
const SUBDOMINIO_ADMIN = process.env.NEXT_PUBLIC_SUBDOMINIO_ADMIN || 'admin.localhost:3000';
const PROTOCOLO = process.env.NEXT_PUBLIC_PROTOCOLO || 'http';

export function obterSubdominio(hostname: string): TipoSubdominio {
  
  const hostSemPorta = hostname.split(':')[0];

  if (hostSemPorta.startsWith('diretor.')) {
    return 'diretor';
  }

  if (hostSemPorta.startsWith('admin.')) {
    return 'admin';
  }

  return 'cliente';
}

export function construirUrl(subdominio: TipoSubdominio, caminho: string = '/'): string {
  let dominio: string;

  switch (subdominio) {
    case 'diretor':
      dominio = SUBDOMINIO_DIRETOR;
      break;
    case 'admin':
      dominio = SUBDOMINIO_ADMIN;
      break;
    default:
      dominio = DOMINIO_PRINCIPAL;
  }

  const caminhoFormatado = caminho.startsWith('/') ? caminho : `/${caminho}`;
  return `${PROTOCOLO}://${dominio}${caminhoFormatado}`;
}

export function obterDominioCookie(): string | undefined {
  const dom = process.env.NEXT_PUBLIC_DOMINIO_COOKIE;
  return dom && dom !== 'localhost' ? dom : undefined;
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
      return construirUrl('diretor', '/');
    case 'admin':
      return construirUrl('admin', '/');
    default:
      return construirUrl('cliente', '/');
  }
}
