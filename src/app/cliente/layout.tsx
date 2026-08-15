'use client';

import { usePathname } from 'next/navigation';
import CabecalhoCliente from '@/componentes/layout/CabecalhoCliente';
import Rodape from '@/componentes/layout/Rodape';

export default function LayoutCliente({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const ehPaginaAutenticacao = pathname?.includes('/autenticacao');

  if (ehPaginaAutenticacao) {
    return <main className="min-h-screen bg-[#080c14]">{children}</main>;
  }

  return (
    <>
      <CabecalhoCliente />
      <main className="min-h-screen pt-16 md:pt-[120px]">
        {children}
      </main>
      <Rodape />
    </>
  );
}

