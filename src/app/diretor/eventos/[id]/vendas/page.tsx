'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Cartao from '@/componentes/ui/Cartao';
import Distintivo from '@/componentes/ui/Distintivo';
import Carregando from '@/componentes/ui/Carregando';
import Botao from '@/componentes/ui/Botao';
import CampoTexto from '@/componentes/ui/CampoTexto';
import EstadoVazio from '@/componentes/ui/EstadoVazio';
import { criarClienteNavegador } from '@/lib/supabase/cliente';
import { useNotificacao } from '@/componentes/ui/Notificacao';
import {
  formatarMoeda,
  formatarDataHora,
  formatarTelefone,
  formatarCPF,
  mascararCPF,
  obterIniciais,
} from '@/lib/utilitarios';
import {
  ArrowLeft,
  Ticket,
  DollarSign,
  Users,
  TrendingUp,
  Search,
  Mail,
  Phone,
  CreditCard,
  Eye,
  X,
  Ban,
  AlertTriangle,
} from 'lucide-react';

import type { Evento, LoteIngresso, Ingresso } from '@/tipos';

interface IngressoComDetalhes extends Omit<Ingresso, 'lote' | 'comprador'> {
  lote?: {
    id: string;
    nome_lote: string;
    preco: number;
  };
  comprador?: {
    id: string;
    nome: string;
    email: string;
    telefone?: string | null;
    cpf?: string | null;
    avatar_url?: string | null;
  };
}

export default function PaginaVendas() {
  const params = useParams();
  const { sucesso, erro: notificarErro } = useNotificacao();
  const supabase = criarClienteNavegador();

  const [evento, setEvento] = useState<(Evento & { lotes_ingresso?: LoteIngresso[] }) | null>(null);
  const [ingressos, setIngressos] = useState<IngressoComDetalhes[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Filtros e Pesquisa
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');
  const [filtroLote, setFiltroLote] = useState<string>('todos');

  // Modal de Detalhes do Comprador
  const [ingressoSelecionado, setIngressoSelecionado] = useState<IngressoComDetalhes | null>(null);
  const [confirmandoCancelamento, setConfirmandoCancelamento] = useState(false);
  const [processandoCancelamento, setProcessandoCancelamento] = useState(false);

  async function aoCancelarIngresso() {
    if (!ingressoSelecionado) return;
    setProcessandoCancelamento(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const resp = await fetch('/api/diretor/ingressos/cancelar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          ingresso_id: ingressoSelecionado.id,
        }),
      });

      const dados = await resp.json().catch(() => ({}));

      if (!resp.ok || dados.erro) {
        throw new Error(dados.erro || `Erro ${resp.status}: Não foi possível cancelar o ingresso.`);
      }

      setIngressos(prev =>
        prev.map(ing => (ing.id === ingressoSelecionado.id ? { ...ing, status: 'cancelado' } : ing))
      );
      setIngressoSelecionado(prev => (prev ? { ...prev, status: 'cancelado' } : null));
      setConfirmandoCancelamento(false);
      sucesso('Ingresso cancelado com sucesso', 'O status do ingresso foi alterado para cancelado.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao cancelar o ingresso.';
      notificarErro('Erro ao cancelar', msg);
    } finally {
      setProcessandoCancelamento(false);
    }
  }

  useEffect(() => {
    if (params.id) {
      buscar();
    }
  }, [params.id]);

  async function buscar() {
    setCarregando(true);
    try {
      const eventoIdParam = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';
      const ehUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventoIdParam);

      let queryEvento = supabase
        .from('eventos')
        .select('id, slug, titulo, status, data_evento, local, cidade, lotes_ingresso(id, nome_lote, preco, quantidade_total, quantidade_vendida)');

      if (ehUUID) {
        queryEvento = queryEvento.eq('id', eventoIdParam);
      } else {
        queryEvento = queryEvento.eq('slug', eventoIdParam);
      }

      const { data: eventoData } = await queryEvento.maybeSingle();

      if (!eventoData) {
        setCarregando(false);
        return;
      }

      setEvento(eventoData);
      const realEventoId = eventoData.id;

      // Tenta a consulta com join direto
      let { data: ingressosData, error: erroIngressos } = await supabase
        .from('ingressos')
        .select(`
          id,
          evento_id,
          lote_id,
          comprador_id,
          qr_code_hash,
          status,
          data_compra,
          data_validacao,
          validado_por,
          lote:lotes_ingresso(id, nome_lote, preco),
          comprador:profiles!ingressos_comprador_id_fkey(id, nome, email, telefone, cpf, avatar_url)
        `)
        .eq('evento_id', realEventoId)
        .order('data_compra', { ascending: false });

      // Se houver erro de relacionamento ambíguo no Supabase, realiza a busca com fallback
      if (erroIngressos || !ingressosData) {
        console.warn('Executando fallback para carregar compradores...', erroIngressos?.message);
        const { data: ingressosBase } = await supabase
          .from('ingressos')
          .select(`
            id,
            evento_id,
            lote_id,
            comprador_id,
            qr_code_hash,
            status,
            data_compra,
            data_validacao,
            validado_por,
            lote:lotes_ingresso(id, nome_lote, preco)
          `)
          .eq('evento_id', realEventoId)
          .order('data_compra', { ascending: false });

        if (ingressosBase && ingressosBase.length > 0) {
          interface IngressoBaseItem {
            id: string;
            evento_id: string;
            lote_id: string;
            comprador_id: string;
            qr_code_hash: string;
            status: import('@/tipos').StatusIngresso;
            data_compra: string;
            data_validacao: string | null;
            validado_por: string | null;
            lote?: { id: string; nome_lote: string; preco: number } | null;
          }

          const itensBase = ingressosBase as unknown as IngressoBaseItem[];
          const compradorIds = Array.from(new Set(itensBase.map((i) => i.comprador_id).filter(Boolean)));
          
          interface PerfilCompradorMap {
            id: string;
            nome: string;
            email: string;
            telefone?: string | null;
            cpf?: string | null;
            avatar_url?: string | null;
          }

          const perfisMap = new Map<string, PerfilCompradorMap>();
          if (compradorIds.length > 0) {
            const { data: perfis } = await supabase
              .from('profiles')
              .select('id, nome, email, telefone, cpf, avatar_url')
              .in('id', compradorIds);
            
            if (perfis) {
              (perfis as PerfilCompradorMap[]).forEach((p) => perfisMap.set(p.id, p));
            }
          }

          ingressosData = itensBase.map((ing) => ({
            ...ing,
            comprador: perfisMap.get(ing.comprador_id) || undefined
          }));
        } else {
          ingressosData = [];
        }
      }

      setIngressos((ingressosData || []) as unknown as IngressoComDetalhes[]);
    } catch {
      // Ignorar erros no client
    } finally {
      setCarregando(false);
    }
  }

  // Filtragem dos ingressos
  const ingressosFiltrados = ingressos.filter((ing) => {
    const termo = busca.toLowerCase().trim();
    const compradorNome = ing.comprador?.nome?.toLowerCase() || '';
    const compradorEmail = ing.comprador?.email?.toLowerCase() || '';
    const compradorCpf = ing.comprador?.cpf || '';
    const compradorTelefone = ing.comprador?.telefone || '';
    const qrCode = ing.qr_code_hash?.toLowerCase() || '';
    const nomeLote = ing.lote?.nome_lote?.toLowerCase() || '';

    const combinaBusca =
      !termo ||
      compradorNome.includes(termo) ||
      compradorEmail.includes(termo) ||
      compradorCpf.includes(termo) ||
      compradorTelefone.includes(termo) ||
      qrCode.includes(termo) ||
      nomeLote.includes(termo);

    const combinaStatus = filtroStatus === 'todos' || ing.status === filtroStatus;
    const combinaLote = filtroLote === 'todos' || ing.lote_id === filtroLote || ing.lote?.id === filtroLote;

    return combinaBusca && combinaStatus && combinaLote;
  });

  if (carregando) {
    return (
      <div className="flex items-center justify-center h-96">
        <Carregando tamanho="lg" texto="Carregando acompanhamento de vendas..." />
      </div>
    );
  }

  if (!evento) {
    return (
      <div className="text-center py-12">
        <p className="text-texto-secundario mb-4">Evento não encontrado.</p>
        <Link href="/eventos">
          <Botao variante="contorno">Voltar para Meus Eventos</Botao>
        </Link>
      </div>
    );
  }

  const totalVendido = evento.lotes_ingresso?.reduce((a, l) => a + l.quantidade_vendida, 0) || 0;
  const receita = evento.lotes_ingresso?.reduce((a, l) => a + l.quantidade_vendida * l.preco, 0) || 0;
  const totalDisponivel = evento.lotes_ingresso?.reduce((a, l) => a + l.quantidade_total, 0) || 0;
  const taxaOcupacao = totalDisponivel > 0 ? Math.round((totalVendido / totalDisponivel) * 100) : 0;

  return (
    <div className="max-w-6xl mx-auto pb-12">
      {/* Botão de Voltar */}
      <Link
        href="/eventos"
        className="inline-flex items-center gap-2 text-sm text-texto-secundario hover:text-texto-principal transition-colors mb-6"
      >
        <ArrowLeft size={16} /> Voltar para Meus Eventos
      </Link>

      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl sm:text-3xl font-black font-titulo">{evento.titulo}</h1>
            <Distintivo status={evento.status} />
          </div>
          <p className="text-texto-secundario">Relatório e Gestão de Vendas & Compradores</p>
        </div>

        <Link href={`/eventos/${evento.slug || evento.id}/lotes`}>
          <Botao variante="contorno" icone={<Ticket size={16} />}>
            Gerenciar Lotes
          </Botao>
        </Link>
      </div>

      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Cartao variante="vidro" className="flex items-center justify-between">
          <div>
            <p className="text-xs text-texto-terciario font-semibold uppercase tracking-wider">Ingressos Vendidos</p>
            <p className="text-2xl font-black font-titulo mt-1">{totalVendido}</p>
          </div>
          <div className="p-3 rounded-xl bg-primaria-500/10 text-primaria-400">
            <Ticket size={24} />
          </div>
        </Cartao>

        <Cartao variante="vidro" className="flex items-center justify-between">
          <div>
            <p className="text-xs text-texto-terciario font-semibold uppercase tracking-wider">Disponíveis</p>
            <p className="text-2xl font-black font-titulo text-emerald-400 mt-1">
              {Math.max(0, totalDisponivel - totalVendido)}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400">
            <Users size={24} />
          </div>
        </Cartao>

        <Cartao variante="vidro" className="flex items-center justify-between">
          <div>
            <p className="text-xs text-texto-terciario font-semibold uppercase tracking-wider">Receita Total</p>
            <p className="text-2xl font-black font-titulo gradiente-texto mt-1">{formatarMoeda(receita)}</p>
          </div>
          <div className="p-3 rounded-xl bg-secundaria-500/10 text-secundaria-400">
            <DollarSign size={24} />
          </div>
        </Cartao>

        <Cartao variante="vidro" className="flex items-center justify-between">
          <div>
            <p className="text-xs text-texto-terciario font-semibold uppercase tracking-wider">Taxa de Ocupação</p>
            <p className="text-2xl font-black font-titulo mt-1">{taxaOcupacao}%</p>
          </div>
          <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400">
            <TrendingUp size={24} />
          </div>
        </Cartao>
      </div>

      {/* Resumo por Lotes */}
      <Cartao variante="vidro" className="mb-8">
        <h3 className="font-bold text-lg font-titulo mb-4 flex items-center gap-2">
          <Ticket className="text-primaria-400" size={20} />
          Desempenho por Lotes
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {evento.lotes_ingresso?.map((l: LoteIngresso) => {
            const pct = l.quantidade_total > 0 ? Math.round((l.quantidade_vendida / l.quantidade_total) * 100) : 0;
            return (
              <div key={l.id} className="p-4 rounded-xl bg-fundo-input border border-borda-sutil space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-texto-principal truncate">{l.nome_lote}</p>
                  <span className="text-xs font-bold text-primaria-400">{formatarMoeda(l.preco)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-texto-terciario">
                  <span>Vendidos: {l.quantidade_vendida} / {l.quantidade_total}</span>
                  <span>{pct}%</span>
                </div>
                <div className="w-full h-2 bg-fundo-principal rounded-full overflow-hidden border border-borda-sutil">
                  <div
                    className="h-full bg-gradient-to-r from-primaria-500 to-secundaria-500 rounded-full transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Cartao>

      {/* SEÇÃO PRINCIPAL DE COMPRADORES */}
      <Cartao variante="vidro" className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-borda-sutil">
          <div>
            <h3 className="font-bold text-xl font-titulo flex items-center gap-2">
              <Users className="text-primaria-400" size={22} />
              Lista de Compradores ({ingressosFiltrados.length})
            </h3>
            <p className="text-xs text-texto-secundario mt-0.5">
              Visualização detalhada dos ingressos adquiridos para este evento.
            </p>
          </div>
        </div>

        {/* Filtros e Barra de Pesquisa */}
        <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
          <div className="flex-1 min-w-[240px]">
            <CampoTexto
              placeholder="Buscar por nome, email, CPF, telefone ou lote..."
              value={busca}
              onChange={(e) => setBusca((e.target as HTMLInputElement).value)}
              icone={<Search size={18} />}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Filtro de Status */}
            <div className="flex items-center gap-1 bg-fundo-input p-1 rounded-xl border border-borda-sutil">
              {[
                { id: 'todos', label: 'Todos' },
                { id: 'valido', label: 'Válidos' },
                { id: 'utilizado', label: 'Utilizados' },
                { id: 'cancelado', label: 'Cancelados' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFiltroStatus(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    filtroStatus === tab.id
                      ? 'bg-primaria-500 text-white shadow-md'
                      : 'text-texto-terciario hover:text-texto-principal hover:bg-fundo-hover'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Filtro de Lote */}
            {evento.lotes_ingresso && evento.lotes_ingresso.length > 0 && (
              <select
                value={filtroLote}
                onChange={(e) => setFiltroLote(e.target.value)}
                className="bg-fundo-input border border-borda-sutil rounded-xl px-3 py-2 text-xs text-texto-principal focus:outline-none focus:border-primaria-500 cursor-pointer min-h-[36px]"
              >
                <option value="todos" className="bg-fundo-card text-texto-principal">
                  Todos os Lotes
                </option>
                {evento.lotes_ingresso.map((l) => (
                  <option key={l.id} value={l.id} className="bg-fundo-card text-texto-principal">
                    {l.nome_lote}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Tabela / Lista de Compradores */}
        {ingressosFiltrados.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-borda-sutil">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-fundo-input/60 border-b border-borda-sutil text-xs font-semibold text-texto-terciario uppercase tracking-wider">
                  <th className="p-4">Comprador</th>
                  <th className="p-4">Contato / CPF</th>
                  <th className="p-4">Lote & Valor</th>
                  <th className="p-4">Data da Compra</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borda-sutil/50 text-sm">
                {ingressosFiltrados.map((ing) => {
                  const nome = ing.comprador?.nome || 'Comprador Anônimo';
                  const email = ing.comprador?.email || 'N/A';
                  const telefone = ing.comprador?.telefone ? formatarTelefone(ing.comprador.telefone) : null;
                  const cpf = ing.comprador?.cpf ? mascararCPF(ing.comprador.cpf) : null;
                  const fotoUrl = ing.comprador?.avatar_url;
                  const iniciais = obterIniciais(nome);

                  return (
                    <tr key={ing.id} className="hover:bg-fundo-hover/50 transition-colors">
                      {/* Nome e Avatar */}
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          {fotoUrl ? (
                            <img
                              src={fotoUrl}
                              alt={nome}
                              className="w-10 h-10 rounded-xl object-cover border border-borda-sutil shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primaria-500/20 to-secundaria-500/20 border border-primaria-500/30 text-primaria-400 flex items-center justify-center font-bold text-xs shrink-0">
                              {iniciais}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-bold text-texto-principal truncate">{nome}</p>
                            <p className="text-xs text-texto-terciario truncate">{email}</p>
                          </div>
                        </div>
                      </td>

                      {/* Contato & CPF */}
                      <td className="p-4 text-xs space-y-1">
                        <div className="flex items-center gap-1.5 text-texto-secundario">
                          <Phone size={12} className="text-primaria-400 shrink-0" />
                          <span>{telefone || <span className="text-texto-terciario">Sem telefone</span>}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-texto-secundario font-mono">
                          <CreditCard size={12} className="text-secundaria-400 shrink-0" />
                          <span>{cpf ? `CPF: ${cpf}` : <span className="text-texto-terciario font-sans">CPF: Não cadastrado</span>}</span>
                        </div>
                      </td>

                      {/* Lote & Preço */}
                      <td className="p-4">
                        <p className="font-semibold text-texto-principal text-xs">
                          {ing.lote?.nome_lote || 'Ingresso'}
                        </p>
                        <p className="text-xs font-bold text-primaria-400">
                          {ing.lote?.preco ? formatarMoeda(ing.lote.preco) : '—'}
                        </p>
                      </td>

                      {/* Data de Compra */}
                      <td className="p-4 text-xs text-texto-secundario whitespace-nowrap">
                        {formatarDataHora(ing.data_compra)}
                      </td>

                      {/* Status */}
                      <td className="p-4">
                        <Distintivo status={ing.status} />
                      </td>

                      {/* Botão de Ver Detalhes */}
                      <td className="p-4 text-right">
                        <Botao
                          variante="contorno"
                          tamanho="sm"
                          icone={<Eye size={14} />}
                          onClick={() => {
                            setIngressoSelecionado(ing);
                            setConfirmandoCancelamento(false);
                          }}
                        >
                          Ver Detalhes
                        </Botao>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EstadoVazio
            titulo={busca || filtroStatus !== 'todos' || filtroLote !== 'todos' ? 'Nenhum comprador encontrado para o filtro selecionado' : 'Nenhum ingresso vendido para este evento'}
            descricao={
              busca || filtroStatus !== 'todos' || filtroLote !== 'todos'
                ? 'Tente alterar os termos de pesquisa ou remover os filtros aplicados.'
                : 'Assim que os alunos adquirirem seus ingressos, os comprovantes e informações do comprador aparecerão nesta lista.'
            }
            icone={<Users className="w-7 h-7" />}
            acao={
              busca || filtroStatus !== 'todos' || filtroLote !== 'todos' ? (
                <Botao
                  variante="contorno"
                  onClick={() => {
                    setBusca('');
                    setFiltroStatus('todos');
                    setFiltroLote('todos');
                  }}
                >
                  Limpar Filtros
                </Botao>
              ) : undefined
            }
          />
        )}
      </Cartao>

      {/* MODAL DE DETALHES DO COMPRADOR E INGRESSO */}
      {ingressoSelecionado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-fundo-card border border-borda-sutil rounded-2xl p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-borda-sutil pb-4">
              <h3 className="text-xl font-bold font-titulo text-texto-principal flex items-center gap-2">
                <Ticket className="text-primaria-400" size={22} />
                Detalhes do Comprador
              </h3>
              <button
                onClick={() => {
                  setIngressoSelecionado(null);
                  setConfirmandoCancelamento(false);
                }}
                className="p-1 rounded-lg text-texto-terciario hover:text-texto-principal hover:bg-fundo-hover transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Card do Perfil do Comprador */}
              <div className="p-4 rounded-xl bg-fundo-input border border-borda-sutil flex items-center gap-4">
                {ingressoSelecionado.comprador?.avatar_url ? (
                  <img
                    src={ingressoSelecionado.comprador.avatar_url}
                    alt={ingressoSelecionado.comprador?.nome || 'Comprador'}
                    className="w-14 h-14 rounded-2xl object-cover border border-borda-sutil shrink-0"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primaria-500/20 to-secundaria-500/20 border border-primaria-500/30 text-primaria-400 flex items-center justify-center font-bold text-lg shrink-0">
                    {obterIniciais(ingressoSelecionado.comprador?.nome || 'Anônimo')}
                  </div>
                )}

                <div className="min-w-0 flex-1 space-y-1">
                  <h4 className="font-bold text-base text-texto-principal truncate">
                    {ingressoSelecionado.comprador?.nome || 'Comprador Anônimo'}
                  </h4>
                  <p className="text-xs text-texto-secundario flex items-center gap-1.5 truncate">
                    <Mail size={14} className="text-primaria-400 shrink-0" />
                    {ingressoSelecionado.comprador?.email || 'Sem email cadastrado'}
                  </p>
                  <p className="text-xs text-texto-secundario flex items-center gap-1.5">
                    <Phone size={14} className="text-emerald-400 shrink-0" />
                    {ingressoSelecionado.comprador?.telefone ? formatarTelefone(ingressoSelecionado.comprador.telefone) : <span className="text-texto-terciario">Sem telefone</span>}
                  </p>
                  <p className="text-xs text-texto-secundario flex items-center gap-1.5 font-mono">
                    <CreditCard size={14} className="text-secundaria-400 shrink-0" />
                    {ingressoSelecionado.comprador?.cpf ? (
                      `CPF: ${mascararCPF(ingressoSelecionado.comprador.cpf)}`
                    ) : (
                      <span className="text-texto-terciario font-sans">CPF: Não cadastrado</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Informações do Ingresso Comprado */}
              <div className="p-4 rounded-xl bg-fundo-input/50 border border-borda-sutil space-y-3 text-sm">
                <div className="flex items-center justify-between pb-2 border-b border-borda-sutil">
                  <span className="text-xs text-texto-terciario uppercase font-semibold">Evento</span>
                  <span className="font-bold text-texto-principal">{evento.titulo}</span>
                </div>

                <div className="flex items-center justify-between pb-2 border-b border-borda-sutil">
                  <span className="text-xs text-texto-terciario uppercase font-semibold">Lote Adquirido</span>
                  <div className="text-right">
                    <span className="font-bold text-texto-principal">{ingressoSelecionado.lote?.nome_lote || 'Ingresso'}</span>
                    <span className="text-xs text-primaria-400 ml-2 font-bold">
                      ({ingressoSelecionado.lote?.preco ? formatarMoeda(ingressoSelecionado.lote.preco) : 'Gratuito'})
                    </span>
                  </div>
                </div>

                <div className="pb-2 border-b border-borda-sutil space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-texto-terciario uppercase font-semibold">Status do Ingresso</span>
                    <Distintivo status={ingressoSelecionado.status} />
                  </div>

                  {/* Botão Cancelar Ingresso (para ingressos válidos) */}
                  {ingressoSelecionado.status === 'valido' && !confirmandoCancelamento && (
                    <div className="pt-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setConfirmandoCancelamento(true)}
                        className="py-1.5 px-3 rounded-xl bg-erro/10 hover:bg-erro/20 text-erro border border-erro/20 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                      >
                        <Ban size={14} />
                        <span>Cancelar</span>
                      </button>
                    </div>
                  )}

                  {/* Confirmação de Cancelamento */}
                  {confirmandoCancelamento && (
                    <div className="p-3.5 rounded-xl bg-erro/10 border border-erro/25 space-y-2.5 animate-in fade-in duration-150">
                      <div className="flex items-start gap-2 text-erro text-xs font-medium leading-relaxed">
                        <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                        <span>
                          Tem certeza que deseja cancelar este ingresso? O comprador não poderá mais utilizá-lo para acessar o evento.
                        </span>
                      </div>
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setConfirmandoCancelamento(false)}
                          disabled={processandoCancelamento}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-texto-secundario hover:text-texto-principal hover:bg-fundo-hover transition-colors disabled:opacity-50"
                        >
                          Voltar
                        </button>
                        <Botao
                          tamanho="sm"
                          variante="perigo"
                          onClick={aoCancelarIngresso}
                          carregando={processandoCancelamento}
                          icone={<Ban size={14} />}
                        >
                          Confirmar Cancelamento
                        </Botao>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-texto-terciario uppercase font-semibold">Data da Compra</span>
                  <span className="text-xs font-medium text-texto-principal">
                    {formatarDataHora(ingressoSelecionado.data_compra)}
                  </span>
                </div>

                {ingressoSelecionado.data_validacao && (
                  <div className="flex items-center justify-between pt-2 border-t border-borda-sutil text-xs text-emerald-400">
                    <span>Entrada Validada em:</span>
                    <span className="font-bold">{formatarDataHora(ingressoSelecionado.data_validacao)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-borda-sutil flex justify-end">
              <Botao
                variante="contorno"
                onClick={() => {
                  setIngressoSelecionado(null);
                  setConfirmandoCancelamento(false);
                }}
              >
                Fechar
              </Botao>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
