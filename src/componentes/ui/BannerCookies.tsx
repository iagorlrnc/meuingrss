'use client';

import { useState, useEffect } from 'react';
import { usarCookies } from '@/contextos/ContextoCookies';
import Botao from '@/componentes/ui/Botao';
import { Cookie, Shield, Check, X, ChevronDown, ChevronUp, Info } from 'lucide-react';
import Link from 'next/link';

export default function BannerCookies() {
  const {
    bannerAberto,
    preferencias,
    fecharBanner,
    salvarPreferencias,
    aceitarTodos,
  } = usarCookies();

  const [montado, setMontado] = useState(false);
  const [mostrarDetalhes, setMostrarDetalhes] = useState(false);
  const [analiticos, setAnaliticos] = useState(preferencias.analiticos);
  const [marketing, setMarketing] = useState(preferencias.marketing);

  useEffect(() => {
    setMontado(true);
  }, []);

  useEffect(() => {
    setAnaliticos(preferencias.analiticos);
    setMarketing(preferencias.marketing);
  }, [preferencias]);

  function aoAceitarTodos() {
    setAnaliticos(true);
    setMarketing(true);
    aceitarTodos();
  }

  if (!montado || !bannerAberto) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-2.5 sm:p-5 pt-0 pointer-events-none">
      <div className="max-w-4xl mx-auto bg-[#0b101d]/98 border border-white/20 backdrop-blur-2xl rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-6 text-white pointer-events-auto animar-entrar-baixo border-t-2 border-t-[#ff007a] max-h-[85vh] overflow-y-auto sem-barra-rolagem pb-safe">
        
        {/* Main Banner Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3.5 sm:gap-4">
          
          {/* Header & Text */}
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#ff007a] via-[#8b5cf6] to-[#026cdf] flex items-center justify-center shrink-0 shadow-lg mt-0.5">
              <Cookie className="w-5 h-5 text-white" />
            </div>

            <div className="space-y-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm sm:text-base font-black font-titulo text-white">
                  Preferências de Privacidade & Cookies
                </h3>

                <button
                  type="button"
                  onClick={fecharBanner}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors md:hidden shrink-0 touch-manipulation"
                  aria-label="Fechar"
                >
                  <X size={18} />
                </button>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed pr-2 md:pr-0 pb-2.5 sm:pb-3">
                Utilizamos cookies para personalizar sua experiência, garantir compras seguras e manter seus ingressos integrados.{' '}
                <Link href="/termos-e-privacidade" className="text-[#00e5ff] font-bold underline hover:text-white transition-colors inline-block">
                  Política de Privacidade.
                </Link>
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 shrink-0 justify-end pt-2 md:pt-0 pb-2.5 md:pb-0 border-t md:border-t-0 border-white/10">
            <button
              type="button"
              onClick={() => setMostrarDetalhes(!mostrarDetalhes)}
              className="px-3.5 py-2 rounded-xl border border-white/15 text-xs font-bold text-slate-300 hover:text-white hover:bg-white/10 transition-all flex items-center gap-1.5 min-h-[44px] touch-manipulation flex-1 sm:flex-none justify-center"
            >
              <span>Personalizar</span>
              {mostrarDetalhes ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            <Botao
              variante="festiva"
              tamanho="sm"
              onClick={aoAceitarTodos}
              className="text-xs font-black uppercase min-h-[44px] px-5 flex-1 sm:flex-none justify-center"
            >
              Aceitar Todos
            </Botao>
          </div>
        </div>

        {/* Detailed Options Drawer */}
        {mostrarDetalhes && (
          <div className="mt-4 pt-4 border-t border-white/10 space-y-4 animar-entrar-baixo pb-3 sm:pb-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Info size={14} className="text-[#00e5ff]" />
                Categorias de Consentimento
              </h4>
              <span className="text-[11px] text-slate-400">Configure suas opções</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Essenciais */}
              <div className="p-3.5 bg-[#162036] rounded-xl border border-white/10 flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Shield size={14} className="text-emerald-400 shrink-0" />
                    Essenciais
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1 leading-tight">Sessão, conta e ingressos</p>
                </div>
                <span className="text-[10px] font-black uppercase text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20 shrink-0">
                  Obrigatório
                </span>
              </div>

              {/* Analíticos */}
              <label className="p-3.5 bg-[#162036] rounded-xl border border-white/10 flex items-center justify-between gap-2 cursor-pointer hover:border-white/20 transition-colors touch-manipulation">
                <div>
                  <p className="text-xs font-bold text-white">Analíticos</p>
                  <p className="text-[10px] text-slate-400 mt-1 leading-tight">Desempenho e métricas de acesso</p>
                </div>
                <input
                  type="checkbox"
                  checked={analiticos}
                  onChange={(e) => setAnaliticos(e.target.checked)}
                  className="w-5 h-5 accent-[#ff007a] rounded cursor-pointer shrink-0"
                />
              </label>

              {/* Marketing */}
              <label className="p-3.5 bg-[#162036] rounded-xl border border-white/10 flex items-center justify-between gap-2 cursor-pointer hover:border-white/20 transition-colors touch-manipulation">
                <div>
                  <p className="text-xs font-bold text-white">Marketing</p>
                  <p className="text-[10px] text-slate-400 mt-1 leading-tight">Recomendações de festas e ofertas</p>
                </div>
                <input
                  type="checkbox"
                  checked={marketing}
                  onChange={(e) => setMarketing(e.target.checked)}
                  className="w-5 h-5 accent-[#ff007a] rounded cursor-pointer shrink-0"
                />
              </label>
            </div>

            {/* Bottom Actions of Drawer */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 pb-2 border-t border-white/10 mt-2">
              <p className="text-[11px] text-slate-400 text-center sm:text-left">
                Suas preferências podem ser alteradas a qualquer momento no rodapé do site.
              </p>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <Botao
                  variante="secundario"
                  tamanho="md"
                  onClick={() =>
                    salvarPreferencias({
                      essenciais: true,
                      analiticos,
                      marketing,
                    })
                  }
                  icone={<Check size={16} />}
                  className="text-xs font-black uppercase w-full sm:w-auto min-h-[44px] px-6 shadow-xl"
                >
                  Salvar Preferências
                </Botao>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
