'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import MenuLateralDiretor from '@/componentes/layout/MenuLateralDiretor';
import { usarAutenticacao } from '@/contextos/ContextoAutenticacao';
import Carregando from '@/componentes/ui/Carregando';

export default function LayoutDiretor({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { usuario, perfil, carregando, sair } = usarAutenticacao();

  const ehPaginaAutenticacao = pathname.includes('/autenticacao');

  useEffect(() => {
    if (!carregando && !ehPaginaAutenticacao) {
      if (perfil?.status === 'pendente') {
        sair().then(() => {
          router.push('/autenticacao/entrar?pendente=1');
        });
      } else if (
        !usuario ||
        !perfil ||
        perfil.status !== 'ativo' ||
        (perfil.role !== 'diretor' && perfil.role !== 'admin')
      ) {
        router.push('/autenticacao/entrar');
      }
    }
  }, [carregando, usuario, perfil, ehPaginaAutenticacao, router, sair]);



  // Se for qualquer página sob /autenticacao ou não estiver autenticado/ativo, renderiza sem a barra lateral
  if (ehPaginaAutenticacao || !usuario || !perfil || perfil.status !== 'ativo') {
    return <div className="min-h-screen bg-[#080c14]">{children}</div>;
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-[#080c14]">
      <MenuLateralDiretor />
      <main className="flex-1 ml-0 md:ml-64 p-4 sm:p-6 lg:p-8 pt-20 md:pt-8 w-full max-w-full overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
