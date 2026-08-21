'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ShoppingCart, AlertTriangle, Check } from 'lucide-react';
import { formatarMoeda } from '@/lib/utilitarios';
import { usarCarrinho } from '@/contextos/ContextoCarrinho';
import { usarNotificacao } from '@/componentes/ui/Notificacao';
import type { ProdutoLoja } from '@/tipos';

interface PropsCardProduto {
  produto: ProdutoLoja;
}

export default function CardProduto({ produto }: PropsCardProduto) {
  const { itens, adicionarItem } = usarCarrinho();
  const { mostrarNotificacao } = usarNotificacao();
  const [adicionando, setAdicionando] = useState(false);
  const [adicionado, setAdicionado] = useState(false);

  const imagemPrincipal = produto.images?.[0] || '/imagens/placeholder-produto.png';
  const esgotado = produto.stock_quantity <= 0;
  const precoReais = produto.price / 100;
  const estaNoCarrinho = itens.some((it) => it.product_id === produto.id);

  async function handleAdicionar(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (esgotado || adicionando || adicionado || estaNoCarrinho) return;

    setAdicionando(true);
    const tamanhoInicial = Array.isArray(produto.sizes) && produto.sizes.length > 0 ? produto.sizes[0] : null;
    const sucesso = await adicionarItem(produto, tamanhoInicial, 1);
    setAdicionando(false);

    if (sucesso) {
      setAdicionado(true);
      mostrarNotificacao({
        tipo: 'sucesso',
        titulo: 'Adicionado ao carrinho!',
        mensagem: `${produto.name} foi adicionado ao seu carrinho.`,
      });
    } else {
      mostrarNotificacao({
        tipo: 'erro',
        titulo: 'Erro ao adicionar',
        mensagem: 'Não foi possível adicionar este produto.',
      });
    }
  }

  return (
    <div className="group relative rounded-xl sm:rounded-2xl bg-[#0e1626] border border-white/10 hover:border-white/20 transition-all duration-300 flex flex-col overflow-hidden shadow-lg hover:shadow-2xl hover:-translate-y-1">
      {/* Imagem do Produto */}
      <Link href={`/loja/produto/${produto.id}`} className="relative aspect-square w-full bg-[#162036] overflow-hidden block">
        {produto.images?.[0] ? (
          <img
            src={imagemPrincipal}
            alt={produto.name}
            className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 gap-2">
            <ShoppingCart size={32} className="stroke-[1.5]" />
            <span className="text-[10px] sm:text-xs uppercase font-bold tracking-wider">Foto do Produto</span>
          </div>
        )}

        {/* Badge da Categoria */}
        <div className="absolute top-2 left-2 sm:top-3 sm:left-3 flex flex-wrap gap-1 sm:gap-1.5 z-10">
          <span className="px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-md text-[8px] sm:text-[10px] font-black uppercase tracking-wider bg-black/60 backdrop-blur-md text-[#00e5ff] border border-[#00e5ff]/30 shadow-md">
            {produto.category}
          </span>
          {produto.atletica && (
            <span
              className="px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-md text-[8px] sm:text-[10px] font-black uppercase tracking-wider text-white shadow-md backdrop-blur-md truncate max-w-[100px] sm:max-w-none"
              style={{ backgroundColor: produto.atletica.cor_primaria || '#ff007a' }}
            >
              {produto.atletica.nome}
            </span>
          )}
        </div>

        {/* Badge de Estoque */}
        {esgotado ? (
          <div className="absolute inset-0 bg-black/75 backdrop-blur-[2px] flex items-center justify-center z-10 p-2 text-center">
            <div className="px-2.5 sm:px-4 py-1 sm:py-2 rounded-lg sm:rounded-xl bg-red-500/20 border border-red-500/50 text-red-400 text-[9px] sm:text-xs font-black uppercase tracking-wider flex items-center gap-1 sm:gap-1.5 shadow-lg">
              <AlertTriangle size={12} />
              <span>Esgotado</span>
            </div>
          </div>
        ) : produto.stock_quantity <= 5 ? (
          <span className="absolute bottom-2 left-2 sm:bottom-3 sm:left-3 px-1.5 sm:px-2 py-0.5 rounded text-[8px] sm:text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
            Restam {produto.stock_quantity}
          </span>
        ) : null}
      </Link>

      {/* Conteúdo */}
      <div className="p-2.5 sm:p-4 flex-1 flex flex-col justify-between space-y-2 sm:space-y-3">
        <div>
          <Link href={`/loja/produto/${produto.id}`}>
            <h3 className="text-xs sm:text-base font-bold text-white font-titulo hover:text-[#00e5ff] transition-colors line-clamp-1">
              {produto.name}
            </h3>
          </Link>
          {produto.description && (
            <p className="text-[10px] sm:text-xs text-slate-400 line-clamp-2 mt-0.5 sm:mt-1 leading-relaxed">
              {produto.description}
            </p>
          )}
        </div>

        {/* Preço e Ação */}
        <div className="pt-2 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
          <div>
            <span className="text-[8px] sm:text-[10px] text-slate-400 uppercase tracking-wider block font-bold">
              {precoReais === 0 ? 'Resgate' : 'Por apenas'}
            </span>
            <span className={`text-xs sm:text-lg font-black font-titulo ${precoReais === 0 ? 'text-emerald-400' : 'text-[#00e5ff]'}`}>
              {precoReais === 0 ? 'Grátis' : formatarMoeda(precoReais)}
            </span>
          </div>

          {esgotado ? (
            <button
              type="button"
              disabled
              className="w-full sm:w-auto justify-center px-2.5 sm:px-4 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider flex items-center gap-1 sm:gap-1.5 min-h-[28px] sm:min-h-[32px] bg-slate-800 text-slate-500 cursor-not-allowed border border-white/5"
            >
              <span>Esgotado</span>
            </button>
          ) : estaNoCarrinho || adicionado ? (
            <Link
              href="/loja/carrinho"
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:w-auto justify-center px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider flex items-center gap-1 sm:gap-1.5 transition-all min-h-[28px] sm:min-h-[32px] cursor-pointer bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20 active:scale-95 shrink-0"
              title="Ir para o carrinho"
            >
              <ShoppingCart size={13} className="stroke-[2.5]" />
              <span>Ver Carrinho</span>
            </Link>
          ) : (
            <button
              type="button"
              onClick={handleAdicionar}
              disabled={adicionando}
              className="w-full sm:w-auto justify-center px-2.5 sm:px-4 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider flex items-center gap-1 sm:gap-1.5 transition-all min-h-[28px] sm:min-h-[32px] cursor-pointer bg-gradient-to-r from-[#ff007a] to-[#8b5cf6] hover:brightness-110 text-white shadow-md active:scale-95 disabled:opacity-50"
            >
              {adicionando ? (
                <span className="animate-pulse">Adicionando...</span>
              ) : (
                <>
                  <ShoppingCart size={13} />
                  <span>Adicionar</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
