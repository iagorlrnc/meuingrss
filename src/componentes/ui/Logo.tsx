'use client';

import Link from 'next/link';
import { Ticket } from 'lucide-react';
import { cn } from '@/lib/utilitarios';

interface LogoProps {
  href?: string;
  subtitulo?: string;
  tamanhoIcone?: 'sm' | 'md' | 'lg';
  tamanhoTexto?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  aoClicar?: () => void;
}

export default function Logo({
  href,
  subtitulo,
  tamanhoIcone = 'md',
  tamanhoTexto = 'lg',
  className,
  aoClicar,
}: LogoProps) {
  const estilosCaixaIcone = {
    sm: 'w-8 h-8 rounded-md',
    md: 'w-8 h-8 sm:w-10 sm:h-10 rounded-md',
    lg: 'w-12 h-12 rounded-2xl',
  }[tamanhoIcone];

  const estilosIconeTicket = {
    sm: 'w-4 h-4 text-white transform -rotate-12',
    md: 'w-5 h-5 sm:w-6 sm:h-6 text-white transform -rotate-12',
    lg: 'w-6 h-6 sm:w-7 sm:h-7 text-white transform -rotate-12',
  }[tamanhoIcone];

  const estilosTextoMarca = {
    sm: 'text-base font-black italic tracking-tighter font-titulo leading-none',
    md: 'text-lg sm:text-xl font-black italic tracking-tighter font-titulo leading-none',
    lg: 'text-xl sm:text-2xl font-black italic tracking-tighter font-titulo leading-none',
    xl: 'text-2xl sm:text-3xl font-black italic tracking-tighter font-titulo leading-none',
  }[tamanhoTexto];

  const conteudo = (
    <div className={cn('flex items-center gap-2.5 group shrink-0', className)}>
      <div
        className={cn(
          'bg-gradient-to-br from-[#ff007a] via-[#8b5cf6] to-[#026cdf] flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform shrink-0',
          estilosCaixaIcone
        )}
      >
        <Ticket className={estilosIconeTicket} />
      </div>
      <div className="flex flex-col">
        <span className={cn('text-white flex items-center gap-0.5', estilosTextoMarca)}>
          Meu
          <span className={cn('text-[#00e5ff]', estilosTextoMarca)}>
            ingrss
          </span>
        </span>
        {subtitulo && (
          <span className="block text-[10px] text-slate-400 font-sans not-italic font-normal tracking-normal mt-0.5">
            {subtitulo}
          </span>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} onClick={aoClicar} className="shrink-0">
        {conteudo}
      </Link>
    );
  }

  return conteudo;
}
