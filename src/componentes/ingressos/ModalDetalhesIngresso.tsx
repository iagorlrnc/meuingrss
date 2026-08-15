'use client';

import { useState, useEffect, useRef } from 'react';
import { 
  Ticket, 
  Calendar, 
  MapPin, 
  QrCode, 
  Download, 
  Info, 
  User, 
  Building2, 
  Loader2, 
  ShieldCheck, 
  X, 
  Clock,
  Sparkles,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import Distintivo from '@/componentes/ui/Distintivo';
import { formatarData, formatarDataHora, formatarMoeda } from '@/lib/utilitarios';
import type { Ingresso, Evento, LoteIngresso, Perfil, Atletica } from '@/tipos';

interface IngressoCompleto extends Ingresso {
  evento: Evento & {
    atletica?: Atletica;
  };
  lote: LoteIngresso;
  comprador?: Perfil;
}

interface ModalDetalhesIngressoProps {
  aberto: boolean;
  aoFechar: () => void;
  ingresso: IngressoCompleto | null;
  qrCodeUrl: string;
  nomeUsuario?: string;
  emailUsuario?: string;
  onBaixarPdf: (ingresso: IngressoCompleto) => Promise<void>;
  estaGerandoPdf?: boolean;
}

export default function ModalDetalhesIngresso({
  aberto,
  aoFechar,
  ingresso,
  qrCodeUrl,
  nomeUsuario,
  emailUsuario,
  onBaixarPdf,
  estaGerandoPdf = false,
}: ModalDetalhesIngressoProps) {
  const [mostrarRegras, setMostrarRegras] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  // Trava rolar da página quando o modal estiver aberto
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

  // Tecla ESC para fechar
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar();
    };

    if (aberto) {
      document.addEventListener('keydown', handleEsc);
    }

    return () => document.removeEventListener('keydown', handleEsc);
  }, [aberto, aoFechar]);

  if (!aberto || !ingresso) return null;

  const nomeComprador = ingresso.comprador?.nome || nomeUsuario || 'Comprador';
  const emailComprador = ingresso.comprador?.email || emailUsuario || '—';
  const atletica = ingresso.evento?.atletica;

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 pt-safe pb-safe overflow-y-auto"
      onClick={(e) => {
        if (e.target === modalRef.current) aoFechar();
      }}
    >
      {/* Overlay Backdrop com Blur */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md animar-entrar-escala" />

      {/* Container Principal do Modal de Ingresso */}
      <div className="relative w-full max-w-lg bg-[#0d1117] text-slate-100 rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] border border-slate-700/60 overflow-hidden flex flex-col my-auto max-h-[92vh] animar-entrar-baixo">

        {/* Header Visual estilo Passe de Evento (Ticket Header) */}
        <div className="relative shrink-0 overflow-hidden bg-slate-900 min-h-[160px] sm:min-h-[190px]">
          {ingresso.evento?.imagem_url ? (
            <div className="absolute inset-0">
              <img
                src={ingresso.evento.imagem_url}
                alt={ingresso.evento.titulo}
                className="w-full h-full object-cover filter brightness-[0.75]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0d1117] via-[#0d1117]/60 to-black/30" />
            </div>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-primaria-900/80 via-slate-900 to-secundaria-900/70" />
          )}

          {/* Top Bar de Controles e Atlética */}
          <div className="relative z-10 p-4 sm:p-5 flex items-center justify-between gap-3">
            {/* Logo e Nome da Atlética / Badge */}
            {atletica ? (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-950/70 backdrop-blur-md border border-white/15 text-xs font-semibold text-white shadow-lg">
                {atletica.logo_url ? (
                  <img
                    src={atletica.logo_url}
                    alt={atletica.nome}
                    className="w-5 h-5 rounded-full object-cover"
                  />
                ) : (
                  <Building2 size={14} className="text-secundaria-400" />
                )}
                <span className="truncate max-w-[160px] sm:max-w-[200px]">
                  {atletica.nome}
                </span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-950/70 backdrop-blur-md border border-white/15 text-[11px] font-bold text-primaria-400 uppercase tracking-wider">
                <Sparkles size={13} />
                Ingresso Oficial
              </div>
            )}

            {/* Status + Botão Fechar */}
            <div className="flex items-center gap-2">
              <Distintivo status={ingresso.status} tamanho="sm" />

              <button
                onClick={aoFechar}
                className="p-2 rounded-full bg-slate-950/70 hover:bg-slate-800 text-slate-300 hover:text-white backdrop-blur-md border border-white/15 transition-all touch-manipulation min-w-[36px] min-h-[36px] flex items-center justify-center shadow-lg"
                aria-label="Fechar modal"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Título e Info Básica no Header */}
          <div className="relative z-10 px-5 pb-4 pt-2">
            <h2 className="text-xl sm:text-2xl font-black font-titulo text-white tracking-tight leading-snug drop-shadow-md mb-2">
              {ingresso.evento?.titulo}
            </h2>

            <div className="flex flex-wrap items-center gap-y-1.5 gap-x-4 text-xs text-slate-300/90 font-medium">
              <div className="flex items-center gap-1.5 bg-black/40 px-2.5 py-1 rounded-lg backdrop-blur-sm border border-white/10">
                <Calendar size={13} className="text-primaria-400 shrink-0" />
                <span>{formatarData(ingresso.evento?.data_evento)}</span>
              </div>

              {ingresso.evento?.local && (
                <div className="flex items-center gap-1.5 bg-black/40 px-2.5 py-1 rounded-lg backdrop-blur-sm border border-white/10">
                  <MapPin size={13} className="text-secundaria-400 shrink-0" />
                  <span className="truncate max-w-[180px] sm:max-w-[220px]">
                    {ingresso.evento.local}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Divisor Visual de Picote de Ingresso (Ticket Stub Tear Line) */}
        <div className="relative h-6 bg-[#0d1117] flex items-center justify-center overflow-hidden shrink-0">
          {/* Recorte Circular Esquerdo */}
          <div className="absolute -left-3 w-6 h-6 rounded-full bg-[#000000] border border-slate-700/60 z-10" />
          
          {/* Linha Tracejada de Picote */}
          <div className="w-full mx-6 border-b-2 border-dashed border-slate-700/70" />
          
          {/* Recorte Circular Direito */}
          <div className="absolute -right-3 w-6 h-6 rounded-full bg-[#000000] border border-slate-700/60 z-10" />
        </div>

        {/* Corpo Scrollável do Modal */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 scrollbar-thin scrollbar-thumb-slate-700">

          {/* Cartão de Validação e QR Code Principal */}
          <div className="relative rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 p-5 border border-slate-800 text-center shadow-xl flex flex-col items-center">
            {/* Container do QR Code */}
            <div className="relative p-4 rounded-2xl bg-white shadow-[0_0_35px_rgba(99,102,241,0.2)] border-4 border-slate-800 transition-transform duration-300 hover:scale-[1.02] mb-3">
              {qrCodeUrl ? (
                <img
                  src={qrCodeUrl}
                  alt="QR Code do Ingresso"
                  className="w-48 h-48 sm:w-56 sm:h-56 mx-auto object-contain"
                />
              ) : (
                <div className="w-48 h-48 sm:w-56 sm:h-56 flex flex-col items-center justify-center gap-2 text-slate-600">
                  <Loader2 className="w-8 h-8 animate-spin text-primaria-500" />
                  <span className="text-xs">Gerando QR Code...</span>
                </div>
              )}
            </div>

            {/* Data e Horário da Compra */}
            <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-950/90 border border-slate-800 text-xs text-slate-300 shadow-inner">
              <Clock size={14} className="text-primaria-400 shrink-0" />
              <span>Adquirido em <strong className="text-slate-100 font-semibold">{formatarDataHora(ingresso.data_compra)}</strong></span>
            </div>
          </div>

          {/* Grid de Informações: Titular & Detalhes da Compra */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            
            {/* Bloco Titular */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
              <div className="flex items-center text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800/80 pb-2">
                <span className="flex items-center gap-1.5">
                  <User size={14} className="text-primaria-400" />
                  Titular do Ingresso
                </span>
              </div>
              <div>
                <p className="text-sm font-bold text-slate-100 truncate">
                  {nomeComprador}
                </p>
                <p className="text-xs text-slate-400 truncate">
                  {emailComprador}
                </p>
              </div>
            </div>

            {/* Bloco Lote e Valor */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
              <div className="flex items-center text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800/80 pb-2">
                <span className="flex items-center gap-1.5">
                  <Ticket size={14} className="text-secundaria-400" />
                  Detalhes do Lote
                </span>
              </div>
              <div>
                <p className="text-sm font-bold text-slate-100 truncate">
                  {ingresso.lote?.nome_lote || 'Lote Único'}
                </p>
                <p className="text-xs font-extrabold text-emerald-400 font-mono mt-0.5">
                  {formatarMoeda(ingresso.lote?.preco || 0)}
                </p>
              </div>
            </div>

          </div>

          {/* Descrição e Orientações (Collapsible) */}
          <div className="rounded-xl bg-slate-900/60 border border-slate-800 overflow-hidden">
            <button
              onClick={() => setMostrarRegras(!mostrarRegras)}
              className="w-full p-4 flex items-center justify-between text-xs font-bold text-slate-300 hover:text-white transition-colors"
            >
              <div className="flex items-center gap-2">
                <Info size={15} className="text-primaria-400" />
                <span>Instruções de Entrada & Regras do Evento</span>
              </div>
              {mostrarRegras ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {mostrarRegras && (
              <div className="px-4 pb-4 pt-1 text-xs text-slate-300 space-y-2 border-t border-slate-800/80">
                {ingresso.evento?.descricao ? (
                  <p className="leading-relaxed whitespace-pre-line text-slate-400 mb-3">
                    {ingresso.evento.descricao}
                  </p>
                ) : null}

                <div className="space-y-1.5 text-slate-300">
                  <div className="flex items-start gap-2">
                    <span className="text-primaria-400 font-bold">•</span>
                    <span>Apresente um documento original com foto na portaria.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-primaria-400 font-bold">•</span>
                    <span>O QR Code é único e individual. Evite compartilhar com terceiros.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-primaria-400 font-bold">•</span>
                    <span>Recomendamos salvar o PDF do ingresso no seu dispositivo em caso de falta de sinal de internet no local.</span>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Rodapé Fixo de Ações */}
        <div className="p-4 sm:p-5 bg-slate-950 border-t border-slate-800/80 shrink-0 flex flex-col sm:flex-row gap-3">
          {/* Botão Baixar PDF */}
          <button
            onClick={() => onBaixarPdf(ingresso)}
            disabled={estaGerandoPdf}
            className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-primaria-500 to-primaria-600 hover:from-primaria-600 hover:to-primaria-700 text-white font-bold text-sm shadow-lg shadow-primaria-500/25 transition-all min-h-[46px] touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]"
          >
            {estaGerandoPdf ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Gerando PDF...</span>
              </>
            ) : (
              <>
                <Download size={18} />
                <span>Baixar Ingresso PDF</span>
              </>
            )}
          </button>

          <button
            onClick={aoFechar}
            className="px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-sm font-semibold transition-all min-h-[46px] touch-manipulation sm:w-auto"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
}
