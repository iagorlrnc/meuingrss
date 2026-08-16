import type { EventoCompleto } from '@/lib/cacheEventos';

interface SeoJsonLdProps {
  evento: EventoCompleto;
  urlPagina: string;
  imagemUrl: string;
}

export function gerarJsonLdEvento({ evento, urlPagina, imagemUrl }: SeoJsonLdProps) {
  const dominioPrincipal = (process.env.NEXT_PUBLIC_DOMINIO_PRINCIPAL || 'meuingrss.com.br').replace(/\/+$/, '');
  const protocolo = process.env.NEXT_PUBLIC_PROTOCOLO || 'https';
  const baseUrl = `${protocolo}://${dominioPrincipal}`;

  const cidade = evento.cidade || 'Palmas';
  const local = evento.local || 'Palmas - TO';

  // 1. Array de ofertas para cada lote de ingresso ativo
  const lotesAtivos = (evento.lotes_ingresso || []).filter(
    (l) => l.ativo && l.quantidade_vendida < l.quantidade_total
  );

  const offers = lotesAtivos.length > 0
    ? lotesAtivos.map((lote) => ({
        '@type': 'Offer',
        name: lote.nome_lote || 'Ingresso Individual',
        url: urlPagina,
        price: lote.preco ? lote.preco.toFixed(2) : '0.00',
        priceCurrency: 'BRL',
        availability: 'https://schema.org/InStock',
        validFrom: evento.criado_em || new Date().toISOString(),
      }))
    : [
        {
          '@type': 'Offer',
          url: urlPagina,
          price: '0.00',
          priceCurrency: 'BRL',
          availability:
            evento.status === 'encerrado' || evento.status === 'cancelado'
              ? 'https://schema.org/SoldOut'
              : 'https://schema.org/OutOfStock',
        },
      ];

  // Status do evento Schema.org
  let eventStatus = 'https://schema.org/EventScheduled';
  if (evento.status === 'cancelado') {
    eventStatus = 'https://schema.org/EventCancelled';
  } else if (evento.status === 'encerrado') {
    eventStatus = 'https://schema.org/EventMovedOnline'; // ou keep scheduled
  }

  // Data de término (fallback para 6 horas após a data de início se não especificado)
  const dataInicio = evento.data_evento ? new Date(evento.data_evento).toISOString() : new Date().toISOString();
  const dataFim = new Date(new Date(dataInicio).getTime() + 6 * 60 * 60 * 1000).toISOString();

  // 2. Schema principal do Evento
  const schemaEvento = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: evento.titulo,
    description:
      evento.descricao ||
      `Garanta seu ingresso para ${evento.titulo} em ${local}. Venda online oficial e segura no meuingrss!`,
    startDate: dataInicio,
    endDate: dataFim,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: eventStatus,
    location: {
      '@type': 'Place',
      name: local,
      address: {
        '@type': 'PostalAddress',
        addressLocality: cidade,
        addressRegion: 'TO',
        addressCountry: 'BR',
      },
    },
    image: [imagemUrl],
    offers: offers.length === 1 ? offers[0] : offers,
    organizer: {
      '@type': 'Organization',
      name: evento.atletica?.nome || 'Atlética Organizadora',
      url: baseUrl,
    },
  };

  // 3. Schema de BreadcrumbList
  const schemaBreadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Início',
        item: baseUrl,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Eventos',
        item: `${baseUrl}/eventos`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: cidade,
        item: `${baseUrl}/eventos?cidade=${encodeURIComponent(cidade)}`,
      },
      {
        '@type': 'ListItem',
        position: 4,
        name: evento.titulo,
        item: urlPagina,
      },
    ],
  };

  // 4. Schema de FAQPage para Snippets de Busca e IAs
  const schemaFAQ = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: `Como recebo meu ingresso para ${evento.titulo}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `Seu ingresso para ${evento.titulo} é liberado instantaneamente na sua conta do meuingrss em formato QR Code assim que o pagamento via Pix ou cartão for confirmado.`,
        },
      },
      {
        '@type': 'Question',
        name: `Onde acontece o evento ${evento.titulo}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `O evento será realizado em ${local}${evento.cidade ? `, na cidade de ${evento.cidade}` : ''}.`,
        },
      },
      {
        '@type': 'Question',
        name: `Quais as formas de pagamento disponíveis para comprar o ingresso de ${evento.titulo}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Você pode comprar seu ingresso com segurança via Pix (aprovação instantânea) ou cartão de crédito parcelado.',
        },
      },
      {
        '@type': 'Question',
        name: `É seguro comprar ingressos no meuingrss?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Sim! O meuingrss é a plataforma oficial parceira das atléticas universitárias. Todos os ingressos contam com validação QR Code única e criptografada.',
        },
      },
    ],
  };

  return {
    schemaEvento,
    schemaBreadcrumb,
    schemaFAQ,
  };
}

export default function ComponenteJsonLdEvento(props: SeoJsonLdProps) {
  const { schemaEvento, schemaBreadcrumb, schemaFAQ } = gerarJsonLdEvento(props);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaEvento) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaBreadcrumb) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaFAQ) }}
      />
    </>
  );
}
