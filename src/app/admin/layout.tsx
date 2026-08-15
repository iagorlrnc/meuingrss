'use client';

import { usePathname } from 'next/navigation';
import MenuLateralAdmin from '@/componentes/layout/MenuLateralAdmin';
import { usarAutenticacao } from '@/contextos/ContextoAutenticacao';
import Carregando from '@/componentes/ui/Carregando';

export default function LayoutAdmin({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { usuario, perfil, carregando } = usarAutenticacao();

  if (carregando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-fundo-principal">
        <Carregando tamanho="lg" texto="Carregando portal administrativo..." />
      </div>
    );
  }

  const ehPaginaLogin = pathname.includes('/autenticacao/entrar');
  const estaAutenticado = Boolean(usuario && perfil && perfil.role === 'admin');

  
  if (ehPaginaLogin || !estaAutenticado) {
    return <div className="min-h-screen bg-fundo-principal">{children}</div>;
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-fundo-principal">
      <MenuLateralAdmin />
      <main className="flex-1 ml-0 md:ml-64 p-4 sm:p-6 lg:p-8 pt-20 md:pt-8 w-full max-w-full overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
