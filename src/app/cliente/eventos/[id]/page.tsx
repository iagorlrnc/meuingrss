import { Metadata } from 'next';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import ConteudoDetalheEvento from '@/componentes/eventos/ConteudoDetalheEvento';
import type { EventoCompleto } from '@/lib/cacheEventos';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolverUrlAbsolutaImagem(urlStr?: string | null): string {
  if (!urlStr) {
    const dominio = (process.env.NEXT_PUBLIC_DOMINIO_PRINCIPAL || 'meuingrss.com.br').replace(/\/+$/, '');
    const protocolo = process.env.NEXT_PUBLIC_PROTOCOLO || 'https';
    return `${protocolo}://${dominio}/logomueingrss.png`;
  }

  if (urlStr.startsWith('http://') || urlStr.startsWith('https://')) {
    return urlStr;
  }

  const dominio = (process.env.NEXT_PUBLIC_DOMINIO_PRINCIPAL || 'meuingrss.com.br').replace(/\/+$/, '');
  const protocolo = process.env.NEXT_PUBLIC_PROTOCOLO || 'https';
  const path = urlStr.startsWith('/') ? urlStr : `/${urlStr}`;
  return `${protocolo}://${dominio}${path}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const resolvedParams = await params;
  const eventoIdParam = resolvedParams?.id || '';

  if (!eventoIdParam) {
    return { title: 'Evento | meuingrss' };
  }

  const ehUUID = UUID_REGEX.test(eventoIdParam);
  const supabase = criarClienteAdmin();

  let query = supabase
    .from('eventos')
    .select('id, slug, titulo, descricao, imagem_url, local, cidade, data_evento')
    .eq('apagado_pelo_diretor', false);

  if (ehUUID) {
    query = query.eq('id', eventoIdParam);
  } else {
    query = query.eq('slug', eventoIdParam);
  }

  const { data: evento } = await query.maybeSingle();

  if (!evento) {
    return {
      title: 'Evento Não Encontrado | meuingrss',
      description: 'O evento solicitado não foi encontrado no meuingrss.',
    };
  }

  const titulo = `${evento.titulo} | meuingrss`;
  const descricao =
    evento.descricao ||
    `Garanta seu ingresso para ${evento.titulo} em ${evento.local || 'meuingrss'}${
      evento.cidade ? `, ${evento.cidade}` : ''
    }. Compre online com segurança no meuingrss!`;

  const imagemUrl = resolverUrlAbsolutaImagem(evento.imagem_url);
  const dominioPrincipal = (process.env.NEXT_PUBLIC_DOMINIO_PRINCIPAL || 'meuingrss.com.br').replace(/\/+$/, '');
  const protocolo = process.env.NEXT_PUBLIC_PROTOCOLO || 'https';
  const urlPagina = `${protocolo}://${dominioPrincipal}/eventos/${evento.slug || evento.id}`;

  return {
    title: titulo,
    description: descricao,
    openGraph: {
      title: titulo,
      description: descricao,
      url: urlPagina,
      siteName: 'meuingrss',
      locale: 'pt_BR',
      type: 'website',
      images: [
        {
          url: imagemUrl,
          width: 1200,
          height: 630,
          alt: evento.titulo,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: titulo,
      description: descricao,
      images: [imagemUrl],
    },
  };
}

async function buscarEventoServerSide(eventoIdParam: string): Promise<EventoCompleto | null> {
  if (!eventoIdParam) return null;
  const ehUUID = UUID_REGEX.test(eventoIdParam);
  const supabase = criarClienteAdmin();

  let query = supabase
    .from('eventos')
    .select(`
      *,
      atletica:atleticas(*),
      lotes_ingresso(*)
    `)
    .eq('apagado_pelo_diretor', false);

  if (ehUUID) {
    query = query.eq('id', eventoIdParam);
  } else {
    query = query.eq('slug', eventoIdParam);
  }

  const { data } = await query.maybeSingle();
  if (data) {
    return data as unknown as EventoCompleto;
  }
  return null;
}

export default async function PaginaDetalheEventoServer({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;
  const eventoInicial = await buscarEventoServerSide(resolvedParams?.id || '');

  return <ConteudoDetalheEvento eventoInicial={eventoInicial} />;
}
