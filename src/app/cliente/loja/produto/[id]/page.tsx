'use client';

import React, { useState, useEffect, use, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { criarClienteNavegador } from '@/lib/supabase/cliente';
import { formatarMoeda, gerarSlug } from '@/lib/utilitarios';
import { usarCarrinho } from '@/contextos/ContextoCarrinho';
import { usarNotificacao } from '@/componentes/ui/Notificacao';
import BarraNavegacaoMobile from '@/componentes/layout/BarraNavegacaoMobile';
import Botao from '@/componentes/ui/Botao';
import Carregando from '@/componentes/ui/Carregando';
import type { ProdutoLoja } from '@/tipos';
import {
  ShoppingCart,
  ArrowLeft,
  ShieldCheck,
  Check,
  Plus,
  Minus,
  AlertTriangle,
  CreditCard,
  QrCode,
  Truck,
  Trophy,
  ChevronRight,
  Package,
  Sparkles,
  Info,
  Clock,
} from 'lucide-react';

function ConteudoDetalhesProduto({
  produtoId,
}: {
  produtoId: string;
}) {
  const router = useRouter();
  const { itens, adicionarItem } = usarCarrinho();
  const { mostrarNotificacao } = usarNotificacao();

  const [produto, setProduto] = useState<ProdutoLoja | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [imagemSelecionada, setImagemSelecionada] = useState<string>('');
  const [tamanhoSelecionado, setTamanhoSelecionado] = useState<string | null>(null);
  const [quantidade, setQuantidade] = useState<number>(1);
  const [adicionando, setAdicionando] = useState(false);
  const [adicionadoRecente, setAdicionadoRecente] = useState(false);

  const supabase = criarClienteNavegador();

  useEffect(() => {
    async function carregarProduto() {
      try {
        const { data, error } = await supabase
          .from('store_products')
          .select(`
            *,
            atletica:atleticas(id, nome, logo_url, cor_primaria, cor_secundaria, faculdade, cidade, instagram, whatsapp)
          `)
          .eq('id', produtoId)
          .single();

        if (!error && data) {
          const prod = data as ProdutoLoja;
          setProduto(prod);
          if (prod.images && prod.images.length > 0) {
            setImagemSelecionada(prod.images[0]);
          }
          if (prod.sizes && prod.sizes.length > 0) {
            setTamanhoSelecionado(prod.sizes[0]);
          }
        }
      } catch (err) {
        console.error('Erro ao buscar produto:', err);
      } finally {
        setCarregando(false);
      }
    }

    carregarProduto();
  }, [produtoId, supabase]);

  if (carregando) {
    return (
      <>
        <BarraNavegacaoMobile />
        <div className="min-h-[60vh] flex items-center justify-center">
          <Carregando tamanho="lg" texto="Carregando detalhes do produto..." />
        </div>
      </>
    );
  }

  if (!produto) {
    return (
      <>
        <BarraNavegacaoMobile />
        <div className="max-w-md mx-auto py-20 px-4 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-white/5 mx-auto flex items-center justify-center text-slate-400">
            <ShoppingCart size={28} />
          </div>
          <h2 className="text-xl font-bold text-white font-titulo">Produto não encontrado</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Este produto pode ter sido removido ou não está mais ativo na loja oficial.
          </p>
          <Link href="/loja">
            <Botao variante="primario" tamanho="md" icone={<ArrowLeft size={16} />}>
              Voltar para a Loja Oficial
            </Botao>
          </Link>
        </div>
      </>
    );
  }

  const esgotado = produto.stock_quantity <= 0;
  const precoReais = produto.price / 100;
  const subtotalReais = precoReais * quantidade;
  const temTamanhos = Array.isArray(produto.sizes) && produto.sizes.length > 0;
  const corPrimaria = produto.atletica?.cor_primaria || '#00e5ff';
  const corSecundaria = produto.atletica?.cor_secundaria || '#026cdf';
  const estaNoCarrinho = itens.some((it) => it.product_id === produto.id);

  async function handleAdicionar(comprarAgora: boolean = false) {
    if (!produto || esgotado) return;

    if (temTamanhos && !tamanhoSelecionado) {
      mostrarNotificacao({
        tipo: 'erro',
        titulo: 'Selecione o tamanho',
        mensagem: 'Por favor, escolha um tamanho antes de prosseguir.',
      });
      return;
    }

    setAdicionando(true);
    const ok = await adicionarItem(produto, tamanhoSelecionado, quantidade);
    setAdicionando(false);

    if (ok) {
      setAdicionadoRecente(true);
      setTimeout(() => setAdicionadoRecente(false), 2500);

      mostrarNotificacao({
        tipo: 'sucesso',
        titulo: 'Produto adicionado!',
        mensagem: `${produto.name} foi adicionado ao seu carrinho.`,
      });

      if (comprarAgora) {
        router.push('/loja/checkout');
      }
    } else {
      mostrarNotificacao({
        tipo: 'erro',
        titulo: 'Erro ao adicionar',
        mensagem: 'Não foi possível adicionar este produto ao carrinho.',
      });
    }
  }

  return (
    <>
      <BarraNavegacaoMobile />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4 pb-28 lg:pb-16 space-y-6 sm:space-y-8">
        {/* Navegação / Breadcrumb */}
        <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
          <div className="flex items-center gap-1.5 overflow-x-auto truncate">
            <Link
              href="/loja"
              className="hover:text-white transition-colors flex items-center gap-1 font-bold shrink-0 uppercase tracking-wider text-[11px]"
            >
              <ArrowLeft size={14} />
              <span>Loja Oficial</span>
            </Link>

            {produto.atletica && (
              <>
                <ChevronRight size={12} className="shrink-0 text-slate-600" />
                <Link
                  href={`/atleticas/${gerarSlug(produto.atletica.nome)}?aba=produtos`}
                  className="hover:text-[#00e5ff] transition-colors truncate font-bold text-[11px] uppercase tracking-wider"
                >
                  {produto.atletica.nome}
                </Link>
              </>
            )}

            <ChevronRight size={12} className="shrink-0 text-slate-600" />
            <span className="text-slate-300 truncate font-semibold">{produto.name}</span>
          </div>
        </div>

        {/* Layout Principal em Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12 items-start">
          {/* COLUNA ESQUERDA: Galeria de Imagens (5 colunas) */}
          <div className="lg:col-span-6 space-y-4">
            {/* Foto Principal */}
            <div className="relative aspect-square w-full rounded-2xl sm:rounded-3xl bg-[#0e1626] border border-white/10 overflow-hidden shadow-2xl group">
              {imagemSelecionada ? (
                <img
                  src={imagemSelecionada}
                  alt={produto.name}
                  className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 gap-3">
                  <Package size={56} className="text-slate-600" />
                  <span className="text-xs uppercase font-bold tracking-wider text-slate-500">
                    Foto do Produto Oficial
                  </span>
                </div>
              )}

              {/* Tag de Categoria e Atlética sobre a Foto */}
              <div className="absolute top-3 left-3 flex flex-wrap gap-2 z-10">
                <span className="px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-wider bg-black/70 backdrop-blur-md text-[#00e5ff] border border-white/15 shadow-md">
                  {produto.category}
                </span>

                {produto.atletica && (
                  <span
                    className="px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-wider text-white backdrop-blur-md border border-white/15 shadow-md truncate max-w-[180px]"
                    style={{ backgroundColor: `${produto.atletica.cor_primaria || '#ff007a'}dd` }}
                  >
                    {produto.atletica.nome}
                  </span>
                )}
              </div>

              {/* Overlay de Esgotado */}
              {esgotado && (
                <div className="absolute inset-0 bg-black/80 backdrop-blur-[2px] flex items-center justify-center z-20">
                  <div className="px-6 py-3 rounded-2xl bg-red-500/20 border border-red-500/50 text-red-400 text-sm font-black uppercase tracking-wider flex items-center gap-2 shadow-2xl">
                    <AlertTriangle size={20} />
                    <span>Produto Esgotado</span>
                  </div>
                </div>
              )}
            </div>

            {/* Miniaturas das Fotos */}
            {produto.images && produto.images.length > 1 && (
              <div className="flex items-center gap-2.5 sm:gap-3 overflow-x-auto pb-2 scrollbar-thin">
                {produto.images.map((img, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setImagemSelecionada(img)}
                    className={`w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden border-2 transition-all cursor-pointer shrink-0 ${
                      imagemSelecionada === img
                        ? 'border-[#00e5ff] scale-105 shadow-lg shadow-[#00e5ff]/20'
                        : 'border-white/10 hover:border-white/30 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <img src={img} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            {/* Mini Card da Atlética Produtora */}
            {produto.atletica && (
              <Link
                href={`/atleticas/${gerarSlug(produto.atletica.nome)}?aba=produtos`}
                className="p-3.5 sm:p-4 rounded-2xl bg-[#0e1626] border border-white/10 hover:border-[#00e5ff]/40 transition-all flex items-center justify-between gap-3 group shadow-md"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-[#080c14] border border-white/15 p-0.5 overflow-hidden shrink-0 flex items-center justify-center">
                    {produto.atletica.logo_url ? (
                      <img
                        src={produto.atletica.logo_url}
                        alt={produto.atletica.nome}
                        className="w-full h-full object-cover rounded-lg"
                      />
                    ) : (
                      <span className="font-black text-sm text-white">
                        {produto.atletica.nome[0]}
                      </span>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-black uppercase tracking-wider text-[#00e5ff]">
                        Atlética Oficial
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-white group-hover:text-[#00e5ff] transition-colors truncate">
                      {produto.atletica.nome}
                    </h4>
                    {produto.atletica.faculdade && (
                      <p className="text-[11px] text-slate-400 truncate">
                        {produto.atletica.faculdade}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 text-xs font-bold text-slate-400 group-hover:text-white shrink-0">
                  <span className="hidden sm:inline">Ver Loja</span>
                  <ChevronRight size={15} className="text-[#00e5ff]" />
                </div>
              </Link>
            )}
          </div>

          {/* COLUNA DIREITA: Informações, Preço e Seleção de Compra (6 colunas) */}
          <div className="lg:col-span-6 space-y-6">
            {/* Título & Preço */}
            <div className="space-y-3 pb-4 border-b border-white/10">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-black font-titulo text-white leading-tight">
                {produto.name}
              </h1>

              {/* Preço em Destaque */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-[#0e1626] to-[#162036] border border-white/10 space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="flex items-baseline gap-2">
                    <span className={`text-2xl sm:text-4xl font-black font-titulo ${precoReais === 0 ? 'text-emerald-400' : 'text-[#00e5ff]'}`}>
                      {precoReais === 0 ? 'Gratuito' : formatarMoeda(precoReais)}
                    </span>
                    <span className="text-xs text-emerald-400 font-bold uppercase tracking-wider bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                      {precoReais === 0 ? ' ' : 'À vista no Pix'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 pt-1 border-t border-white/5">
                  {precoReais === 0 ? (
                    <span className="flex items-center gap-1 text-emerald-400 font-medium">
                      Resgate agora
                    </span>
                  ) : (
                    <>
                      <span className="flex items-center gap-1">
                        <CreditCard size={14} className="text-purple-400" />
                        ou até <strong>12x</strong> no cartão
                      </span>
                      <span className="flex items-center gap-1 text-slate-300">
                        <QrCode size={14} className="text-emerald-400" />
                        Liberação imediata
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Descrição do Produto */}
            {produto.description && (
              <div className="space-y-2">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <Info size={14} className="text-[#00e5ff]" />
                  <span>Descrição do Produto</span>
                </h3>
                <div className="p-4 rounded-2xl bg-[#0e1626] border border-white/10">
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                    {produto.description}
                  </p>
                </div>
              </div>
            )}

            {/* Seletor de Tamanho (quando aplicável) */}
            {temTamanhos && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-1.5">
                    <span>Tamanho:</span>
                    {tamanhoSelecionado && (
                      <span className="text-[#00e5ff] font-mono font-bold">({tamanhoSelecionado})</span>
                    )}
                  </label>
                  <span className="text-[11px] text-slate-400">Selecione para adicionar</span>
                </div>

                <div className="flex flex-wrap gap-2 sm:gap-2.5">
                  {produto.sizes.map((tam) => {
                    const ativo = tamanhoSelecionado === tam;
                    return (
                      <button
                        key={tam}
                        type="button"
                        onClick={() => setTamanhoSelecionado(tam)}
                        className={`min-w-[52px] h-12 px-4 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                          ativo
                            ? 'bg-[#00e5ff] text-slate-950 border-[#00e5ff] shadow-lg shadow-[#00e5ff]/20 scale-105 font-black'
                            : 'bg-[#0e1626] text-slate-200 border-white/10 hover:border-white/30 hover:bg-[#162036]'
                        }`}
                      >
                        <span>{tam}</span>
                        {ativo && <Check size={14} className="text-slate-950 font-black" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Seletor de Quantidade & Estoque */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <label className="font-black uppercase tracking-wider text-white">
                    Quantidade:
                  </label>
                  {precoReais === 0 && (
                    <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                      Limite: 1 por usuário
                    </span>
                  )}
                </div>
                {!esgotado && (
                  <span className="text-slate-400">
                    Estoque disponível: <strong className="text-white font-mono">{produto.stock_quantity} un.</strong>
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-[#0e1626] border border-white/10">
                {/* Stepper +/- */}
                <div className="flex items-center bg-[#080c14] border border-white/10 rounded-xl p-1">
                  <button
                    type="button"
                    onClick={() => setQuantidade((q) => Math.max(1, q - 1))}
                    disabled={quantidade <= 1 || esgotado || precoReais === 0}
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                    aria-label="Diminuir quantidade"
                  >
                    <Minus size={15} />
                  </button>

                  <span className="w-12 text-center text-sm font-black text-white font-mono">
                    {precoReais === 0 ? 1 : quantidade}
                  </span>

                  <button
                    type="button"
                    onClick={() => setQuantidade((q) => Math.min(produto.stock_quantity, q + 1))}
                    disabled={quantidade >= produto.stock_quantity || esgotado || precoReais === 0}
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                    aria-label="Aumentar quantidade"
                  >
                    <Plus size={15} />
                  </button>
                </div>

                {/* Subtotal */}
                <div className="text-right">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Subtotal</span>
                  <span className={`text-base sm:text-lg font-black font-titulo ${precoReais === 0 ? 'text-emerald-400' : 'text-[#00e5ff]'}`}>
                    {precoReais === 0 ? 'Gratuito' : formatarMoeda(subtotalReais)}
                  </span>
                </div>
              </div>
            </div>

            {/* Botões de Ação no Desktop */}
            <div className="pt-2 space-y-3 hidden sm:block">
              <Botao
                larguraTotal
                tamanho="lg"
                variante="festiva"
                onClick={() => handleAdicionar(true)}
                disabled={esgotado || adicionando}
                className="font-black shadow-lg shadow-[#00e5ff]/20"
              >
                {esgotado
                  ? 'Produto Esgotado'
                  : precoReais === 0
                  ? 'Resgatar Agora'
                  : 'Comprar Agora'}
              </Botao>
            </div>

            {/* Selos de Confiança e Benefícios */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
              <div className="p-3 rounded-xl bg-[#0e1626] border border-white/10 flex items-center gap-2.5 text-xs text-slate-300">
                <ShieldCheck size={18} className="text-[#00e5ff] shrink-0" />
                <span>Pagamento 100% Seguro e Criptografado</span>
              </div>

              <div className="p-3 rounded-xl bg-[#0e1626] border border-white/10 flex items-center gap-2.5 text-xs text-slate-300">
                <Trophy size={18} className="text-[#ff007a] shrink-0" />
                <span>Produto Oficial e Licenciado</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* BARRA FIXA INFERIOR NO MOBILE (Mobile Sticky CTA) */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#080c14]/95 backdrop-blur-lg border-t border-white/10 p-3 shadow-2xl">
        <div className="flex items-center gap-3">
          {/* Preço e Qtd */}
          <div className="min-w-0">
            <span className="text-[10px] text-slate-400 block truncate">
              {quantidade}x {precoReais === 0 ? 'Gratuito' : formatarMoeda(precoReais)}
            </span>
            <span className="text-base font-black text-[#00e5ff] font-titulo leading-none">
              {precoReais === 0 ? 'Gratuito' : formatarMoeda(subtotalReais)}
            </span>
          </div>

          {/* Botão Comprar Agora */}
          <button
            type="button"
            onClick={() => handleAdicionar(true)}
            disabled={esgotado || adicionando}
            className="flex-1 py-3.5 px-4 rounded-xl bg-gradient-to-r from-[#00e5ff] to-[#026cdf] text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-[#00e5ff]/20 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>{esgotado ? 'Esgotado' : precoReais === 0 ? 'Resgatar Agora' : 'Comprar Agora'}</span>
            {!esgotado && <ChevronRight size={14} />}
          </button>
        </div>
      </div>
    </>
  );
}

export default function PaginaDetalhesProduto({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);

  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] flex items-center justify-center">
          <Carregando tamanho="lg" texto="Carregando detalhes do produto..." />
        </div>
      }
    >
      <ConteudoDetalhesProduto produtoId={resolvedParams.id} />
    </Suspense>
  );
}
