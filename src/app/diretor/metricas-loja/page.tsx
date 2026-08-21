'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { criarClienteNavegador } from '@/lib/supabase/cliente';
import { usarAutenticacao } from '@/contextos/ContextoAutenticacao';
import { usarNotificacao } from '@/componentes/ui/Notificacao';
import { formatarMoeda, formatarDataHora, formatarDataCurta } from '@/lib/utilitarios';
import Cartao from '@/componentes/ui/Cartao';
import Botao from '@/componentes/ui/Botao';
import Modal from '@/componentes/ui/Modal';
import Carregando from '@/componentes/ui/Carregando';
import type { PedidoLoja } from '@/tipos';
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  CreditCard,
  QrCode,
  Package,
  Calendar,
  Filter,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  Eye,
  BarChart3,
  Award,
  Search,
  X,
  PackageCheck,
  Check,
  Truck,
  RotateCcw,
} from 'lucide-react';

export default function PaginaMetricasLoja() {
  const { perfil } = usarAutenticacao();
  const { sucesso, erro } = usarNotificacao();
  const supabase = criarClienteNavegador();

  const [pedidos, setPedidos] = useState<PedidoLoja[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [periodoFiltro, setPeriodoFiltro] = useState<'7d' | '30d' | 'mes' | 'todos'>('30d');
  const [metodoFiltro, setMetodoFiltro] = useState<'todos' | 'pix' | 'cartao' | 'gratuito'>('todos');
  const [entregaFiltro, setEntregaFiltro] = useState<'todos' | 'pendente' | 'entregue'>('todos');
  const [buscaTexto, setBuscaTexto] = useState('');

  // ID do pedido sendo atualizado no momento
  const [atualizandoEntregaId, setAtualizandoEntregaId] = useState<string | null>(null);

  // Modal de Detalhes do Pedido
  const [pedidoSelecionado, setPedidoSelecionado] = useState<PedidoLoja | null>(null);

  useEffect(() => {
    async function carregarMetricas() {
      if (!perfil?.atletica_id && perfil?.role !== 'admin') {
        setCarregando(false);
        return;
      }

      setCarregando(true);
      try {
        let query = supabase
          .from('store_orders')
          .select(`
            *,
            user:profiles(id, nome, email, telefone, cpf),
            items:store_order_items(*)
          `)
          .order('created_at', { ascending: false });

        if (perfil?.atletica_id) {
          query = query.eq('atletica_id', perfil.atletica_id);
        }

        const { data, error: errQuery } = await query;
        if (!errQuery && data) {
          setPedidos(data as PedidoLoja[]);
        }
      } catch (err) {
        console.error('Erro ao carregar métricas da loja:', err);
      } finally {
        setCarregando(false);
      }
    }

    carregarMetricas();
  }, [perfil, supabase]);

  // Função para marcar pedido como entregue (ação permanente)
  async function marcarEntregue(orderId: string) {
    setAtualizandoEntregaId(orderId);

    try {
      const res = await fetch('/api/diretor/loja/pedidos/entregar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          entregue: true,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.sucesso) {
        erro('Erro ao confirmar entrega', data.erro || 'Não foi possível atualizar o status do pedido.');
        return;
      }

      // Atualização otimista na lista de pedidos
      setPedidos((prev) =>
        prev.map((p) => {
          if (p.id === orderId) {
            const metaAtual = (p.metadata && typeof p.metadata === 'object') ? p.metadata : {};
            return {
              ...p,
              metadata: {
                ...metaAtual,
                entregue: true,
                entregue_em: new Date().toISOString(),
                entregue_por_nome: perfil?.nome || 'Diretoria',
              },
            };
          }
          return p;
        })
      );

      // Atualiza também no modal se estiver aberto
      if (pedidoSelecionado?.id === orderId) {
        setPedidoSelecionado((prev) => {
          if (!prev) return null;
          const metaAtual = (prev.metadata && typeof prev.metadata === 'object') ? prev.metadata : {};
          return {
            ...prev,
            metadata: {
              ...metaAtual,
              entregue: true,
              entregue_em: new Date().toISOString(),
              entregue_por_nome: perfil?.nome || 'Diretoria',
            },
          };
        });
      }

      sucesso(
        'Produto Entregue!',
        `O pedido #${orderId.substring(0, 8).toUpperCase()} foi marcado como entregue com sucesso.`
      );
    } catch {
      erro('Erro de conexão', 'Falha ao conectar com o servidor. Tente novamente.');
    } finally {
      setAtualizandoEntregaId(null);
    }
  }

  // Filtragem dos pedidos com busca textual
  const agora = Date.now();
  const pedidosFiltrados = useMemo(() => {
    return pedidos.filter((ped) => {
      const dataPed = new Date(ped.created_at).getTime();

      // Filtro por Período
      if (periodoFiltro === '7d') {
        if (agora - dataPed > 7 * 24 * 60 * 60 * 1000) return false;
      } else if (periodoFiltro === '30d') {
        if (agora - dataPed > 30 * 24 * 60 * 60 * 1000) return false;
      } else if (periodoFiltro === 'mes') {
        const dataObj = new Date(ped.created_at);
        const agoraObj = new Date();
        if (dataObj.getMonth() !== agoraObj.getMonth() || dataObj.getFullYear() !== agoraObj.getFullYear()) {
          return false;
        }
      }

      // Filtro por Método
      if (metodoFiltro === 'pix') {
        if (ped.payment_method !== 'pix') return false;
      } else if (metodoFiltro === 'cartao') {
        if (ped.payment_method === 'pix' || ped.payment_method === 'gratuito') return false;
      } else if (metodoFiltro === 'gratuito') {
        if (ped.payment_method !== 'gratuito') return false;
      }

      // Filtro por Status de Entrega
      const estaEntregue = Boolean(ped.metadata?.entregue);
      if (entregaFiltro === 'entregue' && !estaEntregue) return false;
      if (entregaFiltro === 'pendente' && (estaEntregue || ped.status !== 'paid')) return false;

      // Filtro por Barra de Pesquisa
      if (buscaTexto.trim()) {
        const termo = buscaTexto.trim().toLowerCase();
        const idLimpo = ped.id.toLowerCase();
        const compradorNome = ((ped.user as any)?.nome || '').toLowerCase();
        const compradorEmail = ((ped.user as any)?.email || '').toLowerCase();
        const compradorCpf = ((ped.user as any)?.cpf || '').toLowerCase();
        const compradorTel = ((ped.user as any)?.telefone || '').toLowerCase();
        const produtosNomes = (ped.items || []).map((it) => it.product_name_snapshot.toLowerCase()).join(' ');

        const bateu =
          idLimpo.includes(termo) ||
          compradorNome.includes(termo) ||
          compradorEmail.includes(termo) ||
          compradorCpf.includes(termo) ||
          compradorTel.includes(termo) ||
          produtosNomes.includes(termo);

        if (!bateu) return false;
      }

      return true;
    });
  }, [pedidos, periodoFiltro, metodoFiltro, entregaFiltro, buscaTexto, agora]);

  // Cálculos de Resumo
  const pedidosPagos = pedidosFiltrados.filter((p) => p.status === 'paid');
  const faturamentoTotalCentavos = pedidosPagos.reduce((acc, p) => acc + p.total_amount, 0);
  const faturamentoTotalReais = faturamentoTotalCentavos / 100;
  const totalPedidosPagosCount = pedidosPagos.length;
  const ticketMedioReais = totalPedidosPagosCount > 0 ? faturamentoTotalReais / totalPedidosPagosCount : 0;

  // Total de produtos vendidos e Ranking
  const mapaProdutos: Record<string, { nome: string; quantidade: number; receita: number }> = {};
  let totalProdutosVendidosUnidades = 0;

  pedidosPagos.forEach((p) => {
    p.items?.forEach((item) => {
      totalProdutosVendidosUnidades += item.quantity;
      const key = item.product_name_snapshot || 'Produto';
      if (!mapaProdutos[key]) {
        mapaProdutos[key] = { nome: key, quantidade: 0, receita: 0 };
      }
      mapaProdutos[key].quantidade += item.quantity;
      mapaProdutos[key].receita += item.subtotal / 100;
    });
  });

  const rankingProdutos = Object.values(mapaProdutos).sort((a, b) => b.receita - a.receita);

  // Vendas por Dia nos últimos dias para o gráfico
  const mapaVendasPorDia: Record<string, { data: string; label: string; total: number; count: number }> = {};
  pedidosPagos.forEach((p) => {
    const d = new Date(p.created_at);
    const chaveDia = d.toISOString().split('T')[0];
    const label = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
    if (!mapaVendasPorDia[chaveDia]) {
      mapaVendasPorDia[chaveDia] = { data: chaveDia, label, total: 0, count: 0 };
    }
    mapaVendasPorDia[chaveDia].total += p.total_amount / 100;
    mapaVendasPorDia[chaveDia].count += 1;
  });

  const diasOrdenados = Object.values(mapaVendasPorDia).sort((a, b) => a.data.localeCompare(b.data));
  const maxVendaDia = Math.max(...diasOrdenados.map((d) => d.total), 100);

  function renderStatusBadge(status: string) {
    switch (status) {
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 size={12} />
            <span>Pago</span>
          </span>
        );
      case 'pending_payment':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-300 border border-amber-500/20">
            <Clock size={12} />
            <span>Pendente</span>
          </span>
        );
      case 'stock_unavailable':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/20">
            <AlertTriangle size={12} />
            <span>Sem Estoque</span>
          </span>
        );
      case 'refunded':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-purple-500/10 text-purple-300 border border-purple-500/20">
            <span>Estornado</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/20">
            <XCircle size={12} />
            <span>Cancelado</span>
          </span>
        );
    }
  }

  function renderEntregaBadge(metadata?: any, status?: string) {
    if (status !== 'paid') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-white/5 text-slate-400 border border-white/10">
          Aguardando Pgto
        </span>
      );
    }

    if (metadata?.entregue) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          <PackageCheck size={11} />
          <span>Entregue</span>
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-cyan-500/10 text-[#00e5ff] border border-[#00e5ff]/30">
        <Truck size={11} />
        <span>Pendente</span>
      </span>
    );
  }

  if (carregando) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3">
        <Carregando tamanho="lg" texto="Carregando métricas da loja..." />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black font-titulo text-white flex items-center gap-2.5">
            <BarChart3 className="text-[#00e5ff]" size={28} />
            Métricas da Loja
          </h1>
          <p className="text-slate-400 text-xs sm:text-sm mt-1">
            Acompanhe o faturamento, volume de vendas e controle as entregas de produtos da sua atlética
          </p>
        </div>

        {/* Filtros de Período e Método */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={periodoFiltro}
            onChange={(e) => setPeriodoFiltro(e.target.value as any)}
            className="bg-[#0e1626] border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none focus:border-[#00e5ff] cursor-pointer"
          >
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="mes">Este Mês</option>
            <option value="todos">Todo o Período</option>
          </select>

          <select
            value={metodoFiltro}
            onChange={(e) => setMetodoFiltro(e.target.value as any)}
            className="bg-[#0e1626] border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none focus:border-[#00e5ff] cursor-pointer"
          >
            <option value="todos">Todos os Métodos</option>
            <option value="pix">Apenas Pix</option>
            <option value="cartao">Apenas Cartão</option>
            <option value="gratuito">Apenas Gratuitos</option>
          </select>

          <select
            value={entregaFiltro}
            onChange={(e) => setEntregaFiltro(e.target.value as any)}
            className="bg-[#0e1626] border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none focus:border-[#00e5ff] cursor-pointer"
          >
            <option value="todos">Todas Entregas</option>
            <option value="pendente">Pendentes de Entrega</option>
            <option value="entregue">Já Entregues</option>
          </select>
        </div>
      </div>

      {/* Cards de Métricas de Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Cartao variante="vidro" className="p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Faturamento Total</span>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white shadow-md">
              <DollarSign size={20} />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black font-titulo text-white">
            {formatarMoeda(faturamentoTotalReais)}
          </p>
          <span className="text-[11px] text-emerald-400 block font-medium">
            Receita líquida confirmada
          </span>
        </Cartao>

        <Cartao variante="vidro" className="p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Pedidos Pagos</span>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00e5ff] to-[#026cdf] flex items-center justify-center text-white shadow-md">
              <ShoppingCart size={20} />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black font-titulo text-white">
            {totalPedidosPagosCount}
          </p>
          <span className="text-[11px] text-slate-400 block">
            De um total de {pedidosFiltrados.length} pedidos
          </span>
        </Cartao>

        <Cartao variante="vidro" className="p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Ticket Médio</span>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white shadow-md">
              <TrendingUp size={20} />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black font-titulo text-white">
            {formatarMoeda(ticketMedioReais)}
          </p>
          <span className="text-[11px] text-slate-400 block">
            Média por pedido aprovado
          </span>
        </Cartao>

        <Cartao variante="vidro" className="p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Itens Vendidos</span>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#ff007a] to-[#8b5cf6] flex items-center justify-center text-white shadow-md">
              <Package size={20} />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black font-titulo text-white">
            {totalProdutosVendidosUnidades} <span className="text-sm font-normal text-slate-400">unidades</span>
          </p>
          <span className="text-[11px] text-slate-400 block">
            Volume de produtos movimentados
          </span>
        </Cartao>
      </div>

      {/* Gráfico de Vendas e Ranking de Produtos */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Gráfico de Vendas por Período (7 colunas) */}
        <div className="lg:col-span-7">
          <Cartao variante="vidro" className="p-6 space-y-6 h-full flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold font-titulo text-white flex items-center gap-2">
                <BarChart3 className="text-[#00e5ff]" size={18} />
                Vendas por Período
              </h3>
              <span className="text-xs text-slate-400">Total por dia (R$)</span>
            </div>

            {diasOrdenados.length > 0 ? (
              <div className="space-y-4 pt-4">
                <div className="flex items-end gap-2 h-44 sm:h-52 w-full pt-4">
                  {diasOrdenados.map((dia, idx) => {
                    const alturaPercent = Math.max(10, Math.round((dia.total / maxVendaDia) * 100));

                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group relative">
                        {/* Tooltip Hover */}
                        <div className="absolute -top-10 bg-[#080c14] border border-white/20 px-2 py-1 rounded text-[10px] font-bold text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-xl">
                          {formatarMoeda(dia.total)} ({dia.count} ped.)
                        </div>

                        {/* Barra */}
                        <div
                          className="w-full max-w-[32px] rounded-t-lg bg-gradient-to-t from-[#ff007a] to-[#00e5ff] group-hover:brightness-125 transition-all"
                          style={{ height: `${alturaPercent}%` }}
                        />
                        {/* Label Data */}
                        <span className="text-[10px] text-slate-400 font-mono truncate">
                          {dia.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="py-16 text-center text-xs text-slate-400">
                Nenhuma venda registrada no período selecionado.
              </div>
            )}
          </Cartao>
        </div>

        {/* Ranking dos Produtos Mais Vendidos (5 colunas) */}
        <div className="lg:col-span-5">
          <Cartao variante="vidro" className="p-6 space-y-4 h-full">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-base font-bold font-titulo text-white flex items-center gap-2">
                <Award className="text-amber-400" size={18} />
                Ranking de Produtos
              </h3>
              <span className="text-xs text-slate-400">Por Receita</span>
            </div>

            {rankingProdutos.length > 0 ? (
              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {rankingProdutos.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-2xl bg-[#0e1626]/80 border border-white/10 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${
                        idx === 0
                          ? 'bg-amber-400 text-slate-950 shadow-md'
                          : idx === 1
                          ? 'bg-slate-300 text-slate-950 shadow-md'
                          : idx === 2
                          ? 'bg-amber-700 text-white'
                          : 'bg-white/5 text-slate-400'
                      }`}>
                        #{idx + 1}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-white truncate">{item.nome}</p>
                        <p className="text-[11px] text-slate-400">{item.quantidade} unidades vendidas</p>
                      </div>
                    </div>
                    <span className="font-black text-white font-titulo shrink-0">
                      {formatarMoeda(item.receita)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-slate-400">
                Nenhum produto vendido ainda.
              </div>
            )}
          </Cartao>
        </div>
      </div>

      {/* Tabela de Pedidos Recentes da Loja com Busca e Ação de Entrega */}
      <Cartao variante="vidro" className="p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/10">
          <div>
            <h3 className="text-base sm:text-lg font-bold font-titulo text-white flex items-center gap-2">
              <ShoppingCart className="text-[#00e5ff]" size={20} />
              Pedidos Recentes da Loja
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {pedidosFiltrados.length} {pedidosFiltrados.length === 1 ? 'pedido encontrado' : 'pedidos encontrados'}
            </p>
          </div>

          {/* Barra de Pesquisa */}
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
            <input
              type="text"
              value={buscaTexto}
              onChange={(e) => setBuscaTexto(e.target.value)}
              placeholder="Buscar por nº, cliente, e-mail, produto..."
              className="w-full bg-[#0e1626] border border-white/10 focus:border-[#00e5ff] rounded-xl pl-10 pr-9 py-2 text-xs text-white placeholder-slate-500 outline-none transition-colors shadow-inner"
            />
            {buscaTexto && (
              <button
                type="button"
                onClick={() => setBuscaTexto('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                title="Limpar busca"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {pedidosFiltrados.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/10 text-slate-400 uppercase tracking-wider font-bold">
                <tr>
                  <th className="py-3 px-3">Pedido</th>
                  <th className="py-3 px-3">Comprador</th>
                  <th className="py-3 px-3">Itens</th>
                  <th className="py-3 px-3">Método</th>
                  <th className="py-3 px-3">Total</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Entrega</th>
                  <th className="py-3 px-3">Data</th>
                  <th className="py-3 px-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {pedidosFiltrados.map((ped) => {
                  const compradorNome = (ped.user as any)?.nome || 'Cliente';
                  const compradorEmail = (ped.user as any)?.email || '';
                  const total = ped.total_amount / 100;
                  const totalItensQtd = ped.items?.reduce((acc, it) => acc + it.quantity, 0) || 0;
                  const estaEntregue = Boolean(ped.metadata?.entregue);
                  const estaAtualizando = atualizandoEntregaId === ped.id;

                  return (
                    <tr key={ped.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 px-3 font-mono font-bold text-white">
                        #{ped.id.substring(0, 8).toUpperCase()}
                      </td>
                      <td className="py-3 px-3">
                        <p className="font-bold text-white">{compradorNome}</p>
                        <p className="text-[11px] text-slate-400">{compradorEmail}</p>
                      </td>
                      <td className="py-3 px-3 text-slate-300">
                        {totalItensQtd} {totalItensQtd === 1 ? 'item' : 'itens'}
                      </td>
                      <td className="py-3 px-3 text-white uppercase font-bold text-[11px]">
                        {ped.payment_method === 'gratuito' ? (
                          <span className="text-emerald-400">Grátis</span>
                        ) : (
                          ped.payment_method || 'Pix/Cartão'
                        )}
                      </td>
                      <td className="py-3 px-3 font-black text-white font-titulo">
                        {total === 0 ? (
                          <span className="text-emerald-400">R$ 0,00</span>
                        ) : (
                          formatarMoeda(total)
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {renderStatusBadge(ped.status)}
                      </td>
                      <td className="py-3 px-3">
                        {renderEntregaBadge(ped.metadata, ped.status)}
                      </td>
                      <td className="py-3 px-3 text-slate-400 text-[11px] whitespace-nowrap">
                        {formatarDataCurta(ped.created_at)}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Botão ou Tag de Entrega */}
                          {ped.status === 'paid' && (
                            estaEntregue ? (
                              <span
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold inline-flex items-center gap-1.5 select-none shadow-sm cursor-default"
                                title={`Entregue em ${ped.metadata?.entregue_em ? formatarDataHora(String(ped.metadata.entregue_em)) : 'Data confirmada'}`}
                              >
                                <Check size={12} className="stroke-[3]" />
                                <span>Entregue</span>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => marcarEntregue(ped.id)}
                                disabled={estaAtualizando}
                                className="px-2.5 py-1.5 rounded-lg border border-[#00e5ff]/30 bg-[#00e5ff]/10 text-[#00e5ff] hover:bg-[#00e5ff]/20 text-[11px] font-bold inline-flex items-center gap-1.5 transition-all cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Confirmar entrega do produto ao cliente"
                              >
                                {estaAtualizando ? (
                                  <Carregando tamanho="sm" />
                                ) : (
                                  <>
                                    <PackageCheck size={13} />
                                    <span>Entregar</span>
                                  </>
                                )}
                              </button>
                            )
                          )}

                          {/* Botão Ver Detalhes */}
                          <button
                            type="button"
                            onClick={() => setPedidoSelecionado(ped)}
                            className="p-1.5 rounded-lg bg-white/5 border border-white/10 hover:border-[#00e5ff]/50 text-slate-300 hover:text-white transition-all cursor-pointer inline-flex items-center gap-1 text-[11px] font-bold"
                            title="Ver detalhes completos do pedido"
                          >
                            <Eye size={13} />
                            <span className="hidden sm:inline">Detalhes</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-12 text-center text-xs text-slate-400 space-y-2">
            <ShoppingCart size={32} className="mx-auto text-slate-600 mb-2" />
            <p className="font-bold text-white">Nenhum pedido encontrado</p>
            <p className="text-slate-400 max-w-sm mx-auto">
              {buscaTexto
                ? `Nenhum resultado corresponde à busca "${buscaTexto}". Tente outros termos.`
                : 'Não há pedidos para os filtros selecionados.'}
            </p>
          </div>
        )}
      </Cartao>

      {/* Modal de Detalhes do Pedido */}
      <Modal
        aberto={Boolean(pedidoSelecionado)}
        aoFechar={() => setPedidoSelecionado(null)}
        titulo={`Detalhes do Pedido #${pedidoSelecionado?.id.substring(0, 8).toUpperCase()}`}
        descricao="Informações completas de compra, comprador e controle de entrega."
        tamanho="lg"
      >
        {pedidoSelecionado && (
          <div className="space-y-5 text-xs sm:text-sm">
            {/* Bloco de Ação de Entrega em Destaque */}
            <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
              pedidoSelecionado.metadata?.entregue
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-[#00e5ff]/10 border-[#00e5ff]/30 text-[#00e5ff]'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  pedidoSelecionado.metadata?.entregue
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-[#00e5ff]/20 text-[#00e5ff]'
                }`}>
                  {pedidoSelecionado.metadata?.entregue ? <PackageCheck size={20} /> : <Truck size={20} />}
                </div>
                <div>
                  <h4 className="font-bold text-white text-sm">
                    {pedidoSelecionado.metadata?.entregue
                      ? 'Produto Entregue ao Cliente'
                      : 'Aguardando Retirada / Entrega'}
                  </h4>
                  <p className="text-xs text-slate-300">
                    {pedidoSelecionado.metadata?.entregue
                      ? pedidoSelecionado.metadata.entregue_em
                        ? `Entregue em ${formatarDataHora(String(pedidoSelecionado.metadata.entregue_em))}`
                        : 'Entregue registrado com sucesso.'
                      : 'O cliente ainda não retirou ou recebeu os produtos deste pedido.'}
                  </p>
                </div>
              </div>

              {pedidoSelecionado.status === 'paid' && (
                pedidoSelecionado.metadata?.entregue ? (
                  <div className="px-3.5 py-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center justify-center gap-1.5 select-none shrink-0">
                    <Check size={14} className="stroke-[3]" />
                    <span>Entrega Concluída</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => marcarEntregue(pedidoSelecionado.id)}
                    disabled={atualizandoEntregaId === pedidoSelecionado.id}
                    className="w-full sm:w-auto px-4 py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md bg-gradient-to-r from-emerald-500 to-emerald-600 hover:brightness-110 text-slate-950 font-black shrink-0"
                  >
                    {atualizandoEntregaId === pedidoSelecionado.id ? (
                      <Carregando tamanho="sm" />
                    ) : (
                      <>
                        <Check size={14} className="stroke-[3]" />
                        <span>Confirmar Entrega</span>
                      </>
                    )}
                  </button>
                )
              )}
            </div>

            {/* Informações Gerais */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-2xl bg-[#080c14] border border-white/10">
              <div>
                <p className="text-[11px] text-slate-400 uppercase font-bold">Status Pgto</p>
                <div className="mt-1">{renderStatusBadge(pedidoSelecionado.status)}</div>
              </div>
              <div>
                <p className="text-[11px] text-slate-400 uppercase font-bold">Valor Total</p>
                <p className="text-base font-black text-white font-titulo mt-0.5">
                  {pedidoSelecionado.total_amount === 0 ? (
                    <span className="text-emerald-400">Grátis</span>
                  ) : (
                    formatarMoeda(pedidoSelecionado.total_amount / 100)
                  )}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400 uppercase font-bold">Forma Pgto</p>
                <p className="font-bold text-white uppercase mt-0.5">
                  {pedidoSelecionado.payment_method || 'Pix/Cartão'}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400 uppercase font-bold">Data da Compra</p>
                <p className="text-white font-medium mt-0.5">
                  {formatarDataHora(pedidoSelecionado.created_at)}
                </p>
              </div>
            </div>

            {/* Dados do Comprador */}
            <div className="p-4 rounded-2xl bg-[#080c14] border border-white/10 space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                Dados do Comprador
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-slate-300">
                <div>
                  <span className="text-slate-400 block">Nome:</span>
                  <strong className="text-white">{(pedidoSelecionado.user as any)?.nome || 'Cliente'}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">E-mail:</span>
                  <strong className="text-white">{(pedidoSelecionado.user as any)?.email || 'Não informado'}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Telefone:</span>
                  <strong className="text-white">{(pedidoSelecionado.user as any)?.telefone || 'Não informado'}</strong>
                </div>
              </div>
            </div>

            {/* Lista dos Itens do Pedido */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                Itens Comprados:
              </h4>
              <div className="space-y-2">
                {pedidoSelecionado.items?.map((it) => (
                  <div
                    key={it.id}
                    className="p-3.5 rounded-xl bg-[#0e1626] border border-white/10 flex items-center justify-between text-xs"
                  >
                    <div className="space-y-0.5">
                      <p className="font-bold text-white text-sm">{it.product_name_snapshot}</p>
                      <div className="flex items-center gap-3 text-slate-400 text-[11px]">
                        <span>Quantidade: <strong className="text-white">{it.quantity}x</strong></span>
                        {it.size && <span>Tamanho: <strong className="text-white">{it.size}</strong></span>}
                        <span>Preço Unitário: <strong className="text-white">{formatarMoeda(it.unit_price_snapshot / 100)}</strong></span>
                      </div>
                    </div>
                    <span className="text-sm font-black text-white font-titulo">
                      {formatarMoeda(it.subtotal / 100)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-white/10">
              <Botao
                variante="fantasma"
                tamanho="md"
                onClick={() => setPedidoSelecionado(null)}
              >
                Fechar
              </Botao>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
