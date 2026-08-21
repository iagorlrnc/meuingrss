'use client';

import React, { useState, useEffect } from 'react';
import { criarClienteNavegador } from '@/lib/supabase/cliente';
import { usarAutenticacao } from '@/contextos/ContextoAutenticacao';
import { formatarMoeda, formatarDataHora, formatarDataCurta } from '@/lib/utilitarios';
import Cartao from '@/componentes/ui/Cartao';
import Botao from '@/componentes/ui/Botao';
import Modal from '@/componentes/ui/Modal';
import Carregando from '@/componentes/ui/Carregando';
import type { PedidoLoja, ItemPedidoLoja } from '@/tipos';
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
} from 'lucide-react';

export default function PaginaMetricasLoja() {
  const { perfil } = usarAutenticacao();
  const supabase = criarClienteNavegador();

  const [pedidos, setPedidos] = useState<PedidoLoja[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [periodoFiltro, setPeriodoFiltro] = useState<'7d' | '30d' | 'mes' | 'todos'>('30d');
  const [metodoFiltro, setMetodoFiltro] = useState<'todos' | 'pix' | 'cartao'>('todos');

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

        const { data, error } = await query;
        if (!error && data) {
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

  // Filtragem dos pedidos
  const agora = Date.now();
  const pedidosFiltrados = pedidos.filter((ped) => {
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
      if (ped.payment_method === 'pix') return false;
    }

    return true;
  });

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
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-sucesso/10 text-sucesso border border-sucesso/20">
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
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-erro/10 text-erro border border-erro/20">
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
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-erro/10 text-erro border border-erro/20">
            <XCircle size={12} />
            <span>Cancelado</span>
          </span>
        );
    }
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
          <h1 className="text-2xl sm:text-3xl font-black font-titulo text-texto-principal flex items-center gap-2.5">
            <BarChart3 className="text-primaria-400" size={28} />
            Métricas da Loja
          </h1>
          <p className="text-texto-secundario text-xs sm:text-sm mt-1">
            Acompanhe o faturamento, volume de vendas e produtos mais vendidos da sua atlética
          </p>
        </div>

        {/* Filtros de Período e Método */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={periodoFiltro}
            onChange={(e) => setPeriodoFiltro(e.target.value as any)}
            className="bg-fundo-card border border-borda-sutil rounded-xl px-3 py-2 text-xs font-bold text-texto-principal outline-none focus:border-primaria-500 cursor-pointer"
          >
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="mes">Este Mês</option>
            <option value="todos">Todo o Período</option>
          </select>

          <select
            value={metodoFiltro}
            onChange={(e) => setMetodoFiltro(e.target.value as any)}
            className="bg-fundo-card border border-borda-sutil rounded-xl px-3 py-2 text-xs font-bold text-texto-principal outline-none focus:border-primaria-500 cursor-pointer"
          >
            <option value="todos">Todos os Métodos</option>
            <option value="pix">Apenas Pix</option>
            <option value="cartao">Apenas Cartão</option>
          </select>
        </div>
      </div>

      {/* Cards de Métricas de Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Cartao variante="vidro" className="p-5 space-y-2">
          <div className="flex items-center justify-between text-texto-terciario">
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
          <div className="flex items-center justify-between text-texto-terciario">
            <span className="text-xs font-bold uppercase tracking-wider">Pedidos Pagos</span>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primaria-500 to-primaria-600 flex items-center justify-center text-white shadow-md">
              <ShoppingCart size={20} />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black font-titulo text-white">
            {totalPedidosPagosCount}
          </p>
          <span className="text-[11px] text-texto-secundario block">
            De um total de {pedidosFiltrados.length} pedidos
          </span>
        </Cartao>

        <Cartao variante="vidro" className="p-5 space-y-2">
          <div className="flex items-center justify-between text-texto-terciario">
            <span className="text-xs font-bold uppercase tracking-wider">Ticket Médio</span>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white shadow-md">
              <TrendingUp size={20} />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black font-titulo text-white">
            {formatarMoeda(ticketMedioReais)}
          </p>
          <span className="text-[11px] text-texto-secundario block">
            Média por pedido aprovado
          </span>
        </Cartao>

        <Cartao variante="vidro" className="p-5 space-y-2">
          <div className="flex items-center justify-between text-texto-terciario">
            <span className="text-xs font-bold uppercase tracking-wider">Itens Vendidos</span>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-secundaria-500 to-secundaria-600 flex items-center justify-center text-white shadow-md">
              <Package size={20} />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black font-titulo text-white">
            {totalProdutosVendidosUnidades} <span className="text-sm font-normal text-slate-400">unidades</span>
          </p>
          <span className="text-[11px] text-texto-secundario block">
            Volume de produtos entregues
          </span>
        </Cartao>
      </div>

      {/* Gráfico de Vendas e Ranking de Produtos */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Gráfico de Vendas por Período (7 colunas) */}
        <div className="lg:col-span-7">
          <Cartao variante="vidro" className="p-6 space-y-6 h-full flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold font-titulo text-texto-principal flex items-center gap-2">
                <BarChart3 className="text-primaria-400" size={18} />
                Vendas por Período
              </h3>
              <span className="text-xs text-texto-terciario">Total por dia (R$)</span>
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
                          className="w-full max-w-[32px] rounded-t-lg bg-gradient-to-t from-primaria-600 to-[#00e5ff] group-hover:brightness-125 transition-all"
                          style={{ height: `${alturaPercent}%` }}
                        />
                        {/* Label Data */}
                        <span className="text-[10px] text-texto-terciario font-mono truncate">
                          {dia.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="py-16 text-center text-xs text-texto-terciario">
                Nenhuma venda registrada no período selecionado.
              </div>
            )}
          </Cartao>
        </div>

        {/* Ranking dos Produtos Mais Vendidos (5 colunas) */}
        <div className="lg:col-span-5">
          <Cartao variante="vidro" className="p-6 space-y-4 h-full">
            <div className="flex items-center justify-between pb-3 border-b border-borda-sutil">
              <h3 className="text-base font-bold font-titulo text-texto-principal flex items-center gap-2">
                <Award className="text-amber-400" size={18} />
                Ranking de Produtos
              </h3>
              <span className="text-xs text-texto-terciario">Por Receita</span>
            </div>

            {rankingProdutos.length > 0 ? (
              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {rankingProdutos.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-2xl bg-fundo-card/60 border border-borda-sutil flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${
                        idx === 0
                          ? 'bg-amber-400 text-slate-950 shadow-md'
                          : idx === 1
                          ? 'bg-slate-300 text-slate-950 shadow-md'
                          : idx === 2
                          ? 'bg-amber-700 text-white'
                          : 'bg-white/5 text-texto-terciario'
                      }`}>
                        #{idx + 1}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-texto-principal truncate">{item.nome}</p>
                        <p className="text-[11px] text-texto-terciario">{item.quantidade} unidades vendidas</p>
                      </div>
                    </div>
                    <span className="font-black text-texto-principal font-titulo shrink-0">
                      {formatarMoeda(item.receita)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-texto-terciario">
                Nenhum produto vendido ainda.
              </div>
            )}
          </Cartao>
        </div>
      </div>

      {/* Tabela de Pedidos Recentes da Loja */}
      <Cartao variante="vidro" className="p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-borda-sutil">
          <h3 className="text-base font-bold font-titulo text-texto-principal flex items-center gap-2">
            <ShoppingCart className="text-primaria-400" size={18} />
            Pedidos Recentes da Loja
          </h3>
          <span className="text-xs text-texto-terciario">{pedidosFiltrados.length} pedidos listados</span>
        </div>

        {pedidosFiltrados.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-borda-sutil text-texto-terciario uppercase tracking-wider font-bold">
                <tr>
                  <th className="py-3 px-3">Pedido</th>
                  <th className="py-3 px-3">Comprador</th>
                  <th className="py-3 px-3">Itens</th>
                  <th className="py-3 px-3">Método</th>
                  <th className="py-3 px-3">Total</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Data</th>
                  <th className="py-3 px-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borda-sutil">
                {pedidosFiltrados.map((ped) => {
                  const compradorNome = (ped.user as any)?.nome || 'Cliente';
                  const compradorEmail = (ped.user as any)?.email || '';
                  const total = ped.total_amount / 100;
                  const totalItensQtd = ped.items?.reduce((acc, it) => acc + it.quantity, 0) || 0;

                  return (
                    <tr key={ped.id} className="hover:bg-fundo-hover transition-colors">
                      <td className="py-3 px-3 font-mono font-bold text-texto-principal">
                        #{ped.id.substring(0, 8).toUpperCase()}
                      </td>
                      <td className="py-3 px-3">
                        <p className="font-bold text-texto-principal">{compradorNome}</p>
                        <p className="text-[11px] text-texto-terciario">{compradorEmail}</p>
                      </td>
                      <td className="py-3 px-3 text-texto-secundario">
                        {totalItensQtd} {totalItensQtd === 1 ? 'item' : 'itens'}
                      </td>
                      <td className="py-3 px-3 text-texto-principal uppercase font-bold text-[11px]">
                        {ped.payment_method || 'Pix/Cartão'}
                      </td>
                      <td className="py-3 px-3 font-black text-texto-principal font-titulo">
                        {formatarMoeda(total)}
                      </td>
                      <td className="py-3 px-3">
                        {renderStatusBadge(ped.status)}
                      </td>
                      <td className="py-3 px-3 text-texto-terciario text-[11px] whitespace-nowrap">
                        {formatarDataCurta(ped.created_at)}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => setPedidoSelecionado(ped)}
                          className="p-1.5 rounded-lg bg-fundo-card border border-borda-sutil hover:border-primaria-500 text-texto-secundario hover:text-texto-principal transition-all cursor-pointer inline-flex items-center gap-1 text-[11px] font-bold"
                        >
                          <Eye size={13} />
                          <span>Detalhes</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-12 text-center text-xs text-texto-terciario">
            Nenhum pedido encontrado com os filtros atuais.
          </div>
        )}
      </Cartao>

      {/* Modal de Detalhes do Pedido */}
      <Modal
        aberto={Boolean(pedidoSelecionado)}
        aoFechar={() => setPedidoSelecionado(null)}
        titulo={`Detalhes do Pedido #${pedidoSelecionado?.id.substring(0, 8).toUpperCase()}`}
        descricao="Informações completas de compra e itens do pedido da loja."
        tamanho="lg"
      >
        {pedidoSelecionado && (
          <div className="space-y-5 text-xs sm:text-sm">
            {/* Informações Gerais */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-2xl bg-fundo-input border border-borda-sutil">
              <div>
                <p className="text-[11px] text-texto-terciario uppercase font-bold">Status</p>
                <div className="mt-1">{renderStatusBadge(pedidoSelecionado.status)}</div>
              </div>
              <div>
                <p className="text-[11px] text-texto-terciario uppercase font-bold">Valor Total</p>
                <p className="text-base font-black text-texto-principal font-titulo mt-0.5">
                  {formatarMoeda(pedidoSelecionado.total_amount / 100)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-texto-terciario uppercase font-bold">Forma de Pagamento</p>
                <p className="font-bold text-texto-principal uppercase mt-0.5">
                  {pedidoSelecionado.payment_method || 'Pix/Cartão'}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-texto-terciario uppercase font-bold">Data da Compra</p>
                <p className="text-texto-principal font-medium mt-0.5">
                  {formatarDataHora(pedidoSelecionado.created_at)}
                </p>
              </div>
            </div>

            {/* Dados do Comprador */}
            <div className="p-4 rounded-2xl bg-fundo-input border border-borda-sutil space-y-1.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-texto-principal">
                Dados do Comprador
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-texto-secundario">
                <div>
                  <span className="text-texto-terciario block">Nome:</span>
                  <strong className="text-texto-principal">{(pedidoSelecionado.user as any)?.nome || 'Cliente'}</strong>
                </div>
                <div>
                  <span className="text-texto-terciario block">E-mail:</span>
                  <strong className="text-texto-principal">{(pedidoSelecionado.user as any)?.email || 'Não informado'}</strong>
                </div>
                <div>
                  <span className="text-texto-terciario block">Telefone:</span>
                  <strong className="text-texto-principal">{(pedidoSelecionado.user as any)?.telefone || 'Não informado'}</strong>
                </div>
              </div>
            </div>

            {/* Lista dos Itens do Pedido */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-texto-principal">
                Itens Comprados:
              </h4>
              <div className="space-y-2">
                {pedidoSelecionado.items?.map((it) => (
                  <div
                    key={it.id}
                    className="p-3.5 rounded-xl bg-fundo-card border border-borda-sutil flex items-center justify-between text-xs"
                  >
                    <div className="space-y-0.5">
                      <p className="font-bold text-texto-principal text-sm">{it.product_name_snapshot}</p>
                      <div className="flex items-center gap-3 text-texto-terciario text-[11px]">
                        <span>Quantidade: <strong className="text-texto-secundario">{it.quantity}x</strong></span>
                        {it.size && <span>Tamanho: <strong className="text-texto-secundario">{it.size}</strong></span>}
                        <span>Preço Unitário: <strong className="text-texto-secundario">{formatarMoeda(it.unit_price_snapshot / 100)}</strong></span>
                      </div>
                    </div>
                    <span className="text-sm font-black text-texto-principal font-titulo">
                      {formatarMoeda(it.subtotal / 100)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-borda-sutil">
              <Botao
                variante="primario"
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
