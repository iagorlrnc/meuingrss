'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { criarClienteNavegador } from '@/lib/supabase/cliente';
import CardProduto from '@/componentes/loja/CardProduto';
import Carregando from '@/componentes/ui/Carregando';
import BarraNavegacaoMobile from '@/componentes/layout/BarraNavegacaoMobile';
import Botao from '@/componentes/ui/Botao';
import type { ProdutoLoja, Atletica } from '@/tipos';
import {
  ShoppingCart,
  Search,
  SlidersHorizontal,
  X,
  RotateCcw,
  Check,
  Trophy,
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

        // 2. Busca lista de atléticas
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
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-black font-titulo mb-2">
            Loja <span className="gradiente-texto">Oficial</span>
          </h1>
          <p className="text-texto-secundario">
            Garanta canecas, copos, tirantes, camisas, shorts e acessórios exclusivos da sua atlética.
          </p>
        </div>

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
              {busca || totalFiltrosAtivos > 0
                ? 'Tente remover alguns filtros ou buscar por outro termo.'
                : 'Ainda não há produtos cadastrados na loja oficial.'}
            </p>
            {(busca || totalFiltrosAtivos > 0) && (
              <button
                type="button"
                onClick={limparTodosFiltros}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
              >
                Limpar Filtros
              </button>
            )}
          </div>
        )}
      </div>

      {/* Drawer Lateral de Filtros (Sheet) */}
      {drawerFiltrosAberto && (
        <div className="fixed inset-0 z-50 flex justify-end animate-in fade-in duration-200">
          {/* Backdrop Blur */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setDrawerFiltrosAberto(false)}
          />

          {/* Painel Lateral */}
          <aside className="relative z-10 w-full max-w-md bg-[#0b101d] border-l border-white/10 flex flex-col h-full shadow-2xl animate-in slide-in-from-right duration-300">
            {/* Header do Drawer */}
            <div className="p-5 sm:p-6 border-b border-white/10 flex items-center justify-between bg-[#0e1626]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#00e5ff]/10 text-[#00e5ff] border border-[#00e5ff]/20 flex items-center justify-center">
                  <SlidersHorizontal size={18} />
                </div>
                <div>
                  <h3 className="text-base font-black font-titulo text-white">Filtros da Loja</h3>
                  <p className="text-[11px] text-slate-400">Refine os produtos exibidos</p>
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

              {/* 2. Filtro por Atlética */}
              {atleticas.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black uppercase tracking-wider text-white">
                      Atlética
                    </label>
                    {atleticaSelecionada && (
                      <button
                        type="button"
                        onClick={() => setAtleticaSelecionada('')}
                        className="text-[11px] text-[#00e5ff] hover:underline font-bold cursor-pointer"
                      >
                        Limpar
                      </button>
                    )}
                  </div>

                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    <button
                      type="button"
                      onClick={() => setAtleticaSelecionada('')}
                      className={`w-full px-3 py-2 rounded-xl text-xs font-bold transition-all text-left flex items-center justify-between cursor-pointer border ${
                        !atleticaSelecionada
                          ? 'bg-[#00e5ff]/10 text-[#00e5ff] border-[#00e5ff]/40 font-black'
                          : 'bg-[#0e1626] text-slate-400 border-white/5 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <span>Todas as Atléticas</span>
                      {!atleticaSelecionada && <Check size={14} />}
                    </button>

                    {atleticas.map((atl) => {
                      const ativo = atleticaSelecionada === atl.id;
                      return (
                        <button
                          key={atl.id}
                          type="button"
                          onClick={() => setAtleticaSelecionada(atl.id)}
                          className={`w-full px-3 py-2 rounded-xl text-xs font-bold transition-all text-left flex items-center justify-between cursor-pointer border ${
                            ativo
                              ? 'bg-[#00e5ff]/15 text-[#00e5ff] border-[#00e5ff]/50 font-black'
                              : 'bg-[#0e1626] text-slate-300 border-white/5 hover:text-white hover:bg-white/5'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <div className="w-5 h-5 rounded-md bg-white/10 overflow-hidden shrink-0 flex items-center justify-center text-[10px] font-black">
                              {atl.logo_url ? (
                                <img src={atl.logo_url} alt={atl.nome} className="w-full h-full object-cover" />
                              ) : (
                                atl.nome[0]
                              )}
                            </div>
                            <span className="truncate">{atl.nome}</span>
                          </div>
                          {ativo && <Check size={14} className="shrink-0 ml-1" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 3. Ordenação */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black uppercase tracking-wider text-white">
                    Ordenar Por
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
    <Suspense
      fallback={
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <Carregando tamanho="lg" texto="Carregando loja..." />
        </div>
      }
    >
      <ConteudoLoja />
    </Suspense>
  );
}
