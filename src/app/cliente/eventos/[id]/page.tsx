import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import ConteudoDetalheEvento from '@/componentes/eventos/ConteudoDetalheEvento';
import ComponenteJsonLdEvento from '@/componentes/seo/SeoJsonLd';
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
      robots: { index: false, follow: false },
    };
  }

  const titulo = `${evento.titulo} — Ingressos em ${evento.cidade || 'Palmas'} | meuingrss`;
  const descricao =
    evento.descricao
      ? (evento.descricao.length > 155 ? `${evento.descricao.slice(0, 152)}...` : evento.descricao)
      : `Garanta seu ingresso para ${evento.titulo} em ${evento.local || 'Palmas'}${
          evento.cidade ? `, ${evento.cidade}` : ''
        }. Compre online com segurança via Pix ou Cartão no meuingrss!`;

  const imagemUrl = resolverUrlAbsolutaImagem(evento.imagem_url);
  const dominioPrincipal = (process.env.NEXT_PUBLIC_DOMINIO_PRINCIPAL || 'meuingrss.com.br').replace(/\/+$/, '');
  const protocolo = process.env.NEXT_PUBLIC_PROTOCOLO || 'https';
  const urlPagina = `${protocolo}://${dominioPrincipal}/eventos/${evento.slug || evento.id}`;

  return {
    title: titulo,
    description: descricao,
    alternates: {
      canonical: urlPagina,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
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
  const eventoIdParam = resolvedParams?.id || '';
  const eventoInicial = await buscarEventoServerSide(eventoIdParam);

  if (!eventoInicial) {
    return <ConteudoDetalheEvento eventoInicial={null} />;
  }

  // Redirecionamento 301 se acessado via UUID e possui slug
  const ehUUID = UUID_REGEX.test(eventoIdParam);
  if (ehUUID && eventoInicial.slug) {
    redirect(`/eventos/${eventoInicial.slug}`);
  }

  const dominioPrincipal = (process.env.NEXT_PUBLIC_DOMINIO_PRINCIPAL || 'meuingrss.com.br').replace(/\/+$/, '');
  const protocolo = process.env.NEXT_PUBLIC_PROTOCOLO || 'https';
  const urlPagina = `${protocolo}://${dominioPrincipal}/eventos/${eventoInicial.slug || eventoInicial.id}`;
  const imagemUrl = resolverUrlAbsolutaImagem(eventoInicial.imagem_url);

  // Lotes ativos
  const lotesAtivos = (eventoInicial.lotes_ingresso || []).filter(
    (l) => l.ativo && l.quantidade_vendida < l.quantidade_total
  );
  const menorPreco =
    lotesAtivos.length > 0 ? Math.min(...lotesAtivos.map((l) => l.preco)) : null;
  const precoFormatado =
    menorPreco !== null && menorPreco > 0
      ? `R$ ${menorPreco.toFixed(2).replace('.', ',')}`
      : menorPreco === 0
      ? 'Gratuito'
      : 'Esgotado';

  const dataFormatadaStr = eventoInicial.data_evento
    ? new Date(eventoInicial.data_evento).toLocaleDateString('pt-BR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Data a definir';

  return (
    <>
      {/* 1. Injeção de Dados Estruturados Schema.org (Event, Breadcrumb, FAQ) */}
      <ComponenteJsonLdEvento
        evento={eventoInicial}
        urlPagina={urlPagina}
        imagemUrl={imagemUrl}
      />

      {/* 2. Bloco HTML Semântico embutido no HTML inicial retornado pelo servidor para crawlers de IA e Googlebot */}
      <article className="sr-only" aria-label={`Informações do evento ${eventoInicial.titulo}`}>
        <h1>{eventoInicial.titulo} — Ingressos em {eventoInicial.cidade || 'Palmas'}</h1>
        <p><strong>Organização:</strong> {eventoInicial.atletica?.nome || 'Atlética Organizadora'}</p>
        <p><strong>Data e Horário:</strong> {dataFormatadaStr}</p>
        <p><strong>Localização:</strong> {eventoInicial.local || 'Endereço a definir'}{eventoInicial.cidade ? `, ${eventoInicial.cidade}` : ''}</p>
        <p><strong>Preço dos Ingressos:</strong> A partir de {precoFormatado}</p>

        <h2>Sobre o Evento</h2>
        <div>
          {eventoInicial.descricao ||
            `Compre seu ingresso online para ${eventoInicial.titulo}. Entrada segura via QR Code digital no meuingrss.`}
        </div>

        <h2>Ingressos e Lotes Disponíveis</h2>
        <ul>
          {eventoInicial.lotes_ingresso?.map((lote) => (
            <li key={lote.id}>
              {lote.nome_lote}: R$ {lote.preco.toFixed(2).replace('.', ',')} (Status: {lote.ativo && lote.quantidade_vendida < lote.quantidade_total ? 'Disponível' : 'Esgotado'})
            </li>
          ))}
        </ul>

        <h2>Perguntas Frequentes</h2>
        <section>
          <h3>Como recebo meu ingresso para {eventoInicial.titulo}?</h3>
          <p>O ingresso é gerado digitalmente em formato QR Code em sua conta do meuingrss logo após a confirmação do pagamento por Pix ou Cartão.</p>

          <h3>Onde acontecerá {eventoInicial.titulo}?</h3>
          <p>O evento será realizado em {eventoInicial.local || 'Palmas/TO'}{eventoInicial.cidade ? `, ${eventoInicial.cidade}` : ''}.</p>

          <h3>Como comprar?</h3>
          <p>Acesse meuingrss.com.br, selecione o lote desejado para {eventoInicial.titulo} e conclua o pagamento com segurança.</p>
        </section>
      </article>

      {/* 3. Componente React Cliente Interativo */}
      <ConteudoDetalheEvento eventoInicial={eventoInicial} />
    </>
  );
}
