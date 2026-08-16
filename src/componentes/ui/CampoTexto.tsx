'use client';

import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef, useState } from 'react';
import { cn } from '@/lib/utilitarios';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';

interface CampoTextoBaseProps {
  rotulo?: string;
  erro?: string;
  dica?: string;
  icone?: React.ReactNode;
  obrigatorio?: boolean;
}

type CampoInputProps = CampoTextoBaseProps &
  InputHTMLAttributes<HTMLInputElement> & {
    multilinha?: false;
  };

type CampoTextareaProps = CampoTextoBaseProps &
  TextareaHTMLAttributes<HTMLTextAreaElement> & {
    multilinha: true;
  };

type CampoTextoProps = CampoInputProps | CampoTextareaProps;

const CampoTexto = forwardRef<HTMLInputElement | HTMLTextAreaElement, CampoTextoProps>(
  ({ rotulo, erro, dica, icone, obrigatorio, className, ...props }, ref) => {
    const { multilinha, ...outrasProps } = props as (CampoInputProps | CampoTextareaProps);
    const type = 'type' in props ? props.type : undefined;

    const [mostrarSenha, setMostrarSenha] = useState(false);
    const eSenha = type === 'password';
    const tipoEfetivo = eSenha ? (mostrarSenha ? 'text' : 'password') : type;

    const estiloInputBase = cn(
      'w-full bg-[#111a2e]/90 border border-white/10 rounded-xl px-4 py-3 text-base sm:text-sm min-h-[44px]',
      'text-white placeholder:text-slate-500 font-normal',
      'transition-all duration-300 ease-out',
      'hover:border-white/20 hover:bg-[#16223d]',
      'focus:outline-none focus:border-[#ff007a] focus:ring-2 focus:ring-[#ff007a]/25 focus:bg-[#16223d]',
      'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[#090e1a]',
      Boolean(erro) && 'border-red-500/60 focus:border-red-500 focus:ring-red-500/20 bg-red-500/5',
      Boolean(icone) && 'pl-11',
      eSenha && 'pr-11',
      className
    );

    return (
      <div className="space-y-1.5 w-full">
        {rotulo && (
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
              {rotulo} {obrigatorio && <span className="text-[#ff007a] ml-0.5">*</span>}
            </label>
          </div>
        )}

        <div className="relative group">
          {icone && (
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#ff007a] transition-colors pointer-events-none">
              {icone}
            </span>
          )}

          {multilinha ? (
            <textarea
              ref={ref as React.Ref<HTMLTextAreaElement>}
              className={cn(estiloInputBase, 'min-h-[120px] resize-y')}
              {...(outrasProps as TextareaHTMLAttributes<HTMLTextAreaElement>)}
            />
          ) : (
            <input
              ref={ref as React.Ref<HTMLInputElement>}
              className={estiloInputBase}
              {...(outrasProps as InputHTMLAttributes<HTMLInputElement>)}
              type={tipoEfetivo}
            />
          )}

          {eSenha && !multilinha && (
            <button
              type="button"
              onClick={() => setMostrarSenha(!mostrarSenha)}
              tabIndex={-1}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors focus:outline-none p-1 rounded-md"
              title={mostrarSenha ? 'Ocultar senha' : 'Exibir senha'}
            >
              {mostrarSenha ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          )}
        </div>

        {erro && (
          <p className="text-xs text-red-400 font-semibold flex items-center gap-1.5 mt-1 animar-entrar-baixo">
            <AlertCircle size={14} className="shrink-0 text-red-400" />
            <span>{erro}</span>
          </p>
        )}

        {dica && !erro && (
          <p className="text-xs text-slate-400 font-normal leading-relaxed mt-1">{dica}</p>
        )}
      </div>
    );
  }
);

CampoTexto.displayName = 'CampoTexto';

export default CampoTexto;

