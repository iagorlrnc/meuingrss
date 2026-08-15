'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import Botao from '@/componentes/ui/Botao';
import Modal from '@/componentes/ui/Modal';
import { SkeletonCard } from '@/componentes/ui/Carregando';
import EstadoVazio from '@/componentes/ui/EstadoVazio';
import { criarClienteNavegador } from '@/lib/supabase/cliente';
import type { Atletica } from '@/tipos';
import BarraNavegacaoMobile from '@/componentes/layout/BarraNavegacaoMobile';
import {
  MapPin,
  Trophy,
  Calendar,
  ChevronRight,
  Building2,
  Info,
  AtSign,
  Phone,
} from 'lucide-react';

interface AtleticaComEventos extends Atletica {
  eventos_count?: number;
}

let cacheAtleticas: AtleticaComEventos[] | null = null;

function ConteudoAtleticas() {
  const searchParams = useSearchParams();
  const buscaInicial = searchParams.get('busca') || '';
  const cidadeInicial = searchParams.get('cidade') || '';

  const [atleticas, setAtleticas] = useState<AtleticaComEventos[]>(cacheAtleticas || []);
  const [carregando, setCarregando] = useState(!cacheAtleticas);
  const [busca, setBusca] = useState(buscaInicial);
  const [cidadeSelecionada, setCidadeSelecionada] = useState(cidadeInicial);
  const [atleticaModal, setAtleticaModal] = useState<AtleticaComEventos | null>(null);

  const supabase = criarClienteNavegador();

  async function carregarAtleticas() {
    if (!cacheAtleticas) {
      setCarregando(true);
    }
    try {
      const { data: dataAtleticas } = await supabase
        .from('atleticas')
        .select('id, nome, faculdade, cidade, logo_url, capa_url, descricao, cor_primaria, cor_secundaria, instagram, whatsapp, status, eventos:eventos(count)')
        .eq('status', 'ativa')
        .order('nome', { ascending: true });

      if (dataAtleticas && dataAtleticas.length > 0) {
        interface RawAtleticaQuery extends Atletica {
          eventos?: { count: number }[];
        }

        const formatadas: AtleticaComEventos[] = (dataAtleticas as unknown as RawAtleticaQuery[]).map((a) => ({
          ...a,
          eventos_count: Array.isArray(a.eventos) && a.eventos[0] ? a.eventos[0].count : 0,
        }));

        cacheAtleticas = formatadas;
        setAtleticas(formatadas);
      } else {
        cacheAtleticas = [];
        setAtleticas([]);
      }
    } catch (err) {
      console.error('Erro ao carregar atléticas do banco:', err);
      if (!cacheAtleticas) {
        setAtleticas([]);
      }
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    const q = searchParams.get('busca') || '';
    const c = searchParams.get('cidade') || '';
    setBusca(q);
    setCidadeSelecionada(c);
  }, [searchParams]);

  useEffect(() => {
    carregarAtleticas();
  }, []);

  const atleticasFiltradas = atleticas.filter((a) => {
    const combinaBusca =
      !busca ||
      a.nome.toLowerCase().includes(busca.toLowerCase()) ||
      a.faculdade.toLowerCase().includes(busca.toLowerCase()) ||
      a.cidade.toLowerCase().includes(busca.toLowerCase());

    const combinaCidade =
      !cidadeSelecionada ||
      a.cidade.toLowerCase() === cidadeSelecionada.toLowerCase();

    return combinaBusca && combinaCidade;
  });

  return (
    <>
      <BarraNavegacaoMobile />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 pb-12">
        <h1 className="text-2xl sm:text-3xl font-black font-titulo mb-2">
          Atléticas <span className="gradiente-texto">Parceiras</span>
        </h1>
        <p className="text-texto-secundario mb-8">
          Conheça as atléticas organizadoras dos maiores eventos acadêmicos e festas universitárias do Tocantins.
        </p>

      {/* Grid de Atléticas */}
      {carregando ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} className="h-[260px] sm:h-[320px]" />
            ))}
          </div>
        ) : atleticasFiltradas.length > 0 ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
            {atleticasFiltradas.map((atletica) => {
              const corPrimaria = atletica.cor_primaria || '#ff007a';
              const corSecundaria = atletica.cor_secundaria || '#026cdf';
              const inicial = atletica.nome[0] || 'A';

              return (
                <div
                  key={atletica.id}
                  className="group flex flex-col bg-[#0f172a] border border-white/10 rounded-lg sm:rounded-xl overflow-hidden hover:border-[#00e5ff]/50 transition-all hover:shadow-2xl duration-300"
                >
                  {/* Top Gradient/Cover Header Banner */}
                  <div
                    className="h-20 sm:h-28 w-full relative p-3 sm:p-4 flex items-end justify-between transition-all duration-300"
                    style={{
                      background: atletica.capa_url
                        ? `linear-gradient(to bottom, rgba(0,0,0,0.2), rgba(15,23,42,0.85)), url('${atletica.capa_url}') center/cover no-repeat`
                        : `linear-gradient(135deg, ${corPrimaria}, ${corSecundaria})`,
                    }}
                  >
                  </div>

                  {/* Body Content */}
                  <div className="p-3 sm:p-5 pt-0 relative flex-1 flex flex-col justify-between space-y-2.5 sm:space-y-4">
                    {/* Logo Emblem Avatar overlap */}
                    <div className="-mt-6 sm:-mt-8 mb-1.5 sm:mb-2 flex items-end justify-between gap-1">
                      <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-lg sm:rounded-xl bg-[#0f172a] p-1 border-2 border-white/20 shadow-xl overflow-hidden shrink-0">
                        {atletica.logo_url ? (
                          <img
                            src={atletica.logo_url}
                            alt={atletica.nome}
                            className="w-full h-full object-cover rounded-md"
                          />
                        ) : (
                          <div
                            className="w-full h-full rounded-md flex items-center justify-center font-black text-sm sm:text-xl text-white shadow-inner"
                            style={{
                              background: `linear-gradient(135deg, ${corPrimaria}, ${corSecundaria})`,
                            }}
                          >
                            {inicial}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1 sm:space-y-2">
                      <h3 className="text-xs sm:text-lg font-black font-titulo text-white group-hover:text-[#00e5ff] transition-colors leading-snug line-clamp-2">
                        {atletica.nome}
                      </h3>

                      <div className="space-y-0.5 text-[10px] sm:text-xs text-slate-300">
                        <p className="flex items-center gap-1 truncate">
                          <Building2 size={12} className="text-[#ff007a] shrink-0" />
                          <span className="truncate">{atletica.faculdade}</span>
                        </p>
                        <p className="flex items-center gap-1 truncate">
                          <MapPin size={12} className="text-[#00e5ff] shrink-0" />
                          <span className="truncate">{atletica.cidade}</span>
                        </p>
                      </div>
                    </div>

                    {/* Botões de Ação: DETALHES acima de VER EVENTOS */}
                    <div className="pt-2 sm:pt-3 border-t border-white/10 space-y-1.5 sm:space-y-2">
                      <Botao
                        tamanho="sm"
                        style={{ color: '#080c14' }}
                        className="w-full justify-center text-[9px] sm:text-xs font-black py-1 min-h-[30px] sm:min-h-[38px] px-1 bg-gradient-to-r from-[#38bdf8] to-[#00e5ff] hover:brightness-110 shadow-md transition-all border-none"
                        onClick={() => setAtleticaModal(atletica)}
                        icone={<Info size={13} style={{ color: '#080c14' }} />}
                      >
                        <span style={{ color: '#080c14' }} className="sm:hidden">DETALHES</span>
                        <span style={{ color: '#080c14' }} className="hidden sm:inline">DETALHES DA ATLÉTICA</span>
                      </Botao>

                      <Link href={`/eventos?busca=${encodeURIComponent(atletica.nome)}`} className="block">
                        <Botao variante="festiva" tamanho="sm" className="w-full justify-center text-[9px] sm:text-xs font-bold py-1 min-h-[30px] sm:min-h-[38px] px-1">
                          VER EVENTOS
                          <ChevronRight size={14} className="ml-0.5" />
                        </Botao>
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EstadoVazio
            titulo={busca || cidadeSelecionada ? "Nenhuma atlética encontrada" : "Nenhuma atlética no momento"}
            descricao={
              busca || cidadeSelecionada
                ? `Não encontramos atléticas com os filtros aplicados.`
                : 'Não há atléticas cadastradas no banco de dados até o momento. Volte em breve para conferir novas parceiras!'
            }
            icone={<Trophy className="w-8 h-8 text-[#00e5ff]" />}
            acao={
              busca || cidadeSelecionada ? (
                <Botao variante="contorno" onClick={() => { setBusca(''); setCidadeSelecionada(''); }}>
                  Limpar Filtros
                </Botao>
              ) : undefined
            }
          />
        )}

      {/* Modal de Detalhes da Atlética */}
      <Modal
        aberto={atleticaModal !== null}
        aoFechar={() => setAtleticaModal(null)}
        tamanho="lg"
        className="p-0 overflow-hidden border border-white/15 bg-[#0f172a]"
      >
        {atleticaModal && (
          <div className="space-y-0 text-slate-100">
            {/* Banner de Capa no Modal */}
            <div
              className="h-44 sm:h-52 w-full relative p-4 sm:p-6 flex items-end justify-between"
              style={{
                background: atleticaModal.capa_url
                  ? `linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(15,23,42,0.9)), url('${atleticaModal.capa_url}') center/cover no-repeat`
                  : `linear-gradient(135deg, ${atleticaModal.cor_primaria || '#ff007a'}, ${atleticaModal.cor_secundaria || '#8b5cf6'})`,
              }}
            >
              <div className="flex flex-col sm:flex-row sm:items-end gap-4 w-full z-10">
                {/* Logo Avatar */}
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl border-4 border-[#0f172a] shadow-2xl overflow-hidden flex items-center justify-center text-white font-black text-3xl shrink-0 bg-[#0f172a]">
                  {atleticaModal.logo_url ? (
                    <img src={atleticaModal.logo_url} alt={atleticaModal.nome} className="w-full h-full object-cover" />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center"
                      style={{
                        background: `linear-gradient(135deg, ${atleticaModal.cor_primaria || '#ff007a'}, ${atleticaModal.cor_secundaria || '#8b5cf6'})`,
                      }}
                    >
                      {atleticaModal.nome[0]}
                    </div>
                  )}
                </div>

                {/* Nome e Faculdade */}
                <div className="text-white min-w-0 flex-1">
                  <h2 className="text-xl sm:text-2xl font-black font-titulo text-white truncate">
                    {atleticaModal.nome}
                  </h2>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300 mt-1">
                    <span className="flex items-center gap-1">
                      <Building2 size={13} className="text-[#ff007a]" /> {atleticaModal.faculdade}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <MapPin size={13} className="text-[#00e5ff]" /> {atleticaModal.cidade}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Conteúdo do Modal */}
            <div className="p-6 space-y-6 bg-[#0f172a] text-slate-200">
              {/* Biografia / Sobre */}
              <div className="space-y-2">
                <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  Sobre a Atlética
                </h4>
                <p className="text-sm text-slate-300 leading-relaxed bg-[#162036] p-4 rounded-xl border border-white/5">
                  {atleticaModal.descricao || 'Esta atlética ainda não inseriu uma descrição detalhada.'}
                </p>
              </div>

              {/* Contatos e Redes Sociais */}
              <div className="space-y-3">
                <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  Contatos & Redes Sociais
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {atleticaModal.instagram && (
                    <div className="flex items-center gap-2.5 p-3 rounded-xl bg-[#162036] border border-white/5 text-slate-200">
                      <AtSign size={16} className="text-[#ff007a] shrink-0" />
                      <div>
                        <span className="text-[10px] text-slate-400 block font-semibold">Instagram</span>
                        <span className="font-bold text-white">{atleticaModal.instagram}</span>
                      </div>
                    </div>
                  )}

                  {atleticaModal.whatsapp && (
                    <div className="flex items-center gap-2.5 p-3 rounded-xl bg-[#162036] border border-white/5 text-slate-200">
                      <Phone size={16} className="text-emerald-400 shrink-0" />
                      <div>
                        <span className="text-[10px] text-slate-400 block font-semibold">WhatsApp</span>
                        <span className="font-bold text-white">{atleticaModal.whatsapp}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Botão de Ver Eventos */}
              <div className="pt-4 border-t border-white/10 flex justify-end gap-3">
                <Botao variante="contorno" onClick={() => setAtleticaModal(null)}>
                  Fechar
                </Botao>
                <Link href={`/eventos?busca=${encodeURIComponent(atleticaModal.nome)}`}>
                  <Botao variante="festiva" icone={<Calendar size={16} />}>
                    Ver Eventos da Atlética
                  </Botao>
                </Link>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
    </>
  );
}

export default function PaginaAtleticas() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#080c14] py-16 px-4">
          <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} className="h-[320px]" />
            ))}
          </div>
        </div>
      }
    >
      <ConteudoAtleticas />
    </Suspense>
  );
}
