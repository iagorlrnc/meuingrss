import { Metadata } from 'next';

const dominioPrincipal = (process.env.NEXT_PUBLIC_DOMINIO_PRINCIPAL || 'meuingrss.com.br').replace(/\/+$/, '');
const protocolo = process.env.NEXT_PUBLIC_PROTOCOLO || 'https';
const baseUrl = `${protocolo}://${dominioPrincipal}`;

export const metadata: Metadata = {
  title: 'Eventos | Meuingrss',
  description:
    'Confira todos os eventos, calouradas e festas de atléticas universitárias em Palmas e no Tocantins. Compre seus ingressos digitais via Pix ou Cartão no Meuingrss!',
  alternates: {
    canonical: `${baseUrl}/eventos`,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
    },
  },
  openGraph: {
    title: 'Eventos | Meuingrss',
    description:
      'Encontre os melhores eventos universitários e garanta seus ingressos digitais com segurança.',
    url: `${baseUrl}/eventos`,
    siteName: 'Meuingrss',
    locale: 'pt_BR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Todos os Eventos | Meuingrss',
    description: 'Adquira ingressos para eventos universitários com aprovação instantânea.',
  },
};

export default function LayoutEventos({
  children,
}: {
  children: React.ReactNode;
}) {
  const jsonLdEventos = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Eventos Universitários',
    description: 'Catálogo oficial de eventos, calouradas e festas organizadas por atléticas.',
    url: `${baseUrl}/eventos`,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdEventos) }}
      />
      {children}
    </>
  );
}
