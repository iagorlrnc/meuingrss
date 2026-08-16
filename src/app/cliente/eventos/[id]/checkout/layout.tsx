import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Checkout — Pagamento de Ingresso | meuingrss',
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default function LayoutCheckout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
