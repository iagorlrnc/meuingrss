'use client';

import { cn } from '@/lib/utilitarios';

interface CarregandoProps {
  tamanho?: 'sm' | 'md' | 'lg';
  texto?: string;
  className?: string;
  telaCheia?: boolean;
}

export default function Carregando({
  tamanho = 'md',
  texto,
  className,
  telaCheia = false,
}: CarregandoProps) {
  const tamanhos = {
    sm: 'w-5 h-5',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  const conteudo = (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      <div className="relative">
        <div
          className={cn(
            'rounded-full border-2 border-primaria-500/20',
            tamanhos[tamanho]
          )}
        />
        <div
          className={cn(
            'absolute top-0 left-0 rounded-full border-2 border-transparent border-t-primaria-500 animar-girar',
            tamanhos[tamanho]
          )}
        />
      </div>
      {texto && (
        <p className="text-sm text-texto-secundario animate-pulse">{texto}</p>
      )}
    </div>
  );

  if (telaCheia) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-fundo-principal/80 backdrop-blur-sm">
        {conteudo}
      </div>
    );
  }

  return conteudo;
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('skeleton rounded-2xl', className)}>
      <div className="h-48 bg-fundo-elevado rounded-t-2xl" />
      <div className="p-5 space-y-3">
        <div className="h-4 bg-fundo-elevado rounded-lg w-3/4" />
        <div className="h-3 bg-fundo-elevado rounded-lg w-1/2" />
        <div className="h-3 bg-fundo-elevado rounded-lg w-2/3" />
      </div>
    </div>
  );
}

export function SkeletonTabela({ linhas = 5 }: { linhas?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className="skeleton h-12 rounded-xl" />
      ))}
    </div>
  );
}
