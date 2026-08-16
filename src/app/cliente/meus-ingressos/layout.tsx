import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Meus Ingressos | meuingrss',
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default function LayoutMeusIngressos({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
