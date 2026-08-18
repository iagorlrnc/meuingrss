'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Cartao from '@/componentes/ui/Cartao';
import Botao from '@/componentes/ui/Botao';
import EstadoVazio from '@/componentes/ui/EstadoVazio';
import Distintivo from '@/componentes/ui/Distintivo';
import CampoTexto from '@/componentes/ui/CampoTexto';
import Carregando from '@/componentes/ui/Carregando';
import { criarClienteNavegador } from '@/lib/supabase/cliente';
import { useNotificacao } from '@/componentes/ui/Notificacao';
import { formatarDataCurta } from '@/lib/utilitarios';
import { Search, Ban, CheckCircle, CalendarDays, Trash2, AlertTriangle, X } from 'lucide-react';
import type { Evento } from '@/tipos';

export default function PaginaGestaoEventos() {
  const [eventos, setEventos] = useState<(Evento & { atletica?: { nome: string } })[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [eventoParaApagar, setEventoParaApagar] = useState<(Evento & { atletica?: { nome: string } }) | null>(null);
  const [processandoApagar, setProcessandoApagar] = useState(false);
  const supabase = criarClienteNavegador();
  const { sucesso, erro: notificarErro } = useNotificacao();

  async function buscar() {
    const { data } = await supabase
      .from('eventos')
      .select('*, atletica:atleticas(nome)')
      .order('criado_em', { ascending: false })
      .limit(100);
    if (data) setEventos(data as unknown as (Evento & { atletica?: { nome: string } })[]);
    setCarregando(false);
  }

  useEffect(() => { buscar(); }, []);

  async function alterarStatus(id: string, status: string) {
    await supabase.from('eventos').update({ status }).eq('id', id);
    sucesso('Status atualizado');
    buscar();
  }

  async function aoConfirmarApagarPermanente() {
    if (!eventoParaApagar) return;
    setProcessandoApagar(true);

    try {
      const { error } = await supabase
        .from('eventos')
        .delete()
        .eq('id', eventoParaApagar.id);

      if (error) throw error;

      setEventos(prev => prev.filter(ev => ev.id !== eventoParaApagar.id));
      sucesso(
        'Evento apagado com sucesso',
        `O evento "${eventoParaApagar.titulo}" e todos os ingressos vinculados foram apagados permanentemente.`
      );
    } catch (err: unknown) {
      const mensagem = err instanceof Error ? err.message : 'Ocorreu um erro ao tentar apagar o evento permanentemente.';
      notificarErro('Erro ao apagar evento', mensagem);
    } finally {
      setProcessandoApagar(false);
      setEventoParaApagar(null);
    }
  }

  const filtrados = eventos.filter(e => !busca || e.titulo.toLowerCase().includes(busca.toLowerCase()));

  if (carregando) return <div className="flex items-center justify-center h-96"><Carregando tamanho="lg" /></div>;

  return (
    <div>
      <h1 className="text-2xl sm:text-3xl font-black font-titulo mb-2">Gestão de <span className="gradiente-texto">Eventos</span></h1>
      <p className="text-texto-secundario mb-8">{eventos.length} eventos no total</p>

      <div className="mb-6">
        <CampoTexto placeholder="Buscar evento..." value={busca} onChange={e => setBusca((e.target as HTMLInputElement).value)} icone={<Search size={18} />} />
      </div>

      <Cartao variante="vidro" semPadding>
        <div className="overflow-x-auto">
          {filtrados.length > 0 ? (
            <table className="w-full">
              <thead>
                <tr className="border-b border-borda-sutil">
                  <th className="text-left text-xs font-medium text-texto-terciario px-6 py-4">Evento</th>
                  <th className="text-left text-xs font-medium text-texto-terciario px-6 py-4">Atlética</th>
                  <th className="text-left text-xs font-medium text-texto-terciario px-6 py-4">Data</th>
                  <th className="text-left text-xs font-medium text-texto-terciario px-6 py-4">Status</th>
                  <th className="text-right text-xs font-medium text-texto-terciario px-6 py-4">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(e => (
                  <tr key={e.id} className="border-b border-borda-sutil/50 hover:bg-fundo-hover/50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium">
                      <Link href={`/eventos/${e.slug || e.id}`} target="_blank" className="hover:underline hover:text-[#00e5ff] transition-colors">
                        {e.titulo}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-sm text-texto-secundario">{e.atletica?.nome}</td>
                    <td className="px-6 py-4 text-sm text-texto-secundario">{formatarDataCurta(e.data_evento)}</td>
                    <td className="px-6 py-4 flex items-center gap-2 flex-wrap">
                      <Distintivo status={e.status} />
                      {e.apagado_pelo_diretor && (
                        <Distintivo
                          texto="Apagado pelo Diretor"
                          cor="text-red-400 bg-red-950/80 border-red-800/40 font-black uppercase tracking-wider"
                        />
                      )}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      {e.status === 'rascunho' && <Botao variante="sucesso" tamanho="sm" onClick={() => alterarStatus(e.id, 'publicado')} icone={<CheckCircle size={14} />}>Aprovar</Botao>}
                      {e.status === 'publicado' && <Botao variante="perigo" tamanho="sm" onClick={() => alterarStatus(e.id, 'cancelado')} icone={<Ban size={14} />}>Cancelar</Botao>}
                      {e.apagado_pelo_diretor && (
                        <Botao
                          variante="perigo"
                          tamanho="sm"
                          onClick={() => setEventoParaApagar(e)}
                          icone={<Trash2 size={14} />}
                        >
                          Apagar
                        </Botao>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EstadoVazio
              titulo="Nenhum evento encontrado no momento"
              descricao={busca ? `Nenhum evento coincide com a pesquisa "${busca}".` : "Não há eventos registrados no sistema até o momento."}
              icone={<CalendarDays className="w-7 h-7" />}
            />
          )}
        </div>
      </Cartao>

      {/* Modal de Confirmação para Apagar Evento Permanentemente */}
      {eventoParaApagar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-fundo-card border border-borda-sutil rounded-2xl p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-borda-sutil pb-4">
              <h3 className="text-xl font-bold font-titulo text-erro flex items-center gap-2">
                <AlertTriangle size={22} className="text-erro" />
                Apagar Evento Permanentemente
              </h3>
              <button
                onClick={() => setEventoParaApagar(null)}
                className="p-1 rounded-lg text-texto-terciario hover:text-texto-principal hover:bg-fundo-hover transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-sm text-texto-principal">
                Tem certeza que deseja apagar permanentemente o evento <strong className="text-white">&quot;{eventoParaApagar.titulo}&quot;</strong>?
              </p>

              <div className="p-3.5 rounded-xl bg-erro/10 border border-erro/20 text-xs text-erro leading-relaxed space-y-1.5">
                <p className="font-bold">⚠️ Atenção: Esta ação é definitiva e irreversível!</p>
                <p>
                  O evento e todos os <strong>ingressos vinculados</strong>, lotes, registros de pedidos e pagamentos serão <strong>apagados permanentemente</strong> do banco de dados.
                </p>
              </div>

              <div className="text-xs text-texto-terciario flex items-center gap-2 pt-1">
                <span>Atlética:</span>
                <span className="font-medium text-texto-secundario">{eventoParaApagar.atletica?.nome || 'Não informada'}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-4 border-t border-borda-sutil">
              <Botao
                type="button"
                variante="contorno"
                onClick={() => setEventoParaApagar(null)}
                className="flex-1"
                disabled={processandoApagar}
              >
                Cancelar
              </Botao>
              <Botao
                type="button"
                variante="perigo"
                carregando={processandoApagar}
                onClick={aoConfirmarApagarPermanente}
                className="flex-1"
                icone={<Trash2 size={16} />}
              >
                Apagar Definitivamente
              </Botao>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
