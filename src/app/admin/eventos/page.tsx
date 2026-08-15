'use client';

import { useState, useEffect } from 'react';
import Cartao from '@/componentes/ui/Cartao';
import Botao from '@/componentes/ui/Botao';
import EstadoVazio from '@/componentes/ui/EstadoVazio';
import Distintivo from '@/componentes/ui/Distintivo';
import CampoTexto from '@/componentes/ui/CampoTexto';
import Carregando from '@/componentes/ui/Carregando';
import { criarClienteNavegador } from '@/lib/supabase/cliente';
import { useNotificacao } from '@/componentes/ui/Notificacao';
import { formatarDataCurta } from '@/lib/utilitarios';
import { Search, Ban, CheckCircle, CalendarDays } from 'lucide-react';
import type { Evento } from '@/tipos';

export default function PaginaGestaoEventos() {
  const [eventos, setEventos] = useState<(Evento & { atletica?: { nome: string } })[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const supabase = criarClienteNavegador();
  const { sucesso } = useNotificacao();

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
                    <td className="px-6 py-4 text-sm font-medium">{e.titulo}</td>
                    <td className="px-6 py-4 text-sm text-texto-secundario">{e.atletica?.nome}</td>
                    <td className="px-6 py-4 text-sm text-texto-secundario">{formatarDataCurta(e.data_evento)}</td>
                    <td className="px-6 py-4 flex items-center gap-2 flex-wrap">
                      <Distintivo status={e.status} />
                      {e.apagado_pelo_diretor && (
                        <Distintivo
                          texto="Apagado pelo diretor da atlética"
                          cor="text-amber-400 bg-amber-400/10 border-amber-400/20 font-bold"
                        />
                      )}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      {e.status === 'rascunho' && <Botao variante="sucesso" tamanho="sm" onClick={() => alterarStatus(e.id, 'publicado')} icone={<CheckCircle size={14} />}>Aprovar</Botao>}
                      {e.status === 'publicado' && <Botao variante="perigo" tamanho="sm" onClick={() => alterarStatus(e.id, 'cancelado')} icone={<Ban size={14} />}>Cancelar</Botao>}
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
    </div>
  );
}
