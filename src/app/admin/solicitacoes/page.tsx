'use client';

import { useState, useEffect } from 'react';
import Botao from '@/componentes/ui/Botao';
import EstadoVazio from '@/componentes/ui/EstadoVazio';
import CampoTexto from '@/componentes/ui/CampoTexto';
import Carregando from '@/componentes/ui/Carregando';
import { criarClienteNavegador } from '@/lib/supabase/cliente';
import { useNotificacao } from '@/componentes/ui/Notificacao';
import { formatarDataCurta, obterIniciais } from '@/lib/utilitarios';
import type { Perfil, Atletica } from '@/tipos';
import {
  Check,
  X,
  Building2,
  User,
  Mail,
  Phone,
  Shield,
  Clock,
  Search,
  ClipboardList,
  CheckCircle2,
  MapPin,
} from 'lucide-react';

interface SolicitacaoItem {
  perfil: Perfil;
  atletica: Atletica | null;
}

export default function PaginaSolicitacoesAdmin() {
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [processandoId, setProcessandoId] = useState<string | null>(null);

  const supabase = criarClienteNavegador();
  const { sucesso, erro } = useNotificacao();

  async function buscarSolicitacoes() {
    setCarregando(true);

    try {
      // 1. Busca perfis com role 'diretor' ou status 'pendente'
      const { data: perfis, error: errPerfis } = await supabase
        .from('profiles')
        .select('*, atletica:atleticas(*)')
        .or('role.eq.diretor,status.eq.pendente')
        .order('criado_em', { ascending: false });

      if (errPerfis) {
        console.error('Erro ao buscar solicitações de perfis:', errPerfis);
      }

      // 2. Busca perfis cujas atléticas vinculadas estejam pendentes
      const { data: perfisAtlPendente } = await supabase
        .from('profiles')
        .select('*, atletica:atleticas!inner(*)')
        .eq('atletica.status', 'pendente')
        .order('criado_em', { ascending: false });

      const mapaItens = new Map<string, SolicitacaoItem>();

      (perfis || []).forEach((p: any) => {
        if (p.status === 'pendente' || p.role === 'diretor' || p.atletica?.status === 'pendente') {
          mapaItens.set(p.id, { perfil: p, atletica: p.atletica || null });
        }
      });

      (perfisAtlPendente || []).forEach((p: any) => {
        if (!mapaItens.has(p.id)) {
          mapaItens.set(p.id, { perfil: p, atletica: p.atletica || null });
        }
      });

      setSolicitacoes(Array.from(mapaItens.values()));
    } catch (err) {
      console.error('Exceção ao buscar solicitações:', err);
      setSolicitacoes([]);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    buscarSolicitacoes();
  }, []);


  async function aprovarSolicitacao(perfilId: string, atleticaId: string | null) {
    setProcessandoId(perfilId);

    try {
      let idAtleticaEfetiva = atleticaId;

      // Se o diretor não possuir uma atlética vinculada, cria uma atlética ativa automaticamente
      if (!idAtleticaEfetiva) {
        const { data: perfData } = await supabase
          .from('profiles')
          .select('nome')
          .eq('id', perfilId)
          .single();

        const nomeAtl = perfData?.nome ? `Atlética de ${perfData.nome}` : 'Nova Atlética';

        const { data: novAtl, error: errCriar } = await supabase
          .from('atleticas')
          .insert({
            nome: nomeAtl,
            faculdade: nomeAtl,
            cidade: 'Palmas',
            estado: 'TO',
            status: 'ativa',
          })
          .select('id')
          .single();

        if (novAtl) {
          idAtleticaEfetiva = novAtl.id;
        } else if (errCriar) {
          console.error('Erro ao criar atlética na aprovação:', errCriar);
        }
      } else {
        // Ativar a atlética já vinculada
        const { error: errAtl } = await supabase
          .from('atleticas')
          .update({ status: 'ativa' })
          .eq('id', idAtleticaEfetiva);

        if (errAtl) {
          console.error('Erro ao ativar atlética:', errAtl);
        }
      }

      // Ativar perfil do Diretor vinculando a atlética
      const { error: errPerfil } = await supabase
        .from('profiles')
        .update({
          status: 'ativo',
          role: 'diretor',
          ...(idAtleticaEfetiva ? { atletica_id: idAtleticaEfetiva } : {}),
        })
        .eq('id', perfilId);

      if (errPerfil) {
        console.error('Erro ao aprovar perfil:', errPerfil);
        erro('Erro ao Aprovar', `Não foi possível aprovar a solicitação: ${errPerfil.message}`);
      } else {
        sucesso(
          'Solicitação Aprovada!',
          'A Atlética e o Diretor foram ativados com sucesso e vinculados ao sistema.'
        );
        buscarSolicitacoes();
      }
    } catch (errCatch) {
      console.error('Exceção ao aprovar solicitação:', errCatch);
      erro('Erro ao Aprovar', 'Ocorreu uma exceção ao processar a aprovação.');
    } finally {
      setProcessandoId(null);
    }
  }

  async function rejeitarSolicitacao(perfilId: string, atleticaId: string | null) {
    setProcessandoId(perfilId);

    try {
      if (atleticaId) {
        await supabase
          .from('atleticas')
          .update({ status: 'inativa' })
          .eq('id', atleticaId);
      }

      const { error: errPerfil } = await supabase
        .from('profiles')
        .update({ status: 'bloqueado' })
        .eq('id', perfilId);

      if (errPerfil) {
        erro('Erro ao Rejeitar', `Não foi possível rejeitar a solicitação: ${errPerfil.message}`);
      } else {
        sucesso('Solicitação Recusada', 'A solicitação de cadastro foi recusada.');
        buscarSolicitacoes();
      }
    } catch (errCatch) {
      console.error('Exceção ao recusar solicitação:', errCatch);
      erro('Erro ao Rejeitar', 'Ocorreu uma exceção ao processar a rejeição.');
    } finally {
      setProcessandoId(null);
    }
  }

  const filtrados = solicitacoes.filter((s) => {
    const termo = busca.toLowerCase();
    return (
      s.perfil.nome?.toLowerCase().includes(termo) ||
      s.perfil.email.toLowerCase().includes(termo) ||
      s.atletica?.nome?.toLowerCase().includes(termo) ||
      s.atletica?.cidade?.toLowerCase().includes(termo)
    );
  });

  if (carregando) {
    return (
      <div className="flex items-center justify-center h-96">
        <Carregando tamanho="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 text-xs font-bold uppercase tracking-wider mb-2">
            <ClipboardList size={14} /> Credenciamento & Pedidos
          </div>
          <h1 className="text-2xl sm:text-3xl font-black font-titulo text-white">
            Solicitações de <span className="text-amber-400">Cadastro</span>
          </h1>
          <p className="text-xs sm:text-sm text-texto-secundario mt-1">
            Aprovação de novos Diretores e Atléticas pendentes no sistema.
          </p>
        </div>

        <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-bold">
          <Clock size={16} />
          {solicitacoes.length} solicitação(ões) pendente(s)
        </span>
      </div>

      {/* Campo de Busca */}
      <div className="max-w-md">
        <CampoTexto
          placeholder="Buscar por diretor, email ou atlética..."
          value={busca}
          onChange={(e) => setBusca((e.target as HTMLInputElement).value)}
          icone={<Search size={18} />}
        />
      </div>

      {/* Grid de Solicitações */}
      {filtrados.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filtrados.map(({ perfil, atletica }) => (
            <div
              key={perfil.id}
              className="vidro-forte rounded-2xl p-6 border border-white/10 shadow-xl space-y-5 relative overflow-hidden bg-[#0d1322]/80 backdrop-blur-xl hover:border-amber-500/40 transition-all"
            >
              {/* Top Banner / Status */}
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white font-black text-sm shadow-md">
                    {obterIniciais(perfil.nome || 'D')}
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base leading-snug">
                      {perfil.nome || 'Diretor sem Nome'}
                    </h3>
                    <p className="text-xs text-slate-400 flex items-center gap-1">
                      <Mail size={12} className="text-amber-400" /> {perfil.email}
                    </p>
                  </div>
                </div>

                <span className="px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[11px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 shadow">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                  Pendente
                </span>
              </div>

              {/* Informações em 2 colunas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                {/* Coluna 1: Dados do Diretor */}
                <div className="bg-[#162036]/60 p-3.5 rounded-xl border border-white/10 space-y-2">
                  <h4 className="font-extrabold uppercase tracking-wider text-slate-300 flex items-center gap-1.5 text-[11px]">
                    <User size={14} className="text-amber-400" /> Dados Pessoais
                  </h4>
                  {perfil.telefone && (
                    <p className="text-slate-300 flex items-center gap-1.5">
                      <Phone size={13} className="text-slate-400 shrink-0" />
                      <span>{perfil.telefone}</span>
                    </p>
                  )}
                  <p className="text-slate-300 flex items-center gap-1.5">
                    <Clock size={13} className="text-slate-400 shrink-0" />
                    <span>Cadastrado em {formatarDataCurta(perfil.criado_em)}</span>
                  </p>
                </div>

                {/* Coluna 2: Dados da Atlética */}
                <div className="bg-[#162036]/60 p-3.5 rounded-xl border border-white/10 space-y-2">
                  <h4 className="font-extrabold uppercase tracking-wider text-slate-300 flex items-center gap-1.5 text-[11px]">
                    <Building2 size={14} className="text-primaria-400" /> Dados da Atlética
                  </h4>
                  {atletica ? (
                    <>
                      <p className="font-bold text-white text-sm">{atletica.nome}</p>
                      {atletica.faculdade && (
                        <p className="text-slate-300 flex items-center gap-1.5">
                          <Shield size={13} className="text-slate-400 shrink-0" />
                          <span>{atletica.faculdade}</span>
                        </p>
                      )}
                      {atletica.cidade && (
                        <p className="text-slate-300 flex items-center gap-1.5">
                          <MapPin size={13} className="text-slate-400 shrink-0" />
                          <span>{atletica.cidade}</span>
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-slate-400 italic">Nenhuma atlética associada</p>
                  )}
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="pt-4 border-t border-white/10 flex items-center justify-end gap-3">
                <Botao
                  variante="perigo"
                  tamanho="sm"
                  onClick={() => rejeitarSolicitacao(perfil.id, atletica?.id || null)}
                  carregando={processandoId === perfil.id}
                  icone={<X size={16} />}
                >
                  Recusar
                </Botao>

                <Botao
                  variante="sucesso"
                  tamanho="sm"
                  onClick={() => aprovarSolicitacao(perfil.id, atletica?.id || null)}
                  carregando={processandoId === perfil.id}
                  icone={<Check size={16} />}
                >
                  Aprovar Atlética & Diretor
                </Botao>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EstadoVazio
          titulo="Nenhuma solicitação pendente no momento"
          descricao={
            busca
              ? `Nenhuma solicitação corresponde aos termos da pesquisa "${busca}".`
              : 'Não há diretores ou atléticas aguardando aprovação no sistema.'
          }
          icone={<CheckCircle2 className="w-8 h-8 text-emerald-400" />}
        />
      )}
    </div>
  );
}
