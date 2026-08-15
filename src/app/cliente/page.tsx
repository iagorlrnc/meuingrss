'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Botao from '@/componentes/ui/Botao';
import Cartao from '@/componentes/ui/Cartao';
import { SkeletonCard } from '@/componentes/ui/Carregando';
import { criarClienteNavegador } from '@/lib/supabase/cliente';
import { formatarData, formatarDataHora, formatarMoeda } from '@/lib/utilitarios';
import type { Evento, LoteIngresso } from '@/tipos';
import BarraNavegacaoMobile from '@/componentes/layout/BarraNavegacaoMobile';
import {
  Search,
  MapPin,
  Calendar,
  Ticket,
  Users,
  Sparkles,
  Zap,
  CheckCircle2,
  Clock,
  ChevronRight,
  ChevronLeft,
  Flame,
  Home,
  Trophy,
} from 'lucide-react';

import { obterCidadesCache, obterOuBuscarCidades, salvarVariosEventosCache } from '@/lib/cacheEventos';

import type { Atletica } from '@/tipos';

interface EventoComLote extends Omit<Evento, 'atletica'> {
  lotes_ingresso: LoteIngresso[];
  atletica: Pick<Atletica, 'id' | 'nome' | 'logo_url'> | null;
}

function ConteudoPaginaInicial() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [eventos, setEventos] = useState<EventoComLote[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState(searchParams.get('busca') || '');
  const [cidade, setCidade] = useState(searchParams.get('cidade') || '');
  const [cidades, setCidades] = useState<string[]>(obterCidadesCache() || []);
  const [categoriaAtiva, setCategoriaAtiva] = useState('todos');
  const [indiceDestaque, setIndiceDestaque] = useState(0);
  const [visivelHero, setVisivelHero] = useState(true);
  const supabase = criarClienteNavegador();

  useEffect(() => {
    setBusca(searchParams.get('busca') || '');
    setCidade(searchParams.get('cidade') || '');
  }, [searchParams]);

  useEffect(() => {
    async function carregarCidades() {
      const lista = await obterOuBuscarCidades(supabase);
      setCidades(lista);
    }
    carregarCidades();
  }, [supabase]);

  useEffect(() => {
    buscarEventos();
  }, []);

  // Efeito para alternar os eventos em destaque automaticamente com fade out -> fade in
  useEffect(() => {
    if (eventos.length <= 1) return;

    const interval = setInterval(() => {
      setVisivelHero(false);
      setTimeout(() => {
        setIndiceDestaque((prev) => (prev + 1) % eventos.length);
        setVisivelHero(true);
      }, 500);
    }, 5500);

    return () => clearInterval(interval);
  }, [eventos.length]);

  async function buscarEventos() {
    setCarregando(true);
    const { data } = await supabase
      .from('eventos')
      .select(`
        id, titulo, descricao, imagem_url, data_evento, local, cidade, status,
        atletica:atleticas(id, nome, logo_url),
        lotes_ingresso(id, evento_id, nome_lote, preco, quantidade_total, quantidade_vendida, ordem, ativo)
      `)
      .eq('status', 'publicado')
      .order('data_evento', { ascending: true })
      .limit(12);

    if (data) {
      const validos = (data as unknown as (EventoComLote & { apagado_pelo_diretor?: boolean })[]).filter(e => !e.apagado_pelo_diretor);
      salvarVariosEventosCache(validos as unknown as import('@/lib/cacheEventos').EventoCompleto[]);
      setEventos(validos);
    }
    setCarregando(false);
  }

  function proximoDestaque() {
    if (eventos.length <= 1 || !visivelHero) return;
    setVisivelHero(false);
    setTimeout(() => {
      setIndiceDestaque((prev) => (prev + 1) % eventos.length);
      setVisivelHero(true);
    }, 500);
  }

  function destaqueAnterior() {
    if (eventos.length <= 1 || !visivelHero) return;
    setVisivelHero(false);
    setTimeout(() => {
      setIndiceDestaque((prev) => (prev - 1 + eventos.length) % eventos.length);
      setVisivelHero(true);
    }, 500);
  }

  function irParaDestaque(idx: number) {
    if (idx === indiceDestaque || !visivelHero) return;
    setVisivelHero(false);
    setTimeout(() => {
      setIndiceDestaque(idx);
      setVisivelHero(true);
    }, 500);
  }

  function obterMenorPreco(lotes?: LoteIngresso[]): number | null {
    if (!lotes || lotes.length === 0) return null;
    const ativos = lotes.filter((l) => l.ativo && l.quantidade_vendida < l.quantidade_total);
    if (ativos.length === 0) return null;
    return Math.min(...ativos.map((l) => l.preco));
  }

  function obterTotalDisponivel(lotes?: LoteIngresso[]): number {
    if (!lotes || lotes.length === 0) return 0;
    const ativos = lotes.filter((l) => l.ativo && l.quantidade_vendida < l.quantidade_total);
    return ativos.reduce((acc, l) => acc + (l.quantidade_total - l.quantidade_vendida), 0);
  }

  function extrairDataTicketmaster(dataIso: string) {
    const d = new Date(dataIso);
    const mes = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase();
    const dia = d.getDate().toString().padStart(2, '0');
    return { mes, dia };
  }

  const eventosFiltrados = eventos.filter(
    (e) =>
      e.titulo.toLowerCase().includes(busca.toLowerCase()) ||
      e.cidade?.toLowerCase().includes(busca.toLowerCase()) ||
      e.atletica?.nome.toLowerCase().includes(busca.toLowerCase())
  );

  const eventoDestaque = eventos[indiceDestaque] || eventos[0];

  return (
    <div className="relative min-h-screen bg-[#080c14] text-white">
      <style>{`
        @keyframes heroLoopBar {
          0% { width: 0%; }
          100% { width: 100%; }
        }
      `}</style>
      {/* Hero Marquee Stage */}
      <section className="relative overflow-hidden border-b border-white/10 bg-[#060910] group/hero">
        {/* Barra Visual de Progresso do Loop */}
        {eventos.length > 1 && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-white/10 z-40 overflow-hidden">
            <div
              key={`${indiceDestaque}-${visivelHero}`}
              className="h-full bg-gradient-to-r from-[#ff007a] via-[#8b5cf6] to-[#00e5ff]"
              style={{
                animation: visivelHero ? 'heroLoopBar 5500ms linear forwards' : 'none',
              }}
            />
          </div>
        )}
        {eventoDestaque ? (
          <div className="relative min-h-[480px] md:min-h-[540px] flex items-end pb-16 pt-12">
            {/* Background Image Layer with Smooth Fade Out & Fade In */}
            <div className="absolute inset-0 z-0 overflow-hidden bg-[#060910]">
              <div
                className={`absolute inset-0 transition-opacity duration-500 ease-in-out ${
                  visivelHero ? 'opacity-100' : 'opacity-0'
                }`}
              >
                {eventoDestaque.imagem_url ? (
                  <img
                    src={eventoDestaque.imagem_url}
                    alt={eventoDestaque.titulo}
                    className="w-full h-full object-cover object-center filter brightness-70 scale-105"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-r from-[#38bdf8] to-[#00e5ff]" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#080c14] via-[#080c14]/80 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-r from-[#080c14] via-[#080c14]/60 to-transparent" />
              </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-20 w-full min-h-[300px] sm:min-h-[340px]">
              {(() => {
                const totalHero = obterTotalDisponivel(eventoDestaque.lotes_ingresso);
                const precoHero = obterMenorPreco(eventoDestaque.lotes_ingresso);
                const esgotadoHero = !eventoDestaque.lotes_ingresso || eventoDestaque.lotes_ingresso.length === 0 || totalHero === 0 || precoHero === null;

                return (
                  <div
                    className={`max-w-2xl space-y-4 transition-all duration-500 ease-in-out ${
                      visivelHero
                        ? 'opacity-100 translate-y-0 relative z-20 pointer-events-auto'
                        : 'opacity-0 translate-y-2 relative z-0 pointer-events-none'
                    }`}
                  >
                    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-sm text-white text-xs font-black uppercase tracking-wider shadow-lg ${esgotadoHero ? 'bg-red-600' : 'bg-gradient-to-r from-[#ff007a] to-[#8b5cf6]'}`}>
                      <Flame size={14} className="animate-bounce" />
                      {esgotadoHero ? 'Evento em Destaque — Ingressos Esgotados' : 'Evento em Destaque — Garanta Já'}
                    </div>

                    <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black font-titulo tracking-tight leading-none text-white drop-shadow-lg transition-all duration-500">
                      {eventoDestaque.titulo}
                    </h1>

                    <div className="flex flex-wrap items-center gap-4 text-sm font-bold text-slate-200">
                      <span className="flex items-center gap-1.5 text-white font-extrabold bg-[#080c14]/80 px-3 py-1 rounded-md border border-white/10">
                        <Calendar size={16} className="text-[#ff007a]" />
                        {formatarDataHora(eventoDestaque.data_evento)}
                      </span>
                      <span className="flex items-center gap-1.5 text-slate-300 bg-[#080c14]/80 px-3 py-1 rounded-md border border-white/10">
                        <MapPin size={16} className="text-[#ff007a]" />
                        {eventoDestaque.local}{eventoDestaque.cidade ? `, ${eventoDestaque.cidade}` : ''}
                      </span>
                    </div>

                    <p className="text-sm text-slate-300 line-clamp-2 max-w-xl">
                      {eventoDestaque.descricao || 'Garanta seu ingresso antecipadamente no lote oficial de vendas do MeuIngrss.'}
                    </p>

                    <div className="pt-2 flex flex-wrap items-center gap-4">
                      <Link href={`/eventos/${eventoDestaque.id}`}>
                        <Botao variante={esgotadoHero ? 'fantasma' : 'festiva'} tamanho="xl" disabled={esgotadoHero}>
                          {esgotadoHero ? 'INGRESSOS ESGOTADOS' : 'COMPRAR INGRESSO'}
                          <ChevronRight size={18} className="ml-1" />
                        </Botao>
                      </Link>
                      <div className="text-xs text-slate-400">
                        {esgotadoHero ? '' : 'A partir de'}{' '}
                        <span className={`text-xl font-black ml-1 ${esgotadoHero ? 'text-red-500' : 'text-[#00e5ff]'}`}>
                          {esgotadoHero ? 'Esgotado' : precoHero !== null && precoHero > 0 ? formatarMoeda(precoHero) : precoHero === 0 ? 'Gratuito' : 'Esgotado'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Indicadores do carrossel (dots) */}
            {eventos.length > 1 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#080c14]/80 border border-white/10 backdrop-blur-md">
                {eventos.map((evt, idx) => (
                  <button
                    key={evt.id}
                    onClick={() => irParaDestaque(idx)}
                    aria-label={`Ir para evento ${idx + 1}`}
                    className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
                      idx === indiceDestaque
                        ? 'w-8 bg-gradient-to-r from-[#ff007a] to-[#00e5ff]'
                        : 'w-2 bg-white/30 hover:bg-white/60'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-20 text-center">
            <h1 className="text-4xl font-black font-titulo uppercase tracking-tight text-white">
              Ingressos para os Melhores Eventos
            </h1>
          </div>
        )}
      </section>

      {/* Sub-Navbar Móbile Adaptado (Abaixo do Hero) */}
      <BarraNavegacaoMobile />

      {/* Main Events Grid Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-white/10">
          <div>
            <h2 className="text-xl sm:text-2xl font-black font-titulo uppercase tracking-wider text-white flex items-center gap-2">
              Eventos & Ingressos Disponíveis
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Selecione o evento desejado para escolher seu setor e tipo de ingresso.
            </p>
          </div>
          <span className="hidden sm:inline-block text-xs font-black uppercase text-[#00e5ff] bg-[#162036] px-3 py-1.5 rounded-md border border-white/10">
            {eventosFiltrados.length} evento(s) encontrado(s)
          </span>
        </div>

        {carregando ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} className="h-[280px] sm:h-[360px]" />
            ))}
          </div>
        ) : eventosFiltrados.length > 0 ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
            {eventosFiltrados.map((evento) => {
              const dataFormatada = extrairDataTicketmaster(evento.data_evento);
              const precoMinimo = obterMenorPreco(evento.lotes_ingresso);
              const totalDisponivel = obterTotalDisponivel(evento.lotes_ingresso);
              const esgotado = !evento.lotes_ingresso || evento.lotes_ingresso.length === 0 || totalDisponivel === 0 || precoMinimo === null;

              return (
                <Link
                  key={evento.id}
                  href={`/eventos/${evento.id}`}
                  className="group flex flex-col bg-[#0f172a] border border-white/10 rounded-lg overflow-hidden hover:border-[#ff007a] transition-all hover:shadow-2xl duration-300"
                >
                  {/* Event Card Image & Badges Container */}
                  <div className="relative h-36 sm:h-48 w-full bg-[#162036] overflow-hidden">
                    {evento.imagem_url ? (
                      <img
                        src={evento.imagem_url}
                        alt={evento.titulo}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#ff007a] via-[#8b5cf6] to-[#026cdf]">
                        <Ticket className="w-8 h-8 sm:w-12 sm:h-12 text-white/40" />
                      </div>
                    )}

                    {/* Festive Date Box */}
                    <div className="absolute top-2 left-2 sm:top-3 sm:left-3 w-9 h-11 sm:w-12 sm:h-14 bg-gradient-to-b from-[#ff007a] to-[#026cdf] text-white rounded-md shadow-xl flex flex-col items-center justify-center border border-white/30">
                      <span className="text-[8px] sm:text-[10px] font-black tracking-widest uppercase opacity-90 leading-none">
                        {dataFormatada.mes}
                      </span>
                      <span className="text-xs sm:text-lg font-black leading-none mt-0.5">
                        {dataFormatada.dia}
                      </span>
                    </div>

                    {/* Presale / Status Badge */}
                    <div className="absolute top-2 right-2 sm:top-3 sm:right-3">
                      {esgotado ? (
                        <span className="px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-sm bg-red-600 text-white text-[8px] sm:text-[10px] font-black uppercase tracking-wider shadow">
                          Esgotado
                        </span>
                      ) : totalDisponivel <= 20 ? (
                        <span className="px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-sm bg-red-600 text-white text-[8px] sm:text-[10px] font-black uppercase tracking-wider shadow">
                          Últimos
                        </span>
                      ) : (
                        <span className="px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-sm bg-[#ffbe00] text-[#080c14] text-[8px] sm:text-[10px] font-black uppercase tracking-wider shadow">
                          Venda Geral
                        </span>
                      )}
                    </div>

                    {/* Atletica Badge overlay */}
                    <div className="absolute bottom-1.5 left-2 sm:bottom-2 sm:left-3 max-w-[85%]">
                      <span className="px-1.5 py-0.5 rounded-sm bg-[#080c14]/80 text-[#00e5ff] text-[8px] sm:text-[10px] font-extrabold uppercase tracking-wider backdrop-blur-sm border border-white/10 truncate block">
                        {evento.atletica?.nome || 'Organizador'}
                      </span>
                    </div>
                  </div>

                  {/* Card Info Body */}
                  <div className="p-3 sm:p-5 flex-1 flex flex-col justify-between space-y-2 sm:space-y-4">
                    <div>
                      <h3 className="text-xs sm:text-lg font-black font-titulo text-white group-hover:text-[#ff007a] transition-colors line-clamp-2 leading-snug">
                        {evento.titulo}
                      </h3>

                      <div className="mt-1.5 space-y-0.5 text-[10px] sm:text-xs text-slate-400">
                        <p className="flex items-center gap-1 truncate">
                          <MapPin size={12} className="text-[#ff007a] shrink-0" />
                          <span className="truncate">{evento.local}{evento.cidade ? `, ${evento.cidade}` : ''}</span>
                        </p>
                        <p className="flex items-center gap-1 truncate">
                          <Calendar size={12} className="text-[#00e5ff] shrink-0" />
                          <span className="truncate">{formatarData(evento.data_evento)}</span>
                        </p>
                      </div>
                    </div>

                    {/* Footer Row: Price & Buy Button */}
                    <div className="pt-2 sm:pt-3 border-t border-white/10 flex items-center justify-between gap-1">
                      {esgotado ? (
                        <>
                          <span className="font-black text-red-500 text-xs sm:text-base">
                            Esgotado
                          </span>
                          <span className="text-[10px] sm:text-xs text-slate-400 flex items-center gap-1">
                            <Users size={10} className="text-red-400" /> 0
                          </span>
                        </>
                      ) : (
                        <>
                          <div>
                            <span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                              A partir de
                            </span>
                            <p className="text-xs sm:text-base font-black text-[#00e5ff]">
                              {precoMinimo !== null && precoMinimo > 0 ? formatarMoeda(precoMinimo) : precoMinimo === 0 ? 'Gratuito' : 'Esgotado'}
                            </p>
                          </div>

                          <Botao variante="festiva" tamanho="sm" className="px-2 sm:px-4 py-1 text-[10px] sm:text-xs min-h-[32px] sm:min-h-[36px]">
                            Comprar
                          </Botao>
                        </>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-20 bg-[#0f172a] rounded-md border border-white/10">
            <Ticket className="w-14 h-14 text-slate-500 mx-auto mb-3" />
            <h3 className="text-lg font-bold uppercase tracking-wider text-white">
              Nenhum evento encontrado
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Tente ajustar o termo de pesquisa ou os filtros selecionados.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

export default function PaginaInicial() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#080c14] text-white py-12 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#ff007a]" />
      </div>
    }>
      <ConteudoPaginaInicial />
    </Suspense>
  );
}
