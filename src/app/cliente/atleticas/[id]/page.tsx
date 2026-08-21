'use client';

import React, { useState, useEffect, use, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { criarClienteNavegador } from '@/lib/supabase/cliente';
import CardProduto from '@/componentes/loja/CardProduto';
import Carregando from '@/componentes/ui/Carregando';
import BarraNavegacaoMobile from '@/componentes/layout/BarraNavegacaoMobile';
import Botao from '@/componentes/ui/Botao';
import { formatarData, formatarMoeda, ordenarEventosPorPrioridade, gerarSlug } from '@/lib/utilitarios';
import type { ProdutoLoja, Atletica, Evento, LoteIngresso } from '@/tipos';
import {
  ShoppingCart,
  Calendar,
  Search,
  SlidersHorizontal,
  X,
  Trophy,
  ArrowLeft,
  Building2,
  MapPin,
  AtSign,
  Phone,
  Check,
  RotateCcw,
  Package,
  Ticket,
  ChevronRight,
} from 'lucide-react';

interface EventoComLotes extends Evento {
  lotes_ingresso?: LoteIngresso[];
}

const CATEGORIAS: { id: string; rotulo: string }[] = [
  { id: 'todas', rotulo: 'Todos os Produtos' },
  { id: 'caneca', rotulo: 'Canecas' },
  { id: 'copo', rotulo: 'Copos' },
  { id: 'tirante', rotulo: 'Tirantes' },
  { id: 'camisa', rotulo: 'Camisas' },
  { id: 'shorts', rotulo: 'Shorts' },
  { id: 'acessorio', rotulo: 'Acessórios' },
  { id: 'outros', rotulo: 'Outros' },
];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ConteudoPerfilAtletica({
  identificador,
}: {
  identificador: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [atletica, setAtletica] = useState<Atletica | null>(null);
  const [produtos, setProdutos] = useState<ProdutoLoja[]>([]);
  const [eventos, setEventos] = useState<EventoComLotes[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Alternador de Abas: Eventos vs Produtos (Padrão: Eventos)
  const [abaAtiva, setAbaAtiva] = useState<'eventos' | 'produtos'>(
    searchParams.get('aba') === 'produtos' ? 'produtos' : 'eventos'
  );

  useEffect(() => {
    const abaParam = searchParams.get('aba');
    if (abaParam === 'produtos') {
      setAbaAtiva('produtos');
    } else if (abaParam === 'eventos') {
      setAbaAtiva('eventos');
    }
  }, [searchParams]);

  // Filtros de Produtos
  const [buscaProduto, setBuscaProduto] = useState('');
  const [categoriaAtiva, setCategoriaAtiva] = useState('todas');
  const [ordenacao, setOrdenacao] = useState<'novos' | 'menor_preco' | 'maior_preco'>('novos');
  const [drawerFiltrosAberto, setDrawerFiltrosAberto] = useState(false);

  // Filtro de Eventos
  const [buscaEvento, setBuscaEvento] = useState('');

  const supabase = criarClienteNavegador();

  useEffect(() => {
    async function carregarDados() {
      setCarregando(true);
      try {
        const decodedParam = decodeURIComponent(identificador || '').trim();
        const ehUUID = UUID_REGEX.test(decodedParam);

        let atl: Atletica | null = null;

        // 1. Busca por UUID
        if (ehUUID) {
          const { data, error } = await supabase
            .from('atleticas')
            .select('*')
            .eq('id', decodedParam)
            .maybeSingle();

          if (!error && data) {
            atl = data as Atletica;
          }
        } else {
          // 2. Busca por Nome ou Slug Amigável
          const { data: todas, error } = await supabase
            .from('atleticas')
            .select('*');

          if (!error && todas && todas.length > 0) {
            const termoSlug = gerarSlug(decodedParam);
            const todasAtleticas = todas as Atletica[];

            // Busca exata pelo slug do nome
            atl =
              todasAtleticas.find((a) => gerarSlug(a.nome) === termoSlug) ||
              todasAtleticas.find((a) => a.nome.toLowerCase() === decodedParam.toLowerCase()) ||
              todasAtleticas.find((a) => gerarSlug(a.nome).includes(termoSlug)) ||
              null;
          }
        }

        if (atl) {
          setAtletica(atl);

          // 2. Produtos da Atlética
          const { data: prodsData, error: prodsError } = await supabase
            .from('store_products')
            .select(`
              *,
              atletica:atleticas(id, nome, logo_url, cor_primaria, cor_secundaria, faculdade, cidade)
            `)
            .eq('atletica_id', atl.id)
            .eq('is_active', true)
            .order('created_at', { ascending: false });

          if (!prodsError && prodsData) {
            setProdutos(prodsData as ProdutoLoja[]);
          }

          // 3. Eventos da Atlética
          const { data: evData, error: evError } = await supabase
            .from('eventos')
            .select(`
              id, slug, titulo, descricao, imagem_url, data_evento, local, cidade, status, apagado_pelo_diretor,
              lotes_ingresso(id, preco, quantidade_total, quantidade_vendida, ativo)
            `)
            .eq('atletica_id', atl.id)
            .eq('apagado_pelo_diretor', false)
            .in('status', ['publicado', 'encerrado', 'cancelado'])
            .order('data_evento', { ascending: true });

          if (!evError && evData) {
            const ordenados = ordenarEventosPorPrioridade(evData as unknown as EventoComLotes[]);
            setEventos(ordenados);
          }
        }
      } catch (err) {
        console.error('Erro ao carregar dados da atlética:', err);
      } finally {
        setCarregando(false);
      }
    }

    if (identificador) {
      carregarDados();
    }
  }, [identificador, supabase]);

  // Contagem de filtros ativos de produtos
  const totalFiltrosAtivos =
    (categoriaAtiva !== 'todas' ? 1 : 0) +
    (ordenacao !== 'novos' ? 1 : 0);

  function limparTodosFiltrosProdutos() {
    setBuscaProduto('');
    setCategoriaAtiva('todas');
    setOrdenacao('novos');
  }

  // Filtragem dos Produtos
  const produtosFiltrados = produtos
    .filter((p) => {
      if (buscaProduto.trim()) {
        const termo = buscaProduto.toLowerCase().trim();
        const nomeMatch = p.name.toLowerCase().includes(termo);
        const descMatch = p.description?.toLowerCase().includes(termo) ?? false;
        if (!nomeMatch && !descMatch) return false;
      }
      if (categoriaAtiva !== 'todas') {
        if (p.category !== categoriaAtiva) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (ordenacao === 'menor_preco') return a.price - b.price;
      if (ordenacao === 'maior_preco') return b.price - a.price;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  // Filtragem dos Eventos
  const eventosFiltrados = eventos.filter((e) => {
    if (!buscaEvento.trim()) return true;
    const termo = buscaEvento.toLowerCase().trim();
    return (
      e.titulo.toLowerCase().includes(termo) ||
      (e.local && e.local.toLowerCase().includes(termo)) ||
      (e.cidade && e.cidade.toLowerCase().includes(termo))
    );
  });

  function extrairDataBadge(dataIso: string) {
    const d = new Date(dataIso);
    const mes = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase();
    const dia = d.getDate().toString().padStart(2, '0');
    return { mes, dia };
  }

  function obterMenorPreco(lotes?: LoteIngresso[]): number | null {
    if (!lotes || lotes.length === 0) return null;
    const ativos = lotes.filter((l) => l.ativo && l.quantidade_vendida < l.quantidade_total);
    return ativos.length ? Math.min(...ativos.map((l) => l.preco)) : null;
  }

  const categoriaObjeto = CATEGORIAS.find((c) => c.id === categoriaAtiva);

  if (carregando) {
    return (
      <>
        <BarraNavegacaoMobile />
        <div className="py-24 flex flex-col items-center justify-center gap-3">
          <Carregando tamanho="lg" texto="Carregando atlética..." />
        </div>
      </>
    );
  }

  if (!atletica) {
    return (
      <>
        <BarraNavegacaoMobile />
        <div className="max-w-md mx-auto py-20 px-4 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-white/5 mx-auto flex items-center justify-center text-slate-400">
            <Trophy size={28} />
          </div>
          <h2 className="text-xl font-bold text-white font-titulo">Atlética não encontrada</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Não conseguimos encontrar as informações desta atlética. Verifique o link ou retorne para a página de atléticas.
          </p>
          <Link href="/atleticas">
            <Botao variante="primario" tamanho="md">
              Voltar para Atléticas
            </Botao>
          </Link>
        </div>
      </>
    );
  }

  const corPrimaria = atletica.cor_primaria || '#ff007a';
  const corSecundaria = atletica.cor_secundaria || '#026cdf';
  const inicial = atletica.nome ? atletica.nome[0] : 'A';

  return (
    <>
      <BarraNavegacaoMobile />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 pb-16 space-y-6">
        {/* Botão de Voltar para a Página Anterior */}
        <div>
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft size={16} />
            <span>Voltar</span>
          </button>
        </div>

        {/* Banner de Perfil da Atlética */}
        <div className="rounded-2xl sm:rounded-3xl bg-[#0e1626] border border-white/10 overflow-hidden shadow-2xl">
          {/* Capa */}
          <div
            className="h-36 sm:h-56 md:h-64 w-full relative"
            style={{
              background: atletica.capa_url
                ? `linear-gradient(to bottom, rgba(0,0,0,0.2), rgba(14,22,38,0.9)), url('${atletica.capa_url}') center/cover no-repeat`
                : `linear-gradient(135deg, ${corPrimaria}, ${corSecundaria})`,
            }}
          />

          {/* Dados do Perfil */}
          <div className="px-4 sm:px-8 pb-6 sm:pb-8 relative">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 -mt-12 sm:-mt-16 mb-4">
              {/* Logo / Foto de Perfil */}
              <div className="flex items-end gap-4">
                <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-2xl sm:rounded-3xl bg-[#080c14] p-1.5 border-4 border-[#080c14] shadow-2xl overflow-hidden shrink-0">
                  {atletica.logo_url ? (
                    <img
                      src={atletica.logo_url}
                      alt={atletica.nome}
                      className="w-full h-full object-cover rounded-xl sm:rounded-2xl"
                    />
                  ) : (
                    <div
                      className="w-full h-full rounded-xl sm:rounded-2xl flex items-center justify-center font-black text-2xl sm:text-4xl text-white shadow-inner"
                      style={{
                        background: `linear-gradient(135deg, ${corPrimaria}, ${corSecundaria})`,
                      }}
                    >
                      {inicial}
                    </div>
                  )}
                </div>

                <div className="space-y-1 pb-1">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-[#00e5ff]/10 text-[#00e5ff] border border-[#00e5ff]/30">
                    <Trophy size={12} />
                    <span>Atlética Oficial</span>
                  </span>
                  <h1 className="text-xl sm:text-3xl font-black font-titulo text-white">
                    {atletica.nome}
                  </h1>
                </div>
              </div>

              {/* Redes Sociais / Contato */}
              <div className="flex flex-wrap items-center gap-2">
                {atletica.instagram && (
                  <a
                    href={`https://instagram.com/${atletica.instagram.replace('@', '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-xs font-bold transition-all flex items-center gap-1.5"
                  >
                    <AtSign size={14} className="text-[#ff007a]" />
                    <span>@{atletica.instagram.replace('@', '')}</span>
                  </a>
                )}

                {atletica.whatsapp && (
                  <a
                    href={`https://wa.me/55${atletica.whatsapp.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-xs font-bold transition-all flex items-center gap-1.5"
                  >
                    <Phone size={14} className="text-emerald-400" />
                    <span>WhatsApp</span>
                  </a>
                )}
              </div>
            </div>

            {/* Detalhes de Faculdade e Cidade */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-2 border-t border-white/5">
              {atletica.faculdade && (
                <div className="flex items-center gap-1.5">
                  <Building2 size={15} className="text-[#00e5ff]" />
                  <span>{atletica.faculdade}</span>
                </div>
              )}

              {atletica.cidade && (
                <div className="flex items-center gap-1.5">
                  <MapPin size={15} className="text-[#ff007a]" />
                  <span>{atletica.cidade}</span>
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <Calendar size={15} className="text-[#ff007a]" />
                <span><strong>{eventos.length}</strong> {eventos.length === 1 ? 'evento' : 'eventos'}</span>
              </div>

              <div className="flex items-center gap-1.5">
                <Package size={15} className="text-[#00e5ff]" />
                <span><strong>{produtos.length}</strong> {produtos.length === 1 ? 'produto na loja' : 'produtos na loja'}</span>
              </div>
            </div>

            {atletica.descricao && (
              <p className="text-xs sm:text-sm text-slate-300 mt-3 leading-relaxed max-w-3xl">
                {atletica.descricao}
              </p>
            )}
          </div>
        </div>

        {/* Alternador de Abas: Eventos vs Produtos */}
        <div className="flex items-center p-1.5 rounded-2xl bg-[#0e1626] border border-white/10 max-w-md">
          <button
            type="button"
            onClick={() => setAbaAtiva('eventos')}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 ${
              abaAtiva === 'eventos'
                ? 'bg-gradient-to-r from-[#ff007a] to-[#8b5cf6] text-white shadow-md font-black'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Calendar size={16} />
            <span>Eventos</span>
          </button>

          <button
            type="button"
            onClick={() => setAbaAtiva('produtos')}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 ${
              abaAtiva === 'produtos'
                ? 'bg-gradient-to-r from-[#00e5ff] to-[#026cdf] text-slate-950 shadow-md font-black'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <ShoppingCart size={16} />
            <span>Produtos</span>
          </button>
        </div>

        {/* CONTEÚDO DA ABA 1: EVENTOS */}
        {abaAtiva === 'eventos' && (
          <div className="space-y-6 pt-2">
            {/* Título da Seção */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-xl sm:text-2xl font-black font-titulo text-white flex items-center gap-2">
                  <Calendar className="text-[#ff007a]" size={22} />
                  Eventos da Atlética
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Garanta seus ingressos para as melhores festas, jogos e eventos
                </p>
              </div>
              <span className="text-xs text-slate-400">
                Mostrando <strong>{eventosFiltrados.length}</strong> de {eventos.length} {eventos.length === 1 ? 'evento' : 'eventos'}
              </span>
            </div>

            {/* Barra de Busca de Eventos */}
            <div className="relative max-w-md">
              <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder={`Buscar eventos de ${atletica.nome}...`}
                value={buscaEvento}
                onChange={(e) => setBuscaEvento(e.target.value)}
                className="w-full bg-[#0e1626] border border-white/10 rounded-2xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-400 outline-none focus:border-[#ff007a] transition-all shadow-sm"
              />
              {buscaEvento && (
                <button
                  type="button"
                  onClick={() => setBuscaEvento('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 rounded-full hover:bg-white/10 transition-all cursor-pointer"
                  title="Limpar busca"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Grid de Eventos (2 Colunas no Mobile) */}
            {eventosFiltrados.length > 0 ? (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
                {eventosFiltrados.map((evento) => {
                  const dataFormatada = extrairDataBadge(evento.data_evento);
                  const precoMinimo = obterMenorPreco(evento.lotes_ingresso);
                  const ehCancelado = evento.status === 'cancelado';
                  const ehEncerrado = evento.status === 'encerrado' || new Date(evento.data_evento) < new Date();

                  const totalRestante = evento.lotes_ingresso?.reduce(
                    (acc, l) => acc + (l.ativo ? l.quantidade_total - l.quantidade_vendida : 0),
                    0
                  ) ?? 0;
                  const esgotado = !ehCancelado && !ehEncerrado && totalRestante <= 0 && (evento.lotes_ingresso?.length ?? 0) > 0;

                  return (
                    <Link
                      key={evento.id}
                      href={`/eventos/${evento.slug || evento.id}`}
                      className="group flex flex-col bg-[#0f172a] border border-white/10 rounded-xl sm:rounded-2xl overflow-hidden hover:border-[#ff007a]/50 transition-all duration-300 shadow-lg hover:shadow-2xl hover:-translate-y-1 cursor-pointer"
                    >
                      {/* Imagem do Evento */}
                      <div className="aspect-[16/9] w-full relative overflow-hidden bg-slate-900">
                        {evento.imagem_url ? (
                          <img
                            src={evento.imagem_url}
                            alt={evento.titulo}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#162036] to-[#080c14] text-slate-500">
                            <Calendar size={36} />
                          </div>
                        )}

                        {/* Badge de Data */}
                        <div className="absolute top-2 left-2 sm:top-3 sm:left-3 bg-[#080c14]/90 backdrop-blur-md border border-white/15 rounded-lg px-2 sm:px-2.5 py-1 text-center shadow-lg">
                          <span className="block text-[8px] sm:text-[9px] font-black uppercase text-[#ff007a]">
                            {dataFormatada.mes}
                          </span>
                          <span className="block text-xs sm:text-base font-black text-white font-mono leading-none mt-0.5">
                            {dataFormatada.dia}
                          </span>
                        </div>

                        {/* Status Badge */}
                        <div className="absolute top-2 right-2 sm:top-3 sm:right-3">
                          {ehCancelado ? (
                            <span className="px-2 py-0.5 rounded bg-red-700 text-white text-[8px] sm:text-[9px] font-black uppercase tracking-wider shadow">
                              Cancelado
                            </span>
                          ) : ehEncerrado ? (
                            <span className="px-2 py-0.5 rounded bg-zinc-700 text-slate-300 text-[8px] sm:text-[9px] font-black uppercase tracking-wider shadow">
                              Encerrado
                            </span>
                          ) : esgotado ? (
                            <span className="px-2 py-0.5 rounded bg-red-600 text-white text-[8px] sm:text-[9px] font-black uppercase tracking-wider shadow">
                              Esgotado
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-[#ffbe00] text-[#080c14] text-[8px] sm:text-[9px] font-black uppercase tracking-wider shadow">
                              Venda Geral
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Conteúdo do Card */}
                      <div className="p-3 sm:p-5 flex-1 flex flex-col justify-between space-y-3">
                        <div>
                          <h3 className="text-xs sm:text-base font-black font-titulo text-white group-hover:text-[#ff007a] transition-colors line-clamp-2 leading-snug">
                            {evento.titulo}
                          </h3>

                          <div className="mt-2 space-y-1 text-[10px] sm:text-xs text-slate-400">
                            {evento.local && (
                              <p className="flex items-center gap-1.5 truncate">
                                <MapPin size={12} className="text-[#ff007a] shrink-0" />
                                <span className="truncate">{evento.local}{evento.cidade ? `, ${evento.cidade}` : ''}</span>
                              </p>
                            )}
                            <p className="flex items-center gap-1.5 truncate">
                              <Calendar size={12} className="text-[#00e5ff] shrink-0" />
                              <span className="truncate">{formatarData(evento.data_evento)}</span>
                            </p>
                          </div>
                        </div>

                        {/* Preço e Ação */}
                        <div className="pt-2.5 border-t border-white/10 flex items-center justify-between gap-1">
                          {esgotado ? (
                            <span className="font-black text-red-500 text-xs sm:text-sm">Esgotado</span>
                          ) : precoMinimo !== null ? (
                            <div>
                              <span className="text-[9px] text-slate-400 block font-normal">A partir de</span>
                              <span className="font-black text-white text-xs sm:text-sm font-titulo">
                                {formatarMoeda(precoMinimo)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[11px] font-bold text-slate-400">Ingressos em breve</span>
                          )}

                          <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-[#00e5ff] group-hover:text-white flex items-center gap-0.5 transition-colors">
                            <span>Ver</span>
                            <ChevronRight size={13} />
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="py-16 text-center rounded-3xl bg-[#0e1626] border border-white/10 p-8 space-y-4 max-w-md mx-auto">
                <div className="w-16 h-16 rounded-2xl bg-white/5 mx-auto flex items-center justify-center text-slate-400">
                  <Calendar size={28} />
                </div>
                <h3 className="text-lg font-bold text-white font-titulo">Nenhum evento encontrado</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {buscaEvento
                    ? 'Não encontramos eventos para a busca informada nesta atlética.'
                    : 'Esta atlética não possui eventos ativos disponíveis no momento.'}
                </p>
                {buscaEvento && (
                  <button
                    type="button"
                    onClick={() => setBuscaEvento('')}
                    className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
                  >
                    Limpar Busca
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* CONTEÚDO DA ABA 2: PRODUTOS */}
        {abaAtiva === 'produtos' && (
          <div className="space-y-6 pt-2">
            {/* Título da Seção */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-xl sm:text-2xl font-black font-titulo text-white flex items-center gap-2">
                  <ShoppingCart className="text-[#00e5ff]" size={22} />
                  Produtos da Loja
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Itens e produtos oficiais com entrega e garantia da atlética
                </p>
              </div>
              <span className="text-xs text-slate-400">
                Mostrando <strong>{produtosFiltrados.length}</strong> de {produtos.length} {produtos.length === 1 ? 'item' : 'itens'}
              </span>
            </div>

            {/* Barra Limpa de Busca + Botão de Filtros */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                {/* Input de Busca */}
                <div className="relative flex-1">
                  <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder={`Buscar nos produtos de ${atletica.nome}...`}
                    value={buscaProduto}
                    onChange={(e) => setBuscaProduto(e.target.value)}
                    className="w-full bg-[#0e1626] border border-white/10 rounded-2xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-400 outline-none focus:border-[#00e5ff] transition-all shadow-sm"
                  />
                  {buscaProduto && (
                    <button
                      type="button"
                      onClick={() => setBuscaProduto('')}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 rounded-full hover:bg-white/10 transition-all cursor-pointer"
                      title="Limpar busca"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                {/* Botão de Filtros */}
                <button
                  type="button"
                  onClick={() => setDrawerFiltrosAberto(true)}
                  className={`flex items-center gap-2.5 px-4 sm:px-5 py-3 rounded-2xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all duration-200 cursor-pointer shrink-0 border ${
                    totalFiltrosAtivos > 0
                      ? 'bg-gradient-to-r from-[#00e5ff] to-[#026cdf] text-slate-950 border-transparent shadow-lg shadow-[#00e5ff]/20'
                      : 'bg-[#0e1626] text-white border-white/10 hover:border-white/30 hover:bg-[#162036]'
                  }`}
                >
                  <SlidersHorizontal size={18} className={totalFiltrosAtivos > 0 ? 'text-slate-950' : 'text-[#00e5ff]'} />
                  <span>Filtros</span>
                  {totalFiltrosAtivos > 0 && (
                    <span className="w-5 h-5 rounded-full bg-slate-950 text-[#00e5ff] text-[11px] font-black flex items-center justify-center">
                      {totalFiltrosAtivos}
                    </span>
                  )}
                </button>
              </div>

              {/* Tags de Filtros Ativos (quando selecionados) */}
              {totalFiltrosAtivos > 0 && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Filtros aplicados:
                  </span>

                  {categoriaAtiva !== 'todas' && categoriaObjeto && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-[#00e5ff]/10 text-[#00e5ff] border border-[#00e5ff]/30">
                      <span>Categoria: {categoriaObjeto.rotulo}</span>
                      <button
                        type="button"
                        onClick={() => setCategoriaAtiva('todas')}
                        className="hover:text-white cursor-pointer"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  )}

                  {ordenacao !== 'novos' && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-500/10 text-purple-300 border border-purple-500/30">
                      <span>Ordem: {ordenacao === 'menor_preco' ? 'Menor Preço' : 'Maior Preço'}</span>
                      <button
                        type="button"
                        onClick={() => setOrdenacao('novos')}
                        className="hover:text-white cursor-pointer"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={limparTodosFiltrosProdutos}
                    className="text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:text-white underline cursor-pointer ml-1"
                  >
                    Limpar todos
                  </button>
                </div>
              )}
            </div>

            {/* Grid de Produtos (2 Colunas no Mobile) */}
            {produtosFiltrados.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
                {produtosFiltrados.map((produto) => (
                  <CardProduto key={produto.id} produto={produto} />
                ))}
              </div>
            ) : (
              <div className="py-16 text-center rounded-3xl bg-[#0e1626] border border-white/10 p-8 space-y-4 max-w-md mx-auto">
                <div className="w-16 h-16 rounded-2xl bg-white/5 mx-auto flex items-center justify-center text-slate-400">
                  <ShoppingCart size={28} />
                </div>
                <h3 className="text-lg font-bold text-white font-titulo">Nenhum produto encontrado</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {buscaProduto || categoriaAtiva !== 'todas'
                    ? 'Não encontramos produtos para os filtros selecionados nesta atlética.'
                    : 'Esta atlética ainda não possui produtos disponíveis na loja oficial.'}
                </p>
                {(buscaProduto || totalFiltrosAtivos > 0) && (
                  <button
                    type="button"
                    onClick={limparTodosFiltrosProdutos}
                    className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
                  >
                    Limpar Filtros
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Drawer Lateral de Filtros de Produtos (Aba Lateral) */}
      {drawerFiltrosAberto && (
        <div className="fixed inset-0 z-50 flex justify-end animate-in fade-in duration-200">
          {/* Backdrop Blur */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setDrawerFiltrosAberto(false)}
          />

          {/* Painel Lateral Sheet */}
          <aside className="relative z-10 w-full max-w-md bg-[#0b101d] border-l border-white/10 flex flex-col h-full shadow-2xl animate-in slide-in-from-right duration-300">
            {/* Header do Drawer */}
            <div className="p-5 sm:p-6 border-b border-white/10 flex items-center justify-between bg-[#0e1626]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#00e5ff]/10 text-[#00e5ff] border border-[#00e5ff]/20 flex items-center justify-center">
                  <SlidersHorizontal size={18} />
                </div>
                <div>
                  <h3 className="text-base font-black font-titulo text-white">Filtros da Loja</h3>
                  <p className="text-[11px] text-slate-400">Filtrar produtos de {atletica.nome}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDrawerFiltrosAberto(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
                aria-label="Fechar filtros"
              >
                <X size={20} />
              </button>
            </div>

            {/* Conteúdo com Scroll */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
              {/* 1. Filtro por Categoria */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black uppercase tracking-wider text-white">
                    Categoria
                  </label>
                  {categoriaAtiva !== 'todas' && (
                    <button
                      type="button"
                      onClick={() => setCategoriaAtiva('todas')}
                      className="text-[11px] text-[#00e5ff] hover:underline font-bold cursor-pointer"
                    >
                      Resetar
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {CATEGORIAS.map((cat) => {
                    const ativo = categoriaAtiva === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setCategoriaAtiva(cat.id)}
                        className={`px-3 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer text-left flex items-center justify-between border ${
                          ativo
                            ? 'bg-[#00e5ff] text-slate-950 border-[#00e5ff] shadow-md shadow-[#00e5ff]/20 font-black'
                            : 'bg-[#0e1626] text-slate-300 border-white/10 hover:border-white/25 hover:bg-[#162036]'
                        }`}
                      >
                        <span className="truncate">{cat.rotulo}</span>
                        {ativo && <Check size={14} className="shrink-0 ml-1 text-slate-950 font-black" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Ordenação */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black uppercase tracking-wider text-white">
                    Ordenar Produtos Por
                  </label>
                </div>

                <div className="space-y-2">
                  {[
                    { id: 'novos', rotulo: 'Mais Recentes (Lançamentos)' },
                    { id: 'menor_preco', rotulo: 'Menor Preço' },
                    { id: 'maior_preco', rotulo: 'Maior Preço' },
                  ].map((ord) => {
                    const ativo = ordenacao === ord.id;
                    return (
                      <button
                        key={ord.id}
                        type="button"
                        onClick={() => setOrdenacao(ord.id as any)}
                        className={`w-full px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer flex items-center justify-between border ${
                          ativo
                            ? 'bg-[#162036] text-[#00e5ff] border-[#00e5ff]/50 shadow-md font-black'
                            : 'bg-[#0e1626] text-slate-300 border-white/10 hover:border-white/20'
                        }`}
                      >
                        <span>{ord.rotulo}</span>
                        {ativo && <Check size={16} className="text-[#00e5ff]" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer com Ações */}
            <div className="p-5 sm:p-6 border-t border-white/10 bg-[#0e1626] space-y-3">
              <Botao
                larguraTotal
                variante="festiva"
                tamanho="lg"
                onClick={() => setDrawerFiltrosAberto(false)}
                className="font-black"
              >
                Ver {produtosFiltrados.length} {produtosFiltrados.length === 1 ? 'Produto' : 'Produtos'}
              </Botao>

              {totalFiltrosAtivos > 0 && (
                <button
                  type="button"
                  onClick={limparTodosFiltrosProdutos}
                  className="w-full py-2 text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-white transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw size={13} />
                  <span>Limpar Todos os Filtros</span>
                </button>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

export default function PaginaPerfilAtletica({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);

  return (
    <Suspense
      fallback={
        <div className="py-24 flex flex-col items-center justify-center gap-3">
          <Carregando tamanho="lg" texto="Carregando atlética..." />
        </div>
      }
    >
      <ConteudoPerfilAtletica identificador={resolvedParams.id} />
    </Suspense>
  );
}
