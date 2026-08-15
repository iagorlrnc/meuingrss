'use client';

import { HTMLAttributes, forwardRef, memo } from 'react';
import { cn } from '@/lib/utilitarios';

type VarianteCartao = 'padrao' | 'vidro' | 'elevado' | 'contorno' | 'gradiente';

interface CartaoProps extends HTMLAttributes<HTMLDivElement> {
  variante?: VarianteCartao;
  interativo?: boolean;
  semPadding?: boolean;
}

const estilosVariante: Record<VarianteCartao, string> = {
  padrao: 'bg-fundo-card border border-borda-sutil',
  vidro: 'vidro',
  elevado: 'bg-fundo-elevado border border-borda-media shadow-card',
  contorno: 'bg-transparent border border-borda-media',
  gradiente: 'gradiente-card border border-borda-sutil',
};

const Cartao = memo(
  forwardRef<HTMLDivElement, CartaoProps>(
    (
      {
        variante = 'padrao',
        interativo = false,
        semPadding = false,
        className,
        children,
        ...props
      },
      ref
    ) => {
      return (
        <div
          ref={ref}
          className={cn(
            'rounded-lg transition-all duration-300 overflow-hidden',
            estilosVariante[variante],
            !semPadding && 'p-6',
            interativo && 'cursor-pointer hover:border-[#026cdf]/60 hover:shadow-card hover:-translate-y-1',
            className
          )}
          {...props}
        >
          {children}
        </div>
      );
    }
  )
);

Cartao.displayName = 'Cartao';

export default Cartao;
