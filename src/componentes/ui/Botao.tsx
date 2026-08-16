'use client';

import { ButtonHTMLAttributes, forwardRef, memo } from 'react';
import { cn } from '@/lib/utilitarios';

type VarianteBotao = 'primario' | 'festiva' | 'secundario' | 'fantasma' | 'perigo' | 'sucesso' | 'contorno';
type TamanhoBotao = 'sm' | 'md' | 'lg' | 'xl';

interface BotaoProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBotao;
  tamanho?: TamanhoBotao;
  carregando?: boolean;
  icone?: React.ReactNode;
  larguraTotal?: boolean;
}

const estilosVariante: Record<VarianteBotao, string> = {
  primario:
    'bg-[#026cdf] hover:bg-[#0052b4] text-white font-extrabold uppercase tracking-wider shadow-botao hover:shadow-lg active:scale-[0.98]',
  festiva:
    'bg-gradient-to-r from-[#ff007a] via-[#8b5cf6] to-[#026cdf] hover:brightness-110 text-white font-black uppercase tracking-wider shadow-lg hover:shadow-neon active:scale-[0.98]',
  secundario:
    'bg-[#ffbe00] text-[#080c14] font-black uppercase tracking-wider hover:bg-[#e6ab00] active:scale-[0.98]',
  fantasma:
    'bg-transparent text-slate-300 hover:bg-white/10 hover:text-white',
  perigo:
    'bg-erro/10 text-erro border border-erro/20 hover:bg-erro/20 active:scale-[0.98]',
  sucesso:
    'bg-sucesso/10 text-sucesso border border-sucesso/20 hover:bg-sucesso/20 active:scale-[0.98]',
  contorno:
    'bg-transparent border border-[#00e5ff]/60 text-[#00e5ff] hover:bg-[#00e5ff]/10 active:scale-[0.98] font-bold uppercase tracking-wide',
};

const estilosTamanho: Record<TamanhoBotao, string> = {
  sm: 'px-3.5 py-2 text-xs gap-1.5 rounded-lg font-bold min-h-[38px]',
  md: 'px-4 py-2.5 text-sm gap-2 rounded-xl font-bold min-h-[44px]',
  lg: 'px-6 py-3 text-sm font-black gap-2.5 rounded-xl uppercase tracking-wider min-h-[48px]',
  xl: 'px-8 py-3.5 text-base font-black gap-3 rounded-2xl uppercase tracking-wider min-h-[52px]',
};

const Botao = memo(
  forwardRef<HTMLButtonElement, BotaoProps>(
    (
      {
        variante = 'primario',
        tamanho = 'md',
        carregando = false,
        icone,
        larguraTotal = false,
        className,
        children,
        disabled,
        ...props
      },
      ref
    ) => {
      return (
        <button
          ref={ref}
          disabled={disabled || carregando}
          className={cn(
            'inline-flex items-center justify-center font-semibold transition-all duration-200 cursor-pointer touch-manipulation select-none active:scale-[0.98]',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            estilosVariante[variante],
            estilosTamanho[tamanho],
            larguraTotal && 'w-full',
            className
          )}
          {...props}
        >
          {carregando ? (
            <>
              <svg
                className="animar-girar h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              <span>Carregando...</span>
            </>
          ) : (
            <>
              {icone && <span className="flex-shrink-0">{icone}</span>}
              {children}
            </>
          )}
        </button>
      );
    }
  )
);

Botao.displayName = 'Botao';

export default Botao;
