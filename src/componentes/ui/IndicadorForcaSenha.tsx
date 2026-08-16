'use client';

import { useState } from 'react';
import { Check, X, Info } from 'lucide-react';
import { avaliarSenha } from '@/lib/utilitarios';

interface IndicadorForcaSenhaProps {
  senha: string;
}

export default function IndicadorForcaSenha({ senha }: IndicadorForcaSenhaProps) {
  const [mostrarInfo, setMostrarInfo] = useState(false);

  const status = avaliarSenha(senha || '');

  const requisitos = [
    { label: 'No mínimo 8 caracteres', atendido: status.temMinimo8 },
    { label: 'Pelo menos 1 letra maiúscula (A-Z)', atendido: status.temMaiuscula },
    { label: 'Pelo menos 1 número (0-9)', atendido: status.temNumero },
    { label: 'Pelo menos 1 caractere especial (!@#$...)', atendido: status.temEspecial },
  ];

  return (
    <div className="p-3 rounded-xl bg-[#080c14]/80 border border-white/10 text-xs animar-entrar-baixo">
      {/* Barra de Status e Rótulo de Força */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs font-semibold">
          <div className="flex items-center gap-1.5 text-slate-400">
            <span className="uppercase tracking-wider text-[10px]">Força da senha</span>

            {/* Container Relativo do Ícone Info e Tooltip Flutuante */}
            <div
              className="relative inline-flex items-center"
              onMouseEnter={() => setMostrarInfo(true)}
              onMouseLeave={() => setMostrarInfo(false)}
            >
              <button
                type="button"
                onClick={() => setMostrarInfo((prev) => !prev)}
                className="text-slate-400 hover:text-[#00e5ff] transition-colors p-0.5 rounded-full hover:bg-white/10 focus:outline-none cursor-pointer"
                aria-label="Ver requisitos da senha"
              >
                <Info size={14} />
              </button>

              {/* Tooltip Card Flutuante (Visível ao passar o mouse ou clicar) */}
              {mostrarInfo && (
                <div className="absolute left-0 sm:-left-2 bottom-full mb-2.5 w-64 max-w-[calc(100vw-3rem)] p-3.5 rounded-2xl bg-[#0f172a]/95 border border-slate-700/80 shadow-[0_10px_30px_rgba(0,0,0,0.8)] backdrop-blur-xl z-50 animar-entrar-baixo text-xs">
                  {/* Setinha apontando para baixo */}
                  <div className="absolute -bottom-1.5 left-2.5 w-3 h-3 bg-[#0f172a] border-r border-b border-slate-700/80 rotate-45" />

                  <p className="text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-2 border-b border-white/10 pb-1.5">
                    Pré-requisitos da senha
                  </p>
                  <div className="space-y-2">
                    {requisitos.map((req, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        {req.atendido ? (
                          <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
                            <Check size={10} className="stroke-[3]" />
                          </span>
                        ) : (
                          <span className="w-4 h-4 rounded-full bg-slate-800 text-slate-500 border border-slate-700 flex items-center justify-center shrink-0">
                            <X size={10} className="stroke-[3]" />
                          </span>
                        )}
                        <span className={req.atendido ? 'text-emerald-300 font-medium text-[11px]' : 'text-slate-400 text-[11px]'}>
                          {req.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <span
            className={`font-bold text-[11px] ${
              status.forca === 1
                ? 'text-red-400'
                : status.forca === 2
                ? 'text-amber-400'
                : status.forca === 3
                ? 'text-emerald-400'
                : 'text-slate-500'
            }`}
          >
            {status.rotuloForca}
          </span>
        </div>

        {/* Apenas a Barra de Status */}
        <div className="flex items-center gap-1.5 h-2 w-full bg-slate-900 rounded-full overflow-hidden p-0.5 border border-white/5">
          <div
            className={`h-full flex-1 rounded-full transition-all duration-300 ${
              status.forca >= 1
                ? status.forca === 1
                  ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                  : status.forca === 2
                  ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]'
                  : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]'
                : 'bg-slate-800'
            }`}
          />
          <div
            className={`h-full flex-1 rounded-full transition-all duration-300 ${
              status.forca >= 2
                ? status.forca === 2
                  ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]'
                  : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]'
                : 'bg-slate-800'
            }`}
          />
          <div
            className={`h-full flex-1 rounded-full transition-all duration-300 ${
              status.forca >= 3
                ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]'
                : 'bg-slate-800'
            }`}
          />
        </div>
      </div>
    </div>
  );
}
