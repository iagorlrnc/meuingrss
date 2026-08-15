'use client';

import { useState, useEffect } from 'react';
import Cartao from '@/componentes/ui/Cartao';
import Distintivo from '@/componentes/ui/Distintivo';
import Carregando from '@/componentes/ui/Carregando';
import Botao from '@/componentes/ui/Botao';
import CampoTexto from '@/componentes/ui/CampoTexto';
import { criarClienteNavegador } from '@/lib/supabase/cliente';
import { usarAutenticacao } from '@/contextos/ContextoAutenticacao';
import { formatarMoeda, formatarDataCurta } from '@/lib/utilitarios';
import {
  Users,
  Shield,
  CalendarDays,
  DollarSign,
  TrendingUp,
  Ticket,
  Activity,
  Mail,
  Lock,
  ArrowLeft,
  Settings,
} from 'lucide-react';
import Link from 'next/link';

import type { Evento } from '@/tipos';

export default function DashboardAdmin() {
  const { usuario, perfil, entrar, carregando: carregandoAuth } = usarAutenticacao();
  const [stats, setStats] = useState({
    totalUsuarios: 0,
    totalEventos: 0,
    totalAtleticas: 0,
    totalVendas: 0,
    volumeFinanceiro: 0,
    eventosAtivos: 0,
  });
  const [eventosRecentes, setEventosRecentes] = useState<(Evento & { atletica?: { nome: string } })[]>([]);
  const [carregandoDados, setCarregandoDados] = useState(true);

  
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erroLogin, setErroLogin] = useState('');
  const [processandoLogin, setProcessandoLogin] = useState(false);

  const supabase = criarClienteNavegador();

  async function buscarDados() {
    const [usuarios, eventos, atleticas, ingressos, pagamentos, eventosAtivos, recentesRes] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('eventos').select('id', { count: 'exact', head: true }),
      supabase.from('atleticas').select('id', { count: 'exact', head: true }),
      supabase.from('ingressos').select('id', { count: 'exact', head: true }),
      supabase.from('pagamentos').select('valor').eq('status', 'aprovado'),
      supabase.from('eventos').select('id', { count: 'exact', head: true }).eq('status', 'publicado'),
      supabase
        .from('eventos')
        .select('id, slug, titulo, status, criado_em, apagado_pelo_diretor, atletica:atleticas(nome)')
        .order('criado_em', { ascending: false })
        .limit(5),
    ]);

    const volume = pagamentos.data?.reduce((acc: number, p: { valor?: number }) => acc + Number(p.valor || 0), 0) || 0;

    setStats({
      totalUsuarios: usuarios.count || 0,
      totalEventos: eventos.count || 0,
      totalAtleticas: atleticas.count || 0,
      totalVendas: ingressos.count || 0,
      volumeFinanceiro: volume,
      eventosAtivos: eventosAtivos.count || 0,
    });

    if (recentesRes.data) setEventosRecentes(recentesRes.data as unknown as (Evento & { atletica?: { nome: string } })[]);
    setCarregandoDados(false);
  }

  useEffect(() => {
    if (perfil && perfil.role === 'admin') {
      buscarDados();
    } else {
      setCarregandoDados(false);
    }
  }, [perfil]);


  async function aoSubmeterLogin(e: React.FormEvent) {
    e.preventDefault();
    setErroLogin('');
    setProcessandoLogin(true);

    const res = await entrar(email, senha);

    if (res.erro) {
      setErroLogin(res.erro.includes('Invalid login') ? 'Credenciais administrativas incorretas' : res.erro);
      setProcessandoLogin(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { data: userPerfil } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (!userPerfil || userPerfil.role !== 'admin') {
        setErroLogin('Acesso restrito. Esta conta não possui privilégios de administrador da plataforma.');
        await supabase.auth.signOut();
        setProcessandoLogin(false);
        return;
      }
    }

    setProcessandoLogin(false);
  }

  if (carregandoAuth) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <Carregando tamanho="lg" texto="Carregando portal do administrador..." />
      </div>
    );
  }

  
  const estaAutenticadoAdmin = Boolean(usuario && perfil && perfil.role === 'admin');

  if (!estaAutenticadoAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-fundo-principal">
        <div className="w-96 h-96 rounded-full bg-amber-500/10 blur-3xl absolute -top-20 -left-20 pointer-events-none" />
        <div className="w-96 h-96 rounded-full bg-red-500/10 blur-3xl absolute bottom-10 right-0 pointer-events-none" />

        <div className="w-full max-w-md relative z-10">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-texto-secundario hover:text-texto-principal transition-colors mb-8"
          >
            <ArrowLeft size={16} />
            Voltar ao site principal
          </Link>

          <div className="vidro-forte rounded-3xl p-8 shadow-glass animar-entrar-baixo border border-amber-500/30">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#ff007a] via-[#8b5cf6] to-[#026cdf] flex items-center justify-center shadow-lg shadow-purple-500/20 shrink-0">
                <Ticket className="w-6 h-6 text-white transform -rotate-12" />
              </div>
              <div>
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-bold tracking-wider uppercase mb-1 border border-amber-500/20">
                  <Shield size={12} /> Acesso Restrito
                </div>
                <h1 className="text-xl font-bold font-titulo text-texto-principal">
                  Portal do Administrador
                </h1>
              </div>
            </div>

            <form onSubmit={aoSubmeterLogin} className="space-y-5">
              <CampoTexto
                rotulo="Email administrativo"
                type="email"
                placeholder="admin@meuingrss.com.br"
                value={email}
                onChange={(e) => setEmail((e.target as HTMLInputElement).value)}
                icone={<Mail size={18} />}
                required
              />

              <CampoTexto
                rotulo="Senha de administrador"
                type="password"
                placeholder="••••••••••••"
                value={senha}
                onChange={(e) => setSenha((e.target as HTMLInputElement).value)}
                icone={<Lock size={18} />}
                required
              />

              {erroLogin && (
                <div className="p-4 rounded-xl bg-erro/10 border border-erro/20 text-xs font-medium text-erro leading-relaxed">
                  {erroLogin}
                </div>
              )}

              <button
                type="submit"
                disabled={processandoLogin}
                className="w-full py-3.5 px-6 rounded-xl font-bold text-sm text-black bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {processandoLogin ? (
                  <Carregando tamanho="sm" texto="Autenticando..." />
                ) : (
                  'Acessar Painel Global'
                )}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-borda-sutil text-center">
              <p className="text-[11px] text-texto-terciario flex items-center justify-center gap-1.5">
                <Shield size={12} className="text-amber-400" />
                Sessão protegida por log de auditoria global.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  
  if (carregandoDados) {
    return (
      <div className="flex items-center justify-center h-96">
        <Carregando tamanho="lg" texto="Carregando visão geral..." />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-black font-titulo">
          Painel <span className="text-amber-400">Administrativo</span>
        </h1>
        <p className="text-texto-secundario mt-1">Visão geral da plataforma</p>
      </div>

      {}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {[
          { titulo: 'Usuários', valor: stats.totalUsuarios, icone: Users, cor: 'from-blue-500 to-blue-600' },
          { titulo: 'Eventos', valor: stats.totalEventos, icone: CalendarDays, cor: 'from-primaria-500 to-primaria-600', sub: `${stats.eventosAtivos} ativos` },
          { titulo: 'Atléticas', valor: stats.totalAtleticas, icone: Shield, cor: 'from-amber-500 to-amber-600' },
          { titulo: 'Ingressos Vendidos', valor: stats.totalVendas, icone: Ticket, cor: 'from-secundaria-500 to-secundaria-600' },
          { titulo: 'Volume Financeiro', valor: formatarMoeda(stats.volumeFinanceiro), icone: DollarSign, cor: 'from-emerald-500 to-emerald-600' },
          { titulo: 'Receita Plataforma', valor: formatarMoeda(stats.volumeFinanceiro * 0.1), icone: TrendingUp, cor: 'from-cyan-500 to-cyan-600', sub: '10% do volume' },
        ].map((card, i) => (
          <Cartao key={i} variante="vidro" className="animar-entrar-baixo" style={{ animationDelay: `${i * 0.05}s` } as React.CSSProperties}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-texto-terciario mb-1">{card.titulo}</p>
                <p className="text-2xl font-black font-titulo">{card.valor}</p>
                {card.sub && <p className="text-xs text-texto-terciario mt-1">{card.sub}</p>}
              </div>
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.cor} flex items-center justify-center`}>
                <card.icone className="w-5 h-5 text-white" />
              </div>
            </div>
          </Cartao>
        ))}
      </div>

      {}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Link href="/admin/eventos"><Cartao variante="gradiente" interativo className="text-center py-6"><CalendarDays className="w-8 h-8 text-primaria-400 mx-auto mb-2" /><p className="font-bold text-sm">Gerenciar Eventos</p></Cartao></Link>
        <Link href="/admin/usuarios"><Cartao variante="gradiente" interativo className="text-center py-6"><Users className="w-8 h-8 text-blue-400 mx-auto mb-2" /><p className="font-bold text-sm">Gerenciar Usuários</p></Cartao></Link>
        <Link href="/admin/atleticas"><Cartao variante="gradiente" interativo className="text-center py-6"><Shield className="w-8 h-8 text-amber-400 mx-auto mb-2" /><p className="font-bold text-sm">Gerenciar Atléticas</p></Cartao></Link>
      </div>

      {}
      <Cartao variante="vidro">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold font-titulo flex items-center gap-2"><Activity size={20} className="text-amber-400" /> Atividade Recente</h3>
          <Link href="/admin/eventos"><Botao variante="fantasma" tamanho="sm">Ver todos</Botao></Link>
        </div>
        <div className="space-y-3">
          {eventosRecentes.map(evento => (
            <Link key={evento.id} href={`/eventos/${evento.slug || evento.id}`} target="_blank" className="flex items-center gap-4 p-3 rounded-xl hover:bg-fundo-hover transition-all">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                <CalendarDays size={18} className="text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium texto-limitado-1">{evento.titulo}</p>
                <p className="text-xs text-texto-terciario">{evento.atletica?.nome} • {formatarDataCurta(evento.criado_em)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Distintivo status={evento.status} />
                {evento.apagado_pelo_diretor && (
                  <Distintivo texto="Apagado pelo Diretor" cor="text-red-400 bg-red-950/80 border-red-800/40 text-xs font-black uppercase tracking-wider" />
                )}
              </div>
            </Link>
          ))}
        </div>
      </Cartao>
    </div>
  );
}
