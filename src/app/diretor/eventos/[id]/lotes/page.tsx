'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Cartao from '@/componentes/ui/Cartao';
import Botao from '@/componentes/ui/Botao';
import CampoTexto from '@/componentes/ui/CampoTexto';
import Distintivo from '@/componentes/ui/Distintivo';
import Carregando from '@/componentes/ui/Carregando';
import EstadoVazio from '@/componentes/ui/EstadoVazio';
import { criarClienteNavegador } from '@/lib/supabase/cliente';
import { useNotificacao } from '@/componentes/ui/Notificacao';
import { formatarMoeda, mascararMoeda, desmascararMoeda } from '@/lib/utilitarios';
import {
  ArrowLeft,
  Ticket,
  Plus,
  Edit,
  Trash2,
  CheckCircle2,
  XCircle,
  Layers,
  DollarSign,
  Users,
  AlertCircle,
  X
} from 'lucide-react';
import type { Evento, LoteIngresso } from '@/tipos';

export default function PaginaGerenciarLotes() {
  const params = useParams();
  const { sucesso, erro: notificarErro } = useNotificacao();
  const supabase = criarClienteNavegador();

  const [evento, setEvento] = useState<Evento | null>(null);
  const [lotes, setLotes] = useState<LoteIngresso[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Modal / Form state
  const [modalAberto, setModalAberto] = useState(false);
  const [loteEdicao, setLoteEdicao] = useState<LoteIngresso | null>(null);
  const [nomeLote, setNomeLote] = useState('');
  const [preco, setPreco] = useState('');
  const [quantidadeTotal, setQuantidadeTotal] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (params.id) {
      buscarDados();
    }
  }, [params.id]);

  async function buscarDados() {
    try {
      const [eventoRes, lotesRes] = await Promise.all([
        supabase.from('eventos').select('id, titulo, status, atletica_id').eq('id', params.id).single(),
        supabase.from('lotes_ingresso').select('id, evento_id, nome_lote, preco, quantidade_total, quantidade_vendida, ordem, ativo').eq('evento_id', params.id).order('ordem', { ascending: true })
      ]);

      if (eventoRes.data) setEvento(eventoRes.data);
      if (lotesRes.data) setLotes(lotesRes.data);
    } catch (err) {
      console.error(err);
      notificarErro('Erro', 'Não foi possível carregar os lotes.');
    } finally {
      setCarregando(false);
    }
  }

  function abrirModalNovoLote() {
    setLoteEdicao(null);
    setNomeLote(`${lotes.length + 1}° Lote`);
    setPreco(mascararMoeda(50));
    setQuantidadeTotal('100');
    setAtivo(true);
    setModalAberto(true);
  }

  function abrirModalEditarLote(lote: LoteIngresso) {
    setLoteEdicao(lote);
    setNomeLote(lote.nome_lote);
    setPreco(mascararMoeda(lote.preco));
    setQuantidadeTotal(lote.quantidade_total.toString());
    setAtivo(lote.ativo);
    setModalAberto(true);
  }

  function fecharModal() {
    setModalAberto(false);
    setLoteEdicao(null);
    setNomeLote('');
    setPreco('');
    setQuantidadeTotal('');
    setAtivo(true);
  }

  async function aoSalvarLote(e: React.FormEvent) {
    e.preventDefault();

    if (!nomeLote.trim()) {
      notificarErro('Campo obrigatório', 'Informe o nome do lote.');
      return;
    }

    const precoNum = desmascararMoeda(preco);
    if (isNaN(precoNum) || precoNum < 0) {
      notificarErro('Preço inválido', 'Informe um valor maior ou igual a zero.');
      return;
    }

    const qtdTotalNum = parseInt(quantidadeTotal, 10);
    if (isNaN(qtdTotalNum) || qtdTotalNum < 1) {
      notificarErro('Quantidade inválida', 'Informe uma quantidade total de no mínimo 1.');
      return;
    }

    if (loteEdicao && qtdTotalNum < loteEdicao.quantidade_vendida) {
      notificarErro('Quantidade inválida', `A quantidade total não pode ser menor do que os ingressos já vendidos (${loteEdicao.quantidade_vendida}).`);
      return;
    }

    setSalvando(true);

    try {
      if (loteEdicao) {
        // Atualização de lote existente
        const { error } = await supabase
          .from('lotes_ingresso')
          .update({
            nome_lote: nomeLote.trim(),
            preco: precoNum,
            quantidade_total: qtdTotalNum,
            ativo,
          })
          .eq('id', loteEdicao.id);

        if (error) throw error;
        sucesso('Lote atualizado!', `O ${nomeLote} foi atualizado com sucesso.`);
      } else {
        // Criação de novo lote
        const { error } = await supabase
          .from('lotes_ingresso')
          .insert({
            evento_id: params.id,
            nome_lote: nomeLote.trim(),
            preco: precoNum,
            quantidade_total: qtdTotalNum,
            quantidade_vendida: 0,
            ordem: lotes.length,
            ativo,
          });

        if (error) throw error;
        sucesso('Novo lote criado!', `O ${nomeLote} foi adicionado ao evento.`);
      }

      fecharModal();
      await buscarDados();
    } catch (err) {
      console.error(err);
      notificarErro('Erro ao salvar', 'Ocorreu um problema ao salvar o lote. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  async function alternarStatusLote(lote: LoteIngresso) {
    try {
      const { error } = await supabase
        .from('lotes_ingresso')
        .update({ ativo: !lote.ativo })
        .eq('id', lote.id);

      if (error) throw error;

      sucesso(
        !lote.ativo ? 'Lote ativado' : 'Lote desativado',
        `O lote "${lote.nome_lote}" foi ${!lote.ativo ? 'ativado' : 'desativado'}.`
      );
      await buscarDados();
    } catch (err) {
      console.error(err);
      notificarErro('Erro', 'Não foi possível alterar o status do lote.');
    }
  }

  async function excluirLote(lote: LoteIngresso) {
    if (lote.quantidade_vendida > 0) {
      notificarErro('Não é possível excluir', 'Este lote já possui ingressos vendidos.');
      return;
    }

    if (!confirm(`Tem certeza que deseja excluir o lote "${lote.nome_lote}"?`)) return;

    try {
      const { error } = await supabase
        .from('lotes_ingresso')
        .delete()
        .eq('id', lote.id);

      if (error) throw error;

      sucesso('Lote excluído', `O lote "${lote.nome_lote}" foi removido.`);
      await buscarDados();
    } catch (err) {
      console.error(err);
      notificarErro('Erro ao excluir', 'Não foi possível remover este lote.');
    }
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center h-96">
        <Carregando tamanho="lg" texto="Carregando lotes de ingressos..." />
      </div>
    );
  }

  if (!evento) {
    return (
      <div className="text-center py-12">
        <p className="text-texto-secundario mb-4">Evento não encontrado.</p>
        <Link href="/diretor/eventos">
          <Botao variante="contorno">Voltar para Meus Eventos</Botao>
        </Link>
      </div>
    );
  }

  const totalIngressos = lotes.reduce((acc, l) => acc + l.quantidade_total, 0);
  const totalVendidos = lotes.reduce((acc, l) => acc + l.quantidade_vendida, 0);
  const receitaEstimada = lotes.reduce((acc, l) => acc + (l.quantidade_vendida * l.preco), 0);

  return (
    <div className="max-w-5xl mx-auto pb-12">
      {/* Botão de voltar */}
      <Link
        href="/diretor/eventos"
        className="inline-flex items-center gap-2 text-sm text-texto-secundario hover:text-texto-principal transition-colors mb-6"
      >
        <ArrowLeft size={16} /> Voltar para Meus Eventos
      </Link>

      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl sm:text-3xl font-black font-titulo">
              Lotes de <span className="gradiente-texto">Ingressos</span>
            </h1>
            <Distintivo status={evento.status} />
          </div>
          <p className="text-texto-secundario">{evento.titulo}</p>
        </div>

        <Botao icone={<Plus size={16} />} onClick={abrirModalNovoLote}>
          Novo Lote
        </Botao>
      </div>

      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Cartao variante="vidro" className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-primaria-500/10 text-primaria-400">
            <Layers size={24} />
          </div>
          <div>
            <p className="text-xs text-texto-terciario uppercase font-semibold tracking-wider">Total de Lotes</p>
            <p className="text-2xl font-black text-texto-principal">{lotes.length}</p>
          </div>
        </Cartao>

        <Cartao variante="vidro" className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-secundaria-500/10 text-secundaria-400">
            <Users size={24} />
          </div>
          <div>
            <p className="text-xs text-texto-terciario uppercase font-semibold tracking-wider">Ingressos Vendidos</p>
            <p className="text-2xl font-black text-texto-principal">
              {totalVendidos} <span className="text-xs font-normal text-texto-terciario">/ {totalIngressos}</span>
            </p>
          </div>
        </Cartao>

        <Cartao variante="vidro" className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400">
            <DollarSign size={24} />
          </div>
          <div>
            <p className="text-xs text-texto-terciario uppercase font-semibold tracking-wider">Receita Atual</p>
            <p className="text-2xl font-black gradiente-texto">{formatarMoeda(receitaEstimada)}</p>
          </div>
        </Cartao>
      </div>

      {/* Lista de Lotes */}
      {lotes.length > 0 ? (
        <div className="space-y-4">
          {lotes.map((lote, index) => {
            const pctVendido = lote.quantidade_total > 0
              ? Math.round((lote.quantidade_vendida / lote.quantidade_total) * 100)
              : 0;

            return (
              <Cartao key={lote.id} variante="vidro" className="relative overflow-hidden transition-all hover:border-borda-media">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  {/* Info Principal */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xs px-2 py-0.5 rounded-md font-bold bg-fundo-input border border-borda-sutil text-texto-terciario">
                        #{index + 1}
                      </span>
                      <h3 className="font-bold text-lg text-texto-principal truncate">{lote.nome_lote}</h3>
                      {lote.ativo ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                          <CheckCircle2 size={12} /> Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-texto-terciario/10 text-texto-terciario border border-borda-sutil font-medium">
                          <XCircle size={12} /> Inativo
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-3 text-sm">
                      <div>
                        <p className="text-xs text-texto-terciario">Preço unitário</p>
                        <p className="font-bold text-primaria-400">{formatarMoeda(lote.preco)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-texto-terciario">Vendidos / Total</p>
                        <p className="font-semibold text-texto-principal">
                          {lote.quantidade_vendida} / {lote.quantidade_total}
                        </p>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <p className="text-xs text-texto-terciario mb-1">Ocupação ({pctVendido}%)</p>
                        <div className="w-full h-2 bg-fundo-principal rounded-full overflow-hidden border border-borda-sutil">
                          <div
                            className="h-full bg-gradient-to-r from-primaria-500 to-secundaria-500 rounded-full transition-all duration-300"
                            style={{ width: `${pctVendido}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-2 pt-3 sm:pt-0 border-t sm:border-t-0 border-borda-sutil flex-shrink-0">
                    <Botao
                      variante="fantasma"
                      tamanho="sm"
                      onClick={() => alternarStatusLote(lote)}
                      title={lote.ativo ? 'Desativar Lote' : 'Ativar Lote'}
                    >
                      {lote.ativo ? 'Desativar' : 'Ativar'}
                    </Botao>

                    <Botao
                      variante="contorno"
                      tamanho="sm"
                      icone={<Edit size={14} />}
                      onClick={() => abrirModalEditarLote(lote)}
                    >
                      Editar
                    </Botao>

                    <button
                      type="button"
                      onClick={() => excluirLote(lote)}
                      disabled={lote.quantidade_vendida > 0}
                      title={lote.quantidade_vendida > 0 ? 'Não é possível excluir lote com vendas' : 'Excluir Lote'}
                      className="p-2 rounded-xl text-texto-terciario hover:text-erro hover:bg-erro/10 disabled:opacity-30 disabled:hover:text-texto-terciario disabled:hover:bg-transparent transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </Cartao>
            );
          })}
        </div>
      ) : (
        <EstadoVazio
          titulo="Nenhum lote cadastrado"
          descricao="Este evento ainda não possui lotes de ingressos à venda. Crie o primeiro lote para que os alunos possam comprar ingressos."
          icone={<Ticket className="w-7 h-7" />}
          acao={
            <Botao icone={<Plus size={16} />} onClick={abrirModalNovoLote}>
              Criar Primeiro Lote
            </Botao>
          }
        />
      )}

      {/* Modal para Adicionar / Editar Lote */}
      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-fundo-card border border-borda-sutil rounded-2xl p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-borda-sutil pb-4">
              <h3 className="text-xl font-bold font-titulo text-texto-principal flex items-center gap-2">
                <Ticket className="text-primaria-400" size={22} />
                {loteEdicao ? 'Editar Lote' : 'Novo Lote de Ingressos'}
              </h3>
              <button
                onClick={fecharModal}
                className="p-1 rounded-lg text-texto-terciario hover:text-texto-principal hover:bg-fundo-hover transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={aoSalvarLote} className="space-y-4">
              <CampoTexto
                rotulo="Nome do lote"
                placeholder="Ex: 1° Lote"
                value={nomeLote}
                onChange={(e) => setNomeLote((e.target as HTMLInputElement).value)}
                required
              />

              <p className="text-xs text-texto-secundario">
                Defina o valor unitário cobrado por ingresso (R$) e a quantidade máxima de ingressos liberados para venda neste lote.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <CampoTexto
                  rotulo="Preço por ingresso"
                  placeholder="R$ 0,00"
                  type="text"
                  value={preco}
                  onChange={(e) => setPreco(mascararMoeda((e.target as HTMLInputElement).value))}
                  required
                />
                <CampoTexto
                  rotulo="Quantidade total"
                  placeholder="100"
                  type="number"
                  min="1"
                  value={quantidadeTotal}
                  onChange={(e) => setQuantidadeTotal((e.target as HTMLInputElement).value)}
                  required
                />
              </div>

              {loteEdicao && loteEdicao.quantidade_vendida > 0 && (
                <div className="p-3 rounded-xl bg-primaria-500/10 border border-primaria-500/20 text-xs text-primaria-300 flex items-start gap-2">
                  <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                  <span>
                    Este lote já possui <strong>{loteEdicao.quantidade_vendida}</strong> ingresso(s) vendido(s). A quantidade total não pode ser menor que o total já vendido.
                  </span>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="loteAtivo"
                  checked={ativo}
                  onChange={(e) => setAtivo(e.target.checked)}
                  className="w-4 h-4 rounded border-borda-sutil text-primaria-500 focus:ring-primaria-500 bg-fundo-input cursor-pointer"
                />
                <label htmlFor="loteAtivo" className="text-sm font-medium text-texto-principal cursor-pointer">
                  Disponibilizar lote para venda imediatamente (Ativo)
                </label>
              </div>

              <div className="flex items-center gap-3 pt-4 border-t border-borda-sutil">
                <Botao
                  type="button"
                  variante="contorno"
                  onClick={fecharModal}
                  className="flex-1"
                >
                  Cancelar
                </Botao>
                <Botao
                  type="submit"
                  carregando={salvando}
                  className="flex-1"
                >
                  {loteEdicao ? 'Salvar Alterações' : 'Criar Lote'}
                </Botao>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
