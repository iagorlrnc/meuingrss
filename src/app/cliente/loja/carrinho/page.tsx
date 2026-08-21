'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usarCarrinho } from '@/contextos/ContextoCarrinho';
import { formatarMoeda } from '@/lib/utilitarios';
import Botao from '@/componentes/ui/Botao';
import Carregando from '@/componentes/ui/Carregando';
import {
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

export default function PaginaCarrinho() {
  const router = useRouter();
  const {
    itens,
    totalItens,
    totalValorCentavos,
    carregando,
    atualizarQuantidade,
    removerItem,
    limparCarrinho,
  } = usarCarrinho();

  if (carregando) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Carregando tamanho="lg" texto="Carregando seu carrinho..." />
      </div>
    );
  }

  const totalReais = totalValorCentavos / 100;

  if (itens.length === 0) {
    return (
      <div className="max-w-xl mx-auto py-20 px-4 text-center space-y-6">
        <div className="w-20 h-20 rounded-3xl bg-[#0e1626] border border-white/10 mx-auto flex items-center justify-center text-slate-400 shadow-xl">
          <ShoppingCart size={36} className="text-[#00e5ff]" />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl sm:text-3xl font-black text-white font-titulo">
            Seu carrinho está vazio
          </h2>
          <p className="text-sm text-slate-400 leading-relaxed max-w-sm mx-auto">
            Você ainda não adicionou nenhum produto oficial das atléticas ao seu carrinho.
          </p>
        </div>

        <div className="pt-4">
          <Link href="/loja">
            <Botao variante="festiva" tamanho="lg">
              Explorar Loja Oficial
            </Botao>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-8">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black font-titulo text-white flex items-center gap-2.5">
            <ShoppingCart className="text-[#00e5ff]" size={28} />
            Meu Carrinho
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Você tem <strong className="text-white">{totalItens} {totalItens === 1 ? 'item' : 'itens'}</strong> no seu carrinho
          </p>
        </div>

        <button
          type="button"
          onClick={limparCarrinho}
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-red-400 hover:text-red-300 transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Trash2 size={14} />
          Esvaziar Carrinho
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Lista de Itens (8 colunas) */}
        <div className="lg:col-span-8 space-y-4">
          {itens.map((item) => {
            const precoItemReais = item.precoUnitario / 100;
            const subtotalItemReais = precoItemReais * item.quantidade;
            const maxEstoque = item.produto?.stock_quantity ?? 99;
            const foto = item.produto?.images?.[0] || '/imagens/placeholder-produto.png';

            return (
              <div
                key={item.id}
                className="p-4 sm:p-5 rounded-2xl bg-[#0e1626] border border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all shadow-md"
              >
                {/* Foto e Detalhes */}
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <div className="w-20 h-20 rounded-xl bg-[#162036] border border-white/10 overflow-hidden shrink-0">
                    <img
                      src={foto}
                      alt={item.produto?.name || 'Produto'}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="min-w-0 space-y-1">
                    <Link href={`/loja/produto/${item.product_id}`}>
                      <h3 className="text-sm sm:text-base font-bold text-white hover:text-[#00e5ff] transition-colors truncate">
                        {item.produto?.name || 'Produto'}
                      </h3>
                    </Link>

                    <div className="flex flex-wrap items-center gap-2">
                      {item.tamanho && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-white/10 text-white">
                          Tamanho: {item.tamanho}
                        </span>
                      )}
                      {item.produto?.atletica && (
                        <span className="text-[11px] text-slate-400">
                          {item.produto.atletica.nome}
                        </span>
                      )}
                    </div>

                    <p className="text-xs font-bold text-slate-400">
                      {formatarMoeda(precoItemReais)} cada
                    </p>
                  </div>
                </div>

                {/* Controles de Quantidade e Subtotal */}
                <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto pt-3 sm:pt-0 border-t sm:border-t-0 border-white/10">
                  {/* Seletor de Quantidade */}
                  <div className="flex items-center bg-[#162036] border border-white/10 rounded-xl p-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => atualizarQuantidade(item.id, item.quantidade - 1)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
                      title="Diminuir quantidade"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="w-9 text-center text-xs font-bold text-white font-mono">
                      {precoItemReais === 0 ? 1 : item.quantidade}
                    </span>
                    <button
                      type="button"
                      onClick={() => atualizarQuantidade(item.id, item.quantidade + 1)}
                      disabled={precoItemReais === 0 || item.quantidade >= maxEstoque}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                      title={precoItemReais === 0 ? 'Limite de 1 unidade por usuário' : 'Aumentar quantidade'}
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                  {/* Subtotal do Item */}
                  <div className="text-right min-w-[90px]">
                    <span className="text-xs text-slate-400 block font-bold">Subtotal</span>
                    <span className={`text-base font-black font-titulo ${precoItemReais === 0 ? 'text-emerald-400' : 'text-[#00e5ff]'}`}>
                      {precoItemReais === 0 ? 'Grátis' : formatarMoeda(subtotalItemReais)}
                    </span>
                  </div>

                  {/* Botão Remover */}
                  <button
                    type="button"
                    onClick={() => removerItem(item.id)}
                    className="p-2 text-slate-400 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-all cursor-pointer"
                    title="Remover item"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}

          <div className="pt-2">
            <Link
              href="/loja"
              className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft size={16} />
              Continuar Comprando
            </Link>
          </div>
        </div>

        {/* Resumo do Pedido (4 colunas) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="p-6 rounded-3xl bg-[#0e1626] border border-white/10 space-y-6 shadow-2xl sticky top-28">
            <h3 className="text-lg font-bold text-white font-titulo pb-3 border-b border-white/10">
              Resumo do Pedido
            </h3>

            <div className="space-y-3 text-xs sm:text-sm">
              <div className="flex justify-between text-slate-300">
                <span>Subtotal ({totalItens} {totalItens === 1 ? 'item' : 'itens'})</span>
                <span className="font-bold text-white">{formatarMoeda(totalReais)}</span>
              </div>

              <div className="flex justify-between text-slate-300">
                <span>Entrega / Retirada</span>
                <span className="text-emerald-400 font-bold">Com a Atlética</span>
              </div>

              <div className="pt-3 border-t border-white/10 flex justify-between items-baseline">
                <span className="text-base font-bold text-white">Total do Pedido</span>
                <span className="text-2xl font-black text-[#00e5ff] font-titulo">
                  {formatarMoeda(totalReais)}
                </span>
              </div>
            </div>

            <Botao
              larguraTotal
              tamanho="lg"
              variante="festiva"
              onClick={() => router.push('/loja/checkout')}
              icone={<ArrowRight size={18} />}
              className="font-black text-xs uppercase tracking-wider py-4 shadow-xl"
            >
              Ir para o pagamento
            </Botao>

            <div className="pt-2 border-t border-white/10 space-y-2 text-[11px] text-slate-400 text-center">
              <p className="flex items-center justify-center gap-1.5 text-slate-300 font-bold">
                <ShieldCheck size={14} className="text-[#00e5ff]" />
                Checkout Transparente Seguro
              </p>
              <p>Pague com Pix ou Cartão de Crédito em até 12x sem sair do site.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
