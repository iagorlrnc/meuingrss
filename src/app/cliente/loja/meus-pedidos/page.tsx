'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { criarClienteNavegador } from '@/lib/supabase/cliente';
import { usarAutenticacao } from '@/contextos/ContextoAutenticacao';
import { formatarMoeda, formatarDataHora } from '@/lib/utilitarios';
import Botao from '@/componentes/ui/Botao';
import Carregando from '@/componentes/ui/Carregando';
import type { PedidoLoja } from '@/tipos';
import {
  ShoppingCart,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  ArrowLeft,
  Sparkles,
  ExternalLink,
} from 'lucide-react';

function ConteudoMeusPedidos() {
  const { usuario, carregando: carregandoAuth } = usarAutenticacao();
  const searchParams = useSearchParams();
  const [pedidos, setPedidos] = useState<PedidoLoja[]>([]);
  const [carregando, setCarregando] = useState(true);

  const orderIdDestaque = searchParams.get('order_id');
  const statusDestaque = searchParams.get('status');
  const supabase = criarClienteNavegador();

  useEffect(() => {
    async function carregarPedidos() {
      if (!usuario) {
        setCarregando(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('store_orders')
          .select(`
            *,
            atletica:atleticas(id, nome, logo_url, cor_primaria),
            items:store_order_items(*)
          `)
          .eq('user_id', usuario.id)
          .order('created_at', { ascending: false });

        if (!error && data) {
          setPedidos(data as PedidoLoja[]);
        }
      } catch (err) {
        console.error('Erro ao carregar pedidos da loja:', err);
      } finally {
        setCarregando(false);
      }
    }

    carregarPedidos();
  }, [usuario, supabase]);

  if (carregandoAuth || carregando) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Carregando tamanho="lg" texto="Carregando seus pedidos..." />
      </div>
    );
  }

  if (!usuario) {
    return (
      <div className="max-w-md mx-auto py-20 px-4 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-white/5 mx-auto flex items-center justify-center text-slate-400">
          <ShoppingCart size={28} />
        </div>
        <h2 className="text-xl font-bold text-white font-titulo">Acesso Restrito</h2>
        <p className="text-xs text-slate-400">
          Faça login para visualizar seus pedidos de produtos oficiais.
        </p>
        <Link href="/autenticacao/entrar?redirecionar=/loja/meus-pedidos">
          <Botao variante="primario" tamanho="md">
            Fazer Login
          </Botao>
        </Link>
      </div>
    );
  }

  function renderStatusBadge(status: string) {
    switch (status) {
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 size={13} />
            <span>Pago e Confirmado</span>
          </span>
        );
      case 'pending_payment':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-amber-500/10 text-amber-300 border border-amber-500/30">
            <Clock size={13} />
            <span>Aguardando Pagamento</span>
          </span>
        );
      case 'stock_unavailable':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/30">
            <AlertTriangle size={13} />
            <span>Estoque Esgotado / Estorno</span>
          </span>
        );
      case 'refunded':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-purple-500/10 text-purple-300 border border-purple-500/30">
            <Clock size={13} />
            <span>Estornado</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/30">
            <XCircle size={13} />
            <span>Cancelado / Recusado</span>
          </span>
        );
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-8">
      {/* Banner de Confirmação quando redirecionado do checkout */}
      {statusDestaque === 'aprovado' && (
        <div className="p-5 rounded-3xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-4">
          <CheckCircle2 size={28} className="text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white font-titulo">Parabéns! Seu pedido foi confirmado com sucesso.</h3>
            <p className="text-xs text-slate-300">
              O pagamento foi processado e seu pedido já está registrado junto à diretoria da atlética.
            </p>
          </div>
        </div>
      )}

      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black font-titulo text-white flex items-center gap-2.5">
            <ShoppingCart className="text-[#00e5ff]" size={28} />
            Meus Pedidos da Loja
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Acompanhe o histórico de compras de produtos oficiais das atléticas
          </p>
        </div>

        <Link href="/loja">
          <Botao variante="fantasma" tamanho="sm" icone={<Sparkles size={16} />}>
            Ir para a Loja
          </Botao>
        </Link>
      </div>

      {/* Lista de Pedidos */}
      {pedidos.length > 0 ? (
        <div className="space-y-6">
          {pedidos.map((pedido) => {
            const totalReais = pedido.total_amount / 100;
            const ehDestaque = pedido.id === orderIdDestaque;

            return (
              <div
                key={pedido.id}
                className={`p-5 sm:p-6 rounded-3xl bg-[#0e1626] border transition-all space-y-5 shadow-xl ${
                  ehDestaque ? 'border-[#00e5ff] ring-2 ring-[#00e5ff]/20' : 'border-white/10'
                }`}
              >
                {/* Header do Pedido */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/10">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-slate-400">
                        Pedido #{pedido.id.substring(0, 8).toUpperCase()}
                      </span>
                      {pedido.atletica && (
                        <span
                          className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider text-white"
                          style={{ backgroundColor: pedido.atletica.cor_primaria || '#ff007a' }}
                        >
                          {pedido.atletica.nome}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Realizado em {formatarDataHora(pedido.created_at)}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    {renderStatusBadge(pedido.status)}
                    <span className="text-lg font-black text-[#00e5ff] font-titulo">
                      {formatarMoeda(totalReais)}
                    </span>
                  </div>
                </div>

                {/* Itens do Pedido */}
                <div className="space-y-2.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Itens Comprados:</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {pedido.items?.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 rounded-xl bg-[#162036] border border-white/5 flex items-center justify-between text-xs"
                      >
                        <div className="min-w-0 pr-2">
                          <p className="font-bold text-white truncate">{item.product_name_snapshot}</p>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                            <span>Quantidade: {item.quantity}x</span>
                            {item.size && <span>• Tam: {item.size}</span>}
                          </div>
                        </div>
                        <span className="font-black text-white font-mono shrink-0">
                          {formatarMoeda(item.subtotal / 100)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer do Pedido */}
                <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-400">
                  <span>Forma de Pagamento: <strong className="text-white uppercase">{pedido.payment_method || 'Pix/Cartão'}</strong></span>
                  <span>Retirada / Entrega: <strong className="text-white">Diretamente com a Atlética</strong></span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-16 text-center rounded-3xl bg-[#0e1626] border border-white/10 p-8 space-y-4 max-w-md mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-white/5 mx-auto flex items-center justify-center text-slate-400">
            <ShoppingCart size={28} />
          </div>
          <h3 className="text-lg font-bold text-white font-titulo">Nenhum pedido encontrado</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Você ainda não realizou compras na loja de produtos oficiais das atléticas.
          </p>
          <Link href="/loja">
            <Botao variante="festiva" tamanho="md" icone={<Sparkles size={16} />}>
              Conhecer a Loja
            </Botao>
          </Link>
        </div>
      )}
    </div>
  );
}

export default function PaginaMeusPedidosLoja() {
  return (
    <Suspense fallback={<div className="py-20 text-center"><Carregando tamanho="lg" texto="Carregando pedidos..." /></div>}>
      <ConteudoMeusPedidos />
    </Suspense>
  );
}
