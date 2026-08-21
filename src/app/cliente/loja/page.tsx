'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { criarClienteNavegador } from '@/lib/supabase/cliente';
import CardProduto from '@/componentes/loja/CardProduto';
import Carregando from '@/componentes/ui/Carregando';
import type { ProdutoLoja, Atletica, CategoriaProdutoLoja } from '@/tipos';
import BarraNavegacaoMobile from '@/componentes/layout/BarraNavegacaoMobile';
import Botao from '@/componentes/ui/Botao';
import {
  ShoppingCart,
  Search,
  SlidersHorizontal,
  X,
  Trophy,
  Sparkles,
  Layers,
  ArrowUpDown,
  Check,
  RotateCcw,
} from 'lucide-react';

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

function ConteudoLoja() {
  const searchParams = useSearchParams();
  const [produtos, setProdutos] = useState<ProdutoLoja[]>([]);
  const [atleticas, setAtleticas] = useState<Atletica[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [abaVisualizacao, setAbaVisualizacao] = useState<'produtos' | 'atleticas'>(
    searchParams.get('aba') === 'produtos' ? 'produtos' : 'atleticas'
  );
  const [busca, setBusca] = useState(searchParams.get('busca') || '');
  const [categoriaAtiva, setCategoriaAtiva] = useState(searchParams.get('categoria') || 'todas');
  const [atleticaSelecionada, setAtleticaSelecionada] = useState(searchParams.get('atletica') || '');
  const [ordenacao, setOrdenacao] = useState<'novos' | 'menor_preco' | 'maior_preco'>('novos');
  const [drawerFiltrosAberto, setDrawerFiltrosAberto] = useState(false);

  const supabase = criarClienteNavegador();

  useEffect(() => {
    async function carregarDados() {
      setCarregando(true);
      try {
        // 1. Busca produtos ativos com dados da atlética
        const { data: prods, error: errProds } = await supabase
          .from('store_products')
          .select(`
            *,
            atletica:atleticas(id, nome, logo_url, cor_primaria, cor_secundaria, faculdade, cidade)
          `)
          .eq('is_active', true)
          .order('created_at', { ascending: false });

        if (!errProds && prods) {
          setProdutos(prods as ProdutoLoja[]);
        }

        // 2. Busca lista de atléticas que têm produtos
        const { data: atls } = await supabase
          .from('atleticas')
          .select('id, nome, faculdade, cidade, logo_url, capa_url, cor_primaria, cor_secundaria')
          .eq('status', 'ativa')
          .order('nome', { ascending: true });

        if (atls) {
          setAtleticas(atls as Atletica[]);
        }
      } catch (err) {
        console.error('Erro ao carregar loja:', err);
      } finally {
        setCarregando(false);
      }
    }

    carregarDados();
  }, [supabase]);

  // Lista de atléticas que têm produtos cadastrados
  const atleticasComProdutos = atleticas
    .map((atl) => ({
      ...atl,
      totalProdutos: produtos.filter((p) => p.atletica_id === atl.id).length,
    }))
    .filter((atl) => atl.totalProdutos > 0)
    .filter((atl) => {
      if (!busca.trim()) return true;
      const termo = busca.toLowerCase().trim();
      return (
        atl.nome.toLowerCase().includes(termo) ||
        atl.faculdade?.toLowerCase().includes(termo) ||
        atl.cidade?.toLowerCase().includes(termo)
      );
    });

  // Contagem de filtros ativos (exceto busca direta)
  const totalFiltrosAtivos =
    (categoriaAtiva !== 'todas' ? 1 : 0) +
    (atleticaSelecionada ? 1 : 0) +
    (ordenacao !== 'novos' ? 1 : 0);

  function limparTodosFiltros() {
    setBusca('');
    setCategoriaAtiva('todas');
    setAtleticaSelecionada('');
    setOrdenacao('novos');
  }

  // Filtragem e Ordenação dos Produtos
  const produtosFiltrados = produtos
    .filter((p) => {
      // Filtro de busca
      if (busca.trim()) {
        const termo = busca.toLowerCase().trim();
        const nomeMatch = p.name.toLowerCase().includes(termo);
        const descMatch = p.description?.toLowerCase().includes(termo) ?? false;
        const atlMatch = p.atletica?.nome.toLowerCase().includes(termo) ?? false;
        if (!nomeMatch && !descMatch && !atlMatch) return false;
      }

      // Filtro de categoria
      if (categoriaAtiva !== 'todas') {
        if (p.category !== categoriaAtiva) return false;
      }

      // Filtro de atlética
      if (atleticaSelecionada) {
        if (p.atletica_id !== atleticaSelecionada) return false;
      }

      return true;
    })
    .sort((a, b) => {
      if (ordenacao === 'menor_preco') return a.price - b.price;
      if (ordenacao === 'maior_preco') return b.price - a.price;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const atleticaObjeto = atleticas.find((a) => a.id === atleticaSelecionada);
  const categoriaObjeto = CATEGORIAS.find((c) => c.id === categoriaAtiva);

  return (
    <>
      <BarraNavegacaoMobile />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 pb-12">
        <h1 className="text-2xl sm:text-3xl font-black font-titulo mb-2">
          Loja <span className="gradiente-texto">Oficial</span>
        </h1>
        <p className="text-texto-secundario mb-6">
          Garanta canecas, copos, tirantes, camisas, shorts e acessórios exclusivos da sua atlética.
        </p>

        {/* Alternador de Abas: Atléticas (Primeiro) vs Todos os Produtos */}
        <div className="flex items-center p-1.5 rounded-2xl bg-[#0e1626] border border-white/10 max-w-md mb-8">
          <button
            type="button"
            onClick={() => {
              setAbaVisualizacao('atleticas');
              setAtleticaSelecionada('');
            }}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 ${
              abaVisualizacao === 'atleticas' || atleticaSelecionada
                ? 'bg-gradient-to-r from-[#ff007a] to-[#8b5cf6] text-white shadow-md font-black'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Trophy size={15} />
            <span>Atléticas</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setAbaVisualizacao('produtos');
              setAtleticaSelecionada('');
            }}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 ${
              abaVisualizacao === 'produtos' && !atleticaSelecionada
                ? 'bg-gradient-to-r from-[#00e5ff] to-[#026cdf] text-slate-950 shadow-md font-black'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <ShoppingCart size={15} />
            <span>Todos os Produtos</span>
          </button>
        </div>

        {/* VISUALIZAÇÃO 1: Listagem de Atléticas com Produtos (quando na aba Atléticas e nenhuma selecionada) */}
        {abaVisualizacao === 'atleticas' && !atleticaSelecionada ? (
          <div className="space-y-6">
            {/* Barra de Busca de Atléticas */}
            <div className="relative max-w-lg">
              <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar atlética por nome, faculdade ou cidade..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full bg-[#0e1626] border border-white/10 rounded-2xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-400 outline-none focus:border-[#00e5ff] transition-all shadow-sm"
              />
              {busca && (
                <button
                  type="button"
                  onClick={() => setBusca('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 rounded-full hover:bg-white/10 transition-all cursor-pointer"
                  title="Limpar busca"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {carregando ? (
              <div className="py-20 flex flex-col items-center justify-center gap-3">
                <Carregando tamanho="lg" texto="Carregando atléticas..." />
              </div>
            ) : atleticasComProdutos.length > 0 ? (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
                {atleticasComProdutos.map((atl) => {
                  const corPrimaria = atl.cor_primaria || '#ff007a';
                  const corSecundaria = atl.cor_secundaria || '#026cdf';
                  const inicial = atl.nome ? atl.nome[0] : 'A';

                  return (
                    <div
                      key={atl.id}
                      onClick={() => setAtleticaSelecionada(atl.id)}
                      className="group flex flex-col bg-[#0f172a] border border-white/10 rounded-xl sm:rounded-2xl overflow-hidden hover:border-[#00e5ff]/50 transition-all duration-300 shadow-lg hover:shadow-2xl hover:-translate-y-1 cursor-pointer"
                    >
                      {/* Banner de Capa */}
                      <div
                        className="h-20 sm:h-28 w-full relative p-3 sm:p-4 flex items-end justify-between transition-all"
                        style={{
                          background: atl.capa_url
                            ? `linear-gradient(to bottom, rgba(0,0,0,0.2), rgba(15,23,42,0.85)), url('${atl.capa_url}') center/cover no-repeat`
                            : `linear-gradient(135deg, ${corPrimaria}, ${corSecundaria})`,
                        }}
                      />

                      {/* Conteúdo do Card */}
                      <div className="p-3 sm:p-5 pt-0 relative flex-1 flex flex-col justify-between space-y-3">
                        {/* Logo Emblem Avatar */}
                        <div className="-mt-6 sm:-mt-8 mb-1 flex items-end justify-between gap-1">
                          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-lg sm:rounded-xl bg-[#0f172a] p-1 border-2 border-white/20 shadow-xl overflow-hidden shrink-0">
                            {atl.logo_url ? (
                              <img
                                src={atl.logo_url}
                                alt={atl.nome}
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

                          <span className="px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md text-[9px] sm:text-[10px] font-black uppercase tracking-wider bg-[#00e5ff]/10 text-[#00e5ff] border border-[#00e5ff]/30 shadow-sm">
                            {atl.totalProdutos} {atl.totalProdutos === 1 ? 'Produto' : 'Produtos'}
                          </span>
                        </div>

                        {/* Dados da Atlética */}
                        <div className="space-y-1">
                          <h3 className="text-xs sm:text-base font-black font-titulo text-white group-hover:text-[#00e5ff] transition-colors line-clamp-1">
                            {atl.nome}
                          </h3>

                          {(atl.faculdade || atl.cidade) && (
                            <p className="text-[10px] sm:text-xs text-slate-400 truncate">
                              {atl.faculdade ? atl.faculdade : ''}
                              {atl.faculdade && atl.cidade ? ' • ' : ''}
                              {atl.cidade ? atl.cidade : ''}
                            </p>
                          )}
                        </div>

                        {/* Botão Ver Produtos */}
                        <div className="pt-2 border-t border-white/10">
                          <button
                            type="button"
                            className="w-full py-1.5 rounded-lg sm:rounded-xl bg-[#162036] group-hover:bg-[#00e5ff] text-white group-hover:text-slate-950 text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-md"
                          >
                            <ShoppingCart size={13} />
                            <span>Ver Produtos</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-16 text-center rounded-3xl bg-[#0e1626] border border-white/10 p-8 space-y-4 max-w-md mx-auto">
                <div className="w-16 h-16 rounded-2xl bg-white/5 mx-auto flex items-center justify-center text-slate-400">
                  <Trophy size={28} />
                </div>
                <h3 className="text-lg font-bold text-white font-titulo">Nenhuma atlética encontrada</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {busca
                    ? `Não encontramos atléticas que coincidam com a busca "${busca}".`
                    : 'Nenhuma atlética cadastrou produtos na loja oficial até o momento.'}
                </p>
                {busca && (
                  <button
                    type="button"
                    onClick={() => setBusca('')}
                    className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
                  >
                    Limpar Busca
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          /* VISUALIZAÇÃO 2: Catálogo de Produtos (Todos ou de uma Atlética Selecionada) */
          <>
            {/* Banner de Atlética Selecionada com Botão Voltar */}
            {atleticaSelecionada && atleticaObjeto && (
              <div className="mb-6 p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-[#0e1626] via-[#162036] to-[#0e1626] border border-[#00e5ff]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-[#0f172a] p-1 border border-white/20 overflow-hidden shrink-0 shadow-md">
                    {atleticaObjeto.logo_url ? (
                      <img src={atleticaObjeto.logo_url} alt={atleticaObjeto.nome} className="w-full h-full object-cover rounded-lg" />
                    ) : (
                      <div
                        className="w-full h-full rounded-lg flex items-center justify-center font-black text-sm text-white"
                        style={{ backgroundColor: atleticaObjeto.cor_primaria || '#ff007a' }}
                      >
                        {atleticaObjeto.nome[0]}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-[#00e5ff]">Loja da Atlética</span>
                    </div>
                    <h2 className="text-base sm:text-lg font-black font-titulo text-white truncate">
                      {atleticaObjeto.nome}
                    </h2>
                    {(atleticaObjeto.faculdade || atleticaObjeto.cidade) && (
                      <p className="text-[11px] text-slate-400 truncate">
                        {atleticaObjeto.faculdade}{atleticaObjeto.faculdade && atleticaObjeto.cidade ? ' • ' : ''}{atleticaObjeto.cidade}
                      </p>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setAtleticaSelecionada('')}
                  className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0 self-start sm:self-auto"
                >
                  <X size={14} />
                  <span>Ver Todas as Atléticas</span>
                </button>
              </div>
            )}

            {/* Barra Limpa de Busca + Botão de Filtros */}
            <div className="space-y-3 mb-8">
              <div className="flex items-center gap-3">
                {/* Input de Busca */}
                <div className="relative flex-1">
                  <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar produtos por nome ou descrição..."
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    className="w-full bg-[#0e1626] border border-white/10 rounded-2xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-400 outline-none focus:border-[#00e5ff] transition-all shadow-sm"
                  />
                  {busca && (
                    <button
                      type="button"
                      onClick={() => setBusca('')}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 rounded-full hover:bg-white/10 transition-all cursor-pointer"
                      title="Limpar busca"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                {/* Botão Único de Filtros */}
                <button
                  type="button"
                  onClick={() => setDrawerFiltrosAberto(true)}
                  className={`flex items-center gap-2.5 px-4 sm:px-5 py-3 rounded-2xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all duration-200 cursor-pointer shrink-0 border ${
                    totalFiltrosAtivos > 0
                      ? 'bg-gradient-to-r from-[#00e5ff] to-[#026cdf] text-slate-950 border-transparent shadow-lg shadow-[#00e5ff]/20'
                      : 'bg-[#0e1626] text-white border-white/10 hover:border-white/30 hover:bg-[#162036]'
                  }`}
                >
                  <SlidersHorizontal size={18} className={totalFiltrosAtivos > 0 ? "text-slate-950" : "text-[#00e5ff]"} />
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

                  {atleticaSelecionada && atleticaObjeto && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-[#ff007a]/10 text-[#ff007a] border border-[#ff007a]/30">
                      <span>Atlética: {atleticaObjeto.nome}</span>
                      <button
                        type="button"
                        onClick={() => setAtleticaSelecionada('')}
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
                    onClick={limparTodosFiltros}
                    className="text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:text-white underline cursor-pointer ml-1"
                  >
                    Limpar todos
                  </button>
                </div>
              )}
            </div>

            {/* Grid de Produtos (Sempre 2 Colunas no Celular) */}
            {carregando ? (
              <div className="py-20 flex flex-col items-center justify-center gap-3">
                <Carregando tamanho="lg" texto="Carregando produtos da loja..." />
              </div>
            ) : produtosFiltrados.length > 0 ? (
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
                  Não encontramos produtos para os filtros selecionados. Tente ajustar os filtros ou buscar por outros termos.
                </p>
                <button
                  type="button"
                  onClick={limparTodosFiltros}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
                >
                  Limpar Filtros
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Drawer Lateral de Filtros (Aba Lateral) */}
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
                  <p className="text-[11px] text-slate-400">Personalize a exibição dos produtos</p>
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
                      className="text-[11px] text-[#00e5ff] hover:underline font-bold"
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

              {/* 2. Filtro por Atlética */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black uppercase tracking-wider text-white">
                    Atlética
                  </label>
                  {atleticaSelecionada && (
                    <button
                      type="button"
                      onClick={() => setAtleticaSelecionada('')}
                      className="text-[11px] text-[#00e5ff] hover:underline font-bold"
                    >
                      Resetar
                    </button>
                  )}
                </div>

                <select
                  value={atleticaSelecionada}
                  onChange={(e) => setAtleticaSelecionada(e.target.value)}
                  className="w-full bg-[#0e1626] border border-white/10 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-[#00e5ff] transition-all cursor-pointer"
                >
                  <option value="" className="bg-[#080c14] text-white">Todas as Atléticas</option>
                  {atleticas.map((atl) => (
                    <option key={atl.id} value={atl.id} className="bg-[#080c14] text-white">
                      {atl.nome}
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. Ordenação */}
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
                  onClick={limparTodosFiltros}
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

export default function PaginaLoja() {
  return (
    <Suspense fallback={<div className="py-20 text-center"><Carregando tamanho="lg" texto="Carregando loja..." /></div>}>
      <ConteudoLoja />
    </Suspense>
  );
}
