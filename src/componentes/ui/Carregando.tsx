'use client';

import { cn } from '@/lib/utilitarios';
import { Ticket } from 'lucide-react';

interface CarregandoProps {
  tamanho?: 'sm' | 'md' | 'lg' | 'xl';
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
  const tamanhosIcone = {
    sm: 20,
    md: 32,
    lg: 48,
    xl: 64,
  };

  const tamanhosContainer = {
    sm: 'w-10 h-10 p-2',
    md: 'w-14 h-14 p-3',
    lg: 'w-20 h-20 p-4',
    xl: 'w-28 h-28 p-6',
  };

  const conteudo = (
    <div className={cn('flex flex-col items-center justify-center gap-3.5 select-none', className)}>
      <div className="relative flex items-center justify-center">
        {/* Glow neon pulsante ao fundo */}
        <div className="absolute -inset-2 rounded-3xl bg-gradient-to-r from-[#ff007a]/40 via-[#8b5cf6]/40 to-[#00e5ff]/40 blur-xl animate-pulse pointer-events-none" />
        
        {/* Container do ícone */}
        <div
          className={cn(
            'relative rounded-2xl bg-[#0b101c]/90 border border-white/20 shadow-2xl backdrop-blur-xl flex items-center justify-center',
            tamanhosContainer[tamanho]
          )}
        >
          {/* Ícone de Ticket Girando com brilho neon */}
          <div className="animate-spin flex items-center justify-center transform-gpu">
            <Ticket
              size={tamanhosIcone[tamanho]}
              className="text-[#00e5ff] drop-shadow-[0_0_12px_rgba(0,229,255,0.9)] transform -rotate-12"
            />
          </div>
        </div>
      </div>

      {texto && (
        <p className="text-xs sm:text-sm font-bold tracking-wide text-slate-200 animate-pulse text-center">
          {texto}
        </p>
      )}
    </div>
  );

  if (telaCheia) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#080c14]/85 backdrop-blur-md transition-all duration-300">
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
