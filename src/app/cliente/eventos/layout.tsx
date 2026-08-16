import { Metadata } from 'next';

const dominioPrincipal = (process.env.NEXT_PUBLIC_DOMINIO_PRINCIPAL || 'meuingrss.com.br').replace(/\/+$/, '');
const protocolo = process.env.NEXT_PUBLIC_PROTOCOLO || 'https';
const baseUrl = `${protocolo}://${dominioPrincipal}`;

export const metadata: Metadata = {
  title: 'Festas Universitárias e Ingressos em Palmas/TO | meuingrss',
  description:
    'Confira todos os eventos, calouradas, cervejadas e festas de atléticas universitárias em Palmas e no Tocantins. Compre seus ingressos digitais via Pix ou Cartão no meuingrss!',
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
    title: 'Festas Universitárias e Ingressos em Palmas/TO | meuingrss',
    description:
      'Encontre os melhores eventos universitários e garanta seus ingressos digitais com segurança.',
    url: `${baseUrl}/eventos`,
    siteName: 'meuingrss',
    locale: 'pt_BR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Todos os Eventos | meuingrss',
    description: 'Compre ingressos para festas universitárias em Palmas/TO com aprovação instantânea.',
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
    name: 'Eventos e Festas Universitárias em Palmas/TO',
    description: 'Catálogo oficial de festas, calouradas e eventos organizados por atléticas acadêmicas.',
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
