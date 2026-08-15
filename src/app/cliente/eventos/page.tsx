'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import Cartao from '@/componentes/ui/Cartao';
import CampoTexto from '@/componentes/ui/CampoTexto';
import Botao from '@/componentes/ui/Botao';
import EstadoVazio from '@/componentes/ui/EstadoVazio';
import { SkeletonCard } from '@/componentes/ui/Carregando';
import { criarClienteNavegador } from '@/lib/supabase/cliente';
import { formatarData, formatarMoeda } from '@/lib/utilitarios';
import type { Evento, LoteIngresso, Atletica } from '@/tipos';
import BarraNavegacaoMobile from '@/componentes/layout/BarraNavegacaoMobile';
import { Search, Calendar, MapPin, Users, Ticket, SlidersHorizontal } from 'lucide-react';

import { salvarVariosEventosCache } from '@/lib/cacheEventos';

interface EventoComRelacoes extends Omit<Evento, 'atletica'> {
  atletica: Pick<Atletica, 'id' | 'nome'> | null;
  lotes_ingresso: LoteIngresso[];
}

// Cache em memória para carregamento instantâneo (0ms) ao alternar de aba
let cacheEventos: EventoComRelacoes[] | null = null;

function ConteudoEventos() {
  const searchParams = useSearchParams();
  const buscaInicial = searchParams.get('busca') || searchParams.get('atletica') || '';
  const cidadeInicial = searchParams.get('cidade') || '';
  
  const [eventos, setEventos] = useState<EventoComRelacoes[]>(cacheEventos || []);
  const [carregando, setCarregando] = useState(!cacheEventos);
  const [busca, setBusca] = useState(buscaInicial);
  const [cidade, setCidade] = useState(cidadeInicial);
  const supabase = criarClienteNavegador();

  useEffect(() => {
    const q = searchParams.get('busca') || searchParams.get('atletica') || '';
    const c = searchParams.get('cidade') || '';
    setBusca(q);
    setCidade(c);
  }, [searchParams]);

  useEffect(() => { buscarEventos(); }, []);

  async function buscarEventos() {
    if (!cacheEventos) setCarregando(true);
    const { data } = await supabase
      .from('eventos')
      .select('id, titulo, imagem_url, data_evento, local, cidade, status, atletica:atleticas(id, nome), lotes_ingresso(id, preco, quantidade_total, quantidade_vendida, ativo)')
      .eq('status', 'publicado')
      .order('data_evento', { ascending: true })
      .range(0, 49);

    if (data) {
      const novoseventos = (data as unknown as (EventoComRelacoes & { apagado_pelo_diretor?: boolean })[]).filter(e => !e.apagado_pelo_diretor);
      cacheEventos = novoseventos;
      salvarVariosEventosCache(novoseventos as unknown as import('@/lib/cacheEventos').EventoCompleto[]);
      setEventos(novoseventos);
    }
    setCarregando(false);
  }

  const eventosFiltrados = eventos.filter(e => {
    const matchBusca = !busca ||
      e.titulo.toLowerCase().includes(busca.toLowerCase()) ||
      e.cidade?.toLowerCase().includes(busca.toLowerCase()) ||
      e.atletica?.nome.toLowerCase().includes(busca.toLowerCase());
    const matchCidade = !cidade || e.cidade?.toLowerCase() === cidade.toLowerCase();
    return matchBusca && matchCidade;
  });

  function extrairDataTicketmaster(dataIso: string) {
    const d = new Date(dataIso);
    const mes = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase();
    const dia = d.getDate().toString().padStart(2, '0');
    return { mes, dia };
  }

  function menorPreco(lotes?: LoteIngresso[]): number | null {
    if (!lotes || lotes.length === 0) return null;
    const ativos = lotes.filter(l => l.ativo && l.quantidade_vendida < l.quantidade_total);
    return ativos.length ? Math.min(...ativos.map(l => l.preco)) : null;
  }

  return (
    <>
      <BarraNavegacaoMobile />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 pb-12">
        <h1 className="text-2xl sm:text-3xl font-black font-titulo mb-2">
          Todos os <span className="gradiente-texto">Eventos</span>
        </h1>
        <p className="text-texto-secundario mb-8">Encontre o evento perfeito para você</p>

        {carregando ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
            {Array.from({ length: 9 }).map((_, i) => <SkeletonCard key={i} className="h-[280px] sm:h-[360px]" />)}
          </div>
        ) : eventosFiltrados.length > 0 ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
          {eventosFiltrados.map((evento) => {
            const dataFormatada = extrairDataTicketmaster(evento.data_evento);
            const preco = menorPreco(evento.lotes_ingresso);
            const totalRestante = evento.lotes_ingresso
              ?.filter(l => l.ativo && l.quantidade_vendida < l.quantidade_total)
              .reduce((a, l) => a + (l.quantidade_total - l.quantidade_vendida), 0) || 0;
            const esgotado = !evento.lotes_ingresso || evento.lotes_ingresso.length === 0 || totalRestante === 0 || preco === null;

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
                      loading="lazy"
                      decoding="async"
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
                    ) : totalRestante <= 20 ? (
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
                            {preco !== null && preco > 0 ? formatarMoeda(preco) : preco === 0 ? 'Gratuito' : 'Esgotado'}
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
        <EstadoVazio
          titulo="Nenhum evento disponível no momento"
          descricao={busca ? `Não encontramos eventos que coincidam com a busca "${busca}". Tente buscar por outros termos.` : "Não há eventos cadastrados no momento. Volte em breve para confira novidades!"}
          icone={<SlidersHorizontal className="w-7 h-7" />}
          acao={
            busca ? (
              <Botao variante="contorno" onClick={() => setBusca('')}>
                Limpar busca
              </Botao>
            ) : undefined
          }
        />
      )}
      </div>
    </>
  );
}

export default function PaginaEventos() {
  return (
    <Suspense fallback={
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 pb-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} className="h-[360px]" />)}
        </div>
      </div>
    }>
      <ConteudoEventos />
    </Suspense>
  );
}
