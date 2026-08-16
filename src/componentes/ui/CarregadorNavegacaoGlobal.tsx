'use client';

import { useState, useEffect, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Carregando from './Carregando';

function ConteudoCarregadorNavegacao() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [carregando, setCarregando] = useState(false);

  // Desativa o carregamento quando a rota efetivamente mudar
  useEffect(() => {
    setCarregando(false);
  }, [pathname, searchParams]);

  useEffect(() => {
    function aoClicarLink(evento: MouseEvent) {
      const alvo = evento.target as HTMLElement | null;
      const elementoLink = alvo?.closest('a') as HTMLAnchorElement | null;

      if (!elementoLink) return;

      const href = elementoLink.getAttribute('href');
      const target = elementoLink.getAttribute('target');

      // Se for link interno válido e não abrir em nova aba
      if (
        href &&
        !href.startsWith('http') &&
        !href.startsWith('mailto:') &&
        !href.startsWith('tel:') &&
        !href.startsWith('#') &&
        href !== 'javascript:void(0)' &&
        target !== '_blank'
      ) {
        const urlAtual = window.location.pathname + window.location.search;
        // Se estiver direcionando para uma URL diferente da atual
        if (href !== urlAtual) {
          setCarregando(true);
        }
      }
    }

    document.addEventListener('click', aoClicarLink, { capture: true });

    return () => {
      document.removeEventListener('click', aoClicarLink, { capture: true });
    };
  }, []);

  // Timeout de segurança para desativar se a resposta demorar mais de 6s
  useEffect(() => {
    if (!carregando) return;

    const timer = setTimeout(() => {
      setCarregando(false);
    }, 6000);

    return () => clearTimeout(timer);
  }, [carregando]);

  if (!carregando) return null;

  return <Carregando telaCheia tamanho="lg" texto="Carregando..." />;
}

export default function CarregadorNavegacaoGlobal() {
  return (
    <Suspense fallback={null}>
      <ConteudoCarregadorNavegacao />
    </Suspense>
  );
}
