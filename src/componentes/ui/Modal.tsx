'use client';

import { useEffect, useRef, Fragment } from 'react';
import { cn } from '@/lib/utilitarios';
import { X } from 'lucide-react';

interface ModalProps {
  aberto: boolean;
  aoFechar: () => void;
  titulo?: string;
  descricao?: string;
  children: React.ReactNode;
  tamanho?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const tamanhos = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export default function Modal({
  aberto,
  aoFechar,
  titulo,
  descricao,
  children,
  tamanho = 'md',
  className,
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (aberto) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [aberto]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar();
    };

    if (aberto) {
      document.addEventListener('keydown', handleEsc);
    }

    return () => document.removeEventListener('keydown', handleEsc);
  }, [aberto, aoFechar]);

  if (!aberto) return null;

  return (
    <Fragment>
      {}
      <div
        ref={overlayRef}
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 pt-safe pb-safe overflow-y-auto"
        onClick={(e) => {
          if (e.target === overlayRef.current) aoFechar();
        }}
      >
        {/* Overlay backdrop */}
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animar-entrar-escala" />

        {/* Modal Dialog */}
        <div
          className={cn(
            'relative w-full vidro-forte rounded-2xl shadow-glass animar-entrar-baixo max-h-[88vh] flex flex-col my-auto overflow-hidden border border-white/15',
            tamanhos[tamanho],
            className
          )}
        >
          {/* Header */}
          {(titulo || descricao) && (
            <div className="flex items-start justify-between p-4 sm:p-6 pb-0 shrink-0">
              <div>
                {titulo && (
                  <h2 className="text-lg sm:text-xl font-bold font-titulo text-texto-principal">
                    {titulo}
                  </h2>
                )}
                {descricao && (
                  <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-texto-secundario">{descricao}</p>
                )}
              </div>
              <button
                onClick={aoFechar}
                className="p-2 rounded-lg text-texto-terciario hover:text-texto-principal hover:bg-fundo-hover transition-colors touch-manipulation min-h-[40px] min-w-[40px] flex items-center justify-center"
                aria-label="Fechar"
              >
                <X size={20} />
              </button>
            </div>
          )}

          {/* Body */}
          <div className="p-4 sm:p-6 overflow-y-auto flex-1">{children}</div>
        </div>
      </div>
    </Fragment>
  );
}
