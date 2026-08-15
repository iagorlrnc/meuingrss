'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Cartao from '@/componentes/ui/Cartao';
import Botao from '@/componentes/ui/Botao';
import EstadoVazio from '@/componentes/ui/EstadoVazio';
import Distintivo from '@/componentes/ui/Distintivo';
import Carregando from '@/componentes/ui/Carregando';
import { criarClienteNavegador } from '@/lib/supabase/cliente';
import { usarAutenticacao } from '@/contextos/ContextoAutenticacao';
import { useNotificacao } from '@/componentes/ui/Notificacao';
import { formatarDataCurta, formatarMoeda } from '@/lib/utilitarios';
import { CalendarPlus, BarChart3, Edit, Eye, Plus, Ticket, Trash2, AlertTriangle, X } from 'lucide-react';

import type { Evento, LoteIngresso } from '@/tipos';

export default function PaginaEventosDiretor() {
  const { perfil, carregando: carregandoAuth } = usarAutenticacao();
  const { sucesso, erro: notificarErro } = useNotificacao();
  const [eventos, setEventos] = useState<(Evento & { lotes_ingresso?: LoteIngresso[] })[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [eventoParaApagar, setEventoParaApagar] = useState<(Evento & { lotes_ingresso?: LoteIngresso[] }) | null>(null);
  const [processandoApagar, setProcessandoApagar] = useState(false);
  const supabase = criarClienteNavegador();

  useEffect(() => {
    if (!carregandoAuth) {
      buscar();
    }
  }, [carregandoAuth, perfil]);

  async function buscar() {
    setCarregando(true);
    try {
      if (!perfil) {
        setCarregando(false);
        return;
      }

      let idAtletica = perfil.atletica_id;

      if (!idAtletica && perfil.id) {
        const { data: usuarioPerfil } = await supabase
          .from('profiles')
          .select('atletica_id')
          .eq('id', perfil.id)
          .maybeSingle();

        if (usuarioPerfil?.atletica_id) {
          idAtletica = usuarioPerfil.atletica_id;
        }
      }

      let query = supabase
        .from('eventos')
        .select('*, lotes_ingresso(*)')
        .eq('apagado_pelo_diretor', false)
        .order('criado_em', { ascending: false });

      if (idAtletica) {
        query = query.eq('atletica_id', idAtletica);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Erro ao buscar eventos do diretor:', error);
      }
      if (data) {
        setEventos((data as (Evento & { lotes_ingresso?: LoteIngresso[] })[]).filter((e) => !e.apagado_pelo_diretor));
      }
    } catch {
      // Ignorar erros no client
    } finally {
      setCarregando(false);
    }
  }

  function tentarApagarEvento(e: Evento & { lotes_ingresso?: LoteIngresso[] }) {
    setEventoParaApagar(e);
  }

  async function aoConfirmarApagar() {
    if (!eventoParaApagar) return;

    setProcessandoApagar(true);

    try {
      const { error } = await supabase
        .from('eventos')
        .update({ apagado_pelo_diretor: true })
        .eq('id', eventoParaApagar.id);

      if (error) throw error;

      setEventos(prev => prev.filter(ev => ev.id !== eventoParaApagar.id));
      sucesso(
        'Evento apagado com sucesso',
        `O evento "${eventoParaApagar.titulo}" foi removido do seu painel do diretor.`
      );
    } catch (err: unknown) {
      const mensagem = err instanceof Error ? err.message : 'Ocorreu um erro ao tentar apagar o evento.';
      notificarErro('Erro ao apagar evento', mensagem);
    } finally {
      setProcessandoApagar(false);
      setEventoParaApagar(null);
    }
  }

  if (carregando || carregandoAuth) return <div className="flex items-center justify-center h-96"><Carregando tamanho="lg" texto="Carregando eventos..." /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black font-titulo">Meus <span className="gradiente-texto">Eventos</span></h1>
          <p className="text-texto-secundario mt-1">{eventos.length} evento(s) criado(s)</p>
        </div>
        <Link href="/diretor/eventos/novo"><Botao icone={<CalendarPlus size={16} />}>Novo Evento</Botao></Link>
      </div>

      {eventos.length > 0 ? (
        <div className="space-y-4">
          {eventos.map(e => {
            const vendidos = e.lotes_ingresso?.reduce((a: number, l: LoteIngresso) => a + l.quantidade_vendida, 0) || 0;
            const receita = e.lotes_ingresso?.reduce((a: number, l: LoteIngresso) => a + l.quantidade_vendida * l.preco, 0) || 0;
            const capaUrl = e.imagem_url;
            const ehPublicado = e.status === 'publicado';

            return (
              <Cartao key={e.id} variante="vidro" className="flex flex-col sm:flex-row sm:items-center gap-4">
                {capaUrl ? (
                  <img src={capaUrl} alt={e.titulo} className="w-16 h-16 rounded-xl object-cover border border-borda-sutil shrink-0" />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-primaria-500/10 text-primaria-400 flex items-center justify-center shrink-0 border border-primaria-500/20">
                    <Ticket size={24} />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold texto-limitado-1">{e.titulo}</h3>
                    <Distintivo status={e.status} />
                  </div>
                  <p className="text-sm text-texto-secundario">{formatarDataCurta(e.data_evento)} • {e.local}</p>
                  <div className="flex gap-4 mt-2 text-xs text-texto-terciario">
                    <span>{vendidos} vendidos</span>
                    <span>Receita: {formatarMoeda(receita)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <Link href={`/diretor/eventos/${e.slug || e.id}/vendas`}><Botao variante="contorno" tamanho="sm" icone={<BarChart3 size={14} />}>Vendas</Botao></Link>
                  <Link href={`/diretor/eventos/${e.slug || e.id}/lotes`}><Botao variante="contorno" tamanho="sm" icone={<Ticket size={14} />}>Lotes</Botao></Link>
                  <Link href={`/diretor/eventos/${e.slug || e.id}/editar`}><Botao variante="fantasma" tamanho="sm" icone={<Edit size={14} />}>Editar</Botao></Link>
                  
                  <button
                    type="button"
                    onClick={() => tentarApagarEvento(e)}
                    disabled={ehPublicado}
                    title={ehPublicado ? 'É impossível apagar um evento publicado' : 'Apagar evento'}
                    className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
                      ehPublicado
                        ? 'opacity-40 cursor-not-allowed bg-fundo-elevado border-borda-sutil text-texto-terciario'
                        : 'bg-erro/10 border-erro/20 text-erro hover:bg-erro hover:text-white'
                    }`}
                  >
                    <Trash2 size={14} />
                    <span>Apagar</span>
                  </button>
                </div>
              </Cartao>
            );
          })}
        </div>
      ) : (
        <EstadoVazio
          titulo="Nenhum evento encontrado no momento"
          descricao="Sua atlética ainda não possui eventos cadastrados. Clique no botão abaixo para publicar o primeiro evento!"
          icone={<CalendarPlus className="w-7 h-7" />}
          acao={
            <Link href="/diretor/eventos/novo">
              <Botao icone={<Plus size={16} />}>Criar Novo Evento</Botao>
            </Link>
          }
        />
      )}

      {/* Modal de Confirmação para Apagar Evento */}
      {eventoParaApagar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-fundo-card border border-borda-sutil rounded-2xl p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-borda-sutil pb-4">
              <h3 className="text-xl font-bold font-titulo text-erro flex items-center gap-2">
                <AlertTriangle size={22} className="text-erro" />
                Apagar Evento
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
                Tem certeza que deseja apagar o evento <strong className="text-white">"{eventoParaApagar.titulo}"</strong>?
              </p>

              <div className="p-3 rounded-xl bg-erro/10 border border-erro/20 text-xs text-erro leading-relaxed">
                Este evento será removido permanentemente da lista de eventos do seu painel de diretor. O registro histórico continuará constando no painel administrativo.
              </div>

              <div className="text-xs text-texto-terciario flex items-center gap-2 pt-1">
                <span>Status atual:</span>
                <Distintivo status={eventoParaApagar.status} />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-4 border-t border-borda-sutil">
              <Botao
                type="button"
                variante="contorno"
                onClick={() => setEventoParaApagar(null)}
                className="flex-1"
              >
                Cancelar
              </Botao>
              <Botao
                type="button"
                variante="perigo"
                carregando={processandoApagar}
                onClick={aoConfirmarApagar}
                className="flex-1"
                icone={<Trash2 size={16} />}
              >
                Apagar Evento
              </Botao>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
