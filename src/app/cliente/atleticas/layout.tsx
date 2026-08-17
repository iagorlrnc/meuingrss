import { Metadata } from 'next';

const dominioPrincipal = (process.env.NEXT_PUBLIC_DOMINIO_PRINCIPAL || 'meuingrss.com.br').replace(/\/+$/, '');
const protocolo = process.env.NEXT_PUBLIC_PROTOCOLO || 'https';
const baseUrl = `${protocolo}://${dominioPrincipal}`;

export const metadata: Metadata = {
  title: 'Atléticas | Meuingrss',
  description:
    'Conheça as atléticas acadêmicas parceiras do Meuingrss. Encontre eventos, calouradas e festas organizadas pelas atléticas.',
  alternates: {
    canonical: `${baseUrl}/atleticas`,
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: 'Atléticas | Meuingrss',
    description:
      'Painel oficial de atléticas universitárias parceiras da plataforma meuingrss.',
    url: `${baseUrl}/atleticas`,
    siteName: 'Meuingrss',
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
