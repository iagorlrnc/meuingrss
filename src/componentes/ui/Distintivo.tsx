'use client';

import { cn } from '@/lib/utilitarios';
import { obterInfoStatus } from '@/lib/utilitarios';

interface DistintivoProps {
  status?: string;
  texto?: string;
  cor?: string;
  tamanho?: 'sm' | 'md';
  className?: string;
}

export default function Distintivo({
  status,
  texto,
  cor,
  tamanho = 'sm',
  className,
}: DistintivoProps) {
  const info = status ? obterInfoStatus(status) : null;
  const corFinal = cor || info?.cor || 'text-texto-secundario bg-fundo-elevado';
  const textoFinal = texto || info?.label || status || '';

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium border rounded-full',
        tamanho === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm',
        corFinal,
        className
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5 opacity-70" />
      {textoFinal}
    </span>
  );
}
