'use client';

import React, { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { criarClienteNavegador } from '@/lib/supabase/cliente';
import { formatarMoeda } from '@/lib/utilitarios';
import { usarCarrinho } from '@/contextos/ContextoCarrinho';
import { usarNotificacao } from '@/componentes/ui/Notificacao';
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
  Sparkles,
  AlertTriangle,
  CreditCard,
  QrCode,
  Truck,
} from 'lucide-react';

export default function PaginaDetalhesProduto({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const router = useRouter();
  const { adicionarItem } = usarCarrinho();
  const { mostrarNotificacao } = usarNotificacao();

  const [produto, setProduto] = useState<ProdutoLoja | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [imagemSelecionada, setImagemSelecionada] = useState<string>('');
  const [tamanhoSelecionado, setTamanhoSelecionado] = useState<string | null>(null);
  const [quantidade, setQuantidade] = useState<number>(1);
  const [adicionando, setAdicionando] = useState(false);

  const supabase = criarClienteNavegador();

  useEffect(() => {
    async function carregarProduto() {
      try {
        const { data, error } = await supabase
          .from('store_products')
          .select(`
            *,
            atletica:atleticas(id, nome, logo_url, cor_primaria, cor_secundaria, faculdade, cidade, instagram)
          `)
          .eq('id', resolvedParams.id)
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
  }, [resolvedParams.id, supabase]);

  if (carregando) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Carregando tamanho="lg" texto="Carregando detalhes do produto..." />
      </div>
    );
  }

  if (!produto) {
    return (
      <div className="max-w-md mx-auto py-20 px-4 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-white/5 mx-auto flex items-center justify-center text-slate-400">
          <ShoppingCart size={28} />
        </div>
        <h2 className="text-xl font-bold text-white font-titulo">Produto não encontrado</h2>
        <p className="text-xs text-slate-400">
          Este produto pode ter sido removido ou não está mais ativo na loja oficial.
        </p>
        <Link href="/loja">
          <Botao variante="primario" tamanho="md" icone={<ArrowLeft size={16} />}>
            Voltar para a Loja
          </Botao>
        </Link>
      </div>
    );
  }

  const esgotado = produto.stock_quantity <= 0;
  const precoReais = produto.price / 100;
  const subtotalReais = precoReais * quantidade;
  const temTamanhos = Array.isArray(produto.sizes) && produto.sizes.length > 0;

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
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-8">
      {/* Botão Voltar */}
      <div>
        <Link
          href="/loja"
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={16} />
          Voltar para a Loja
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
        {/* Galeria de Imagens (5 colunas) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="relative aspect-square w-full rounded-3xl bg-[#0e1626] border border-white/10 overflow-hidden shadow-2xl">
            {imagemSelecionada ? (
              <img
                src={imagemSelecionada}
                alt={produto.name}
                className="w-full h-full object-cover object-center"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 gap-2">
                <ShoppingCart size={48} />
                <span className="text-xs uppercase font-bold tracking-wider">Foto do Produto</span>
              </div>
            )}

            {esgotado && (
              <div className="absolute inset-0 bg-black/75 backdrop-blur-[2px] flex items-center justify-center">
                <div className="px-5 py-2.5 rounded-2xl bg-red-500/20 border border-red-500/50 text-red-400 text-sm font-black uppercase tracking-wider flex items-center gap-2 shadow-xl">
                  <AlertTriangle size={18} />
                  <span>Esgotado</span>
                </div>
              </div>
            )}
          </div>

          {/* Miniaturas */}
          {produto.images && produto.images.length > 1 && (
            <div className="flex items-center gap-3 overflow-x-auto pb-2">
              {produto.images.map((img, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setImagemSelecionada(img)}
                  className={`w-20 h-20 rounded-xl overflow-hidden border-2 transition-all cursor-pointer shrink-0 ${
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
        </div>

        {/* Informações e Compra (7 colunas) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Badges e Título */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-[#00e5ff]/10 text-[#00e5ff] border border-[#00e5ff]/20">
                {produto.category}
              </span>

              {produto.atletica && (
                <span
                  className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider text-white shadow-sm"
                  style={{ backgroundColor: produto.atletica.cor_primaria || '#ff007a' }}
                >
                  {produto.atletica.nome}
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black font-titulo text-white leading-tight">
              {produto.name}
            </h1>

            <div className="flex items-baseline gap-3 pt-2">
              <span className="text-3xl sm:text-4xl font-black text-[#00e5ff] font-titulo">
                {formatarMoeda(precoReais)}
              </span>
              <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">
                Em até 12x no cartão ou Pix à vista
              </span>
            </div>
          </div>

          {/* Descrição */}
          {produto.description && (
            <div className="p-4 rounded-2xl bg-[#0e1626] border border-white/10 space-y-1.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">Descrição do Produto</h4>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                {produto.description}
              </p>
            </div>
          )}

          {/* Seletor de Tamanho (quando aplicável) */}
          {temTamanhos && (
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                Selecione o Tamanho:
              </label>
              <div className="flex flex-wrap gap-2.5">
                {produto.sizes.map((tam) => (
                  <button
                    key={tam}
                    type="button"
                    onClick={() => setTamanhoSelecionado(tam)}
                    className={`min-w-[48px] h-12 px-4 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider border transition-all cursor-pointer flex items-center justify-center ${
                      tamanhoSelecionado === tam
                        ? 'bg-[#00e5ff] text-slate-950 border-[#00e5ff] shadow-lg shadow-[#00e5ff]/20 scale-105'
                        : 'bg-[#0e1626] text-white border-white/10 hover:border-white/30'
                    }`}
                  >
                    {tam}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Seletor de Quantidade e Estoque */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                Quantidade:
              </label>
              {!esgotado && (
                <span className="text-xs text-slate-400">
                  Estoque disponível: <strong className="text-white">{produto.stock_quantity} un.</strong>
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center bg-[#0e1626] border border-white/10 rounded-2xl p-1">
                <button
                  type="button"
                  onClick={() => setQuantidade((q) => Math.max(1, q - 1))}
                  disabled={quantidade <= 1 || esgotado}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  <Minus size={16} />
                </button>
                <span className="w-12 text-center text-sm font-bold text-white font-mono">
                  {quantidade}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantidade((q) => Math.min(produto.stock_quantity, q + 1))}
                  disabled={quantidade >= produto.stock_quantity || esgotado}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  <Plus size={16} />
                </button>
              </div>

              <div className="text-xs text-slate-400">
                Subtotal: <strong className="text-[#00e5ff] text-sm font-bold">{formatarMoeda(subtotalReais)}</strong>
              </div>
            </div>
          </div>

          {/* Botões de Ação */}
          <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row gap-3">
            <Botao
              larguraTotal
              tamanho="lg"
              variante="primario"
              onClick={() => handleAdicionar(false)}
              disabled={esgotado || adicionando}
              icone={<ShoppingCart size={18} />}
              className="bg-[#162036] hover:bg-[#1c2944] text-white border border-white/15"
            >
              {adicionando ? 'Adicionando...' : 'Adicionar ao Carrinho'}
            </Botao>

            <Botao
              larguraTotal
              tamanho="lg"
              variante="festiva"
              onClick={() => handleAdicionar(true)}
              disabled={esgotado || adicionando}
              className="font-black"
            >
              {esgotado ? 'Produto Esgotado' : 'Comprar Agora'}
            </Botao>
          </div>

          {/* Selos de Confiança e Segurança */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="p-3 rounded-xl bg-[#0e1626] border border-white/10 flex items-center gap-2.5 text-xs text-slate-300">
              <ShieldCheck size={18} className="text-[#00e5ff] shrink-0" />
              <span>Compra 100% Segura e Criptografada</span>
            </div>
            <div className="p-3 rounded-xl bg-[#0e1626] border border-white/10 flex items-center gap-2.5 text-xs text-slate-300">
              <QrCode size={18} className="text-[#ff007a] shrink-0" />
              <span>Confirmação Imediata via Pix</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
