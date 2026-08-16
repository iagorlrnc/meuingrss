import { Metadata } from 'next';

const dominioPrincipal = (process.env.NEXT_PUBLIC_DOMINIO_PRINCIPAL || 'meuingrss.com.br').replace(/\/+$/, '');
const protocolo = process.env.NEXT_PUBLIC_PROTOCOLO || 'https';
const baseUrl = `${protocolo}://${dominioPrincipal}`;

export const metadata: Metadata = {
  title: 'Atléticas Universitárias de Palmas/TO | meuingrss',
  description:
    'Conheça as atléticas acadêmicas parceiras do meuingrss em Palmas e no Tocantins. Encontre eventos, calouradas e festas organizadas pelas atléticas.',
  alternates: {
    canonical: `${baseUrl}/atleticas`,
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: 'Atléticas Universitárias de Palmas/TO | meuingrss',
    description:
      'Diretório oficial de atléticas universitárias parceiras da plataforma meuingrss.',
    url: `${baseUrl}/atleticas`,
    siteName: 'meuingrss',
    locale: 'pt_BR',
    type: 'website',
  },
};

export default function LayoutAtleticas({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
