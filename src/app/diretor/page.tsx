'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Cartao from '@/componentes/ui/Cartao';
import Botao from '@/componentes/ui/Botao';
import Distintivo from '@/componentes/ui/Distintivo';
import CampoTexto from '@/componentes/ui/CampoTexto';
import Carregando from '@/componentes/ui/Carregando';
import CaptchaCloudflare from '@/componentes/ui/CaptchaCloudflare';
import { criarClienteNavegador } from '@/lib/supabase/cliente';
import { usarAutenticacao } from '@/contextos/ContextoAutenticacao';
import { formatarMoeda, formatarDataCurta } from '@/lib/utilitarios';
import {
  Ticket,
  DollarSign,
  CalendarDays,
  CalendarPlus,
  ScanLine,
  TrendingUp,
  ArrowRight,
  Mail,
  Lock,
  ArrowLeft,
  ShieldCheck,
} from 'lucide-react';

import type { Evento, LoteIngresso } from '@/tipos';

export default function DashboardDiretor() {
  const { usuario, perfil, entrar, carregando: carregandoAuth } = usarAutenticacao();
  const [stats, setStats] = useState({ totalVendido: 0, receita: 0, eventosAtivos: 0, eventosTotal: 0 });
  const [eventosRecentes, setEventosRecentes] = useState<(Evento & { lotes_ingresso?: LoteIngresso[] })[]>([]);
  const [carregandoDados, setCarregandoDados] = useState(true);

  
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erroLogin, setErroLogin] = useState('');
  const [processandoLogin, setProcessandoLogin] = useState(false);

  const supabase = criarClienteNavegador();

  async function buscarDados() {
    let query = supabase
      .from('eventos')
      .select('*, lotes_ingresso(id, preco, quantidade_total, quantidade_vendida)')
      .eq('apagado_pelo_diretor', false)
      .order('criado_em', { ascending: false });
    if (perfil?.atletica_id) {
      query = query.eq('atletica_id', perfil.atletica_id);
    }
    const { data } = await query;
    if (data) {
      const eventos = data as (Evento & { lotes_ingresso?: LoteIngresso[] })[];
      setEventosRecentes(eventos.slice(0, 5));

      let totalVendido = 0;
      let receita = 0;
      let ativos = 0;

      eventos.forEach((ev) => {
        if (ev.status === 'publicado') ativos++;
        ev.lotes_ingresso?.forEach((l) => {
          totalVendido += l.quantidade_vendida;
          receita += l.quantidade_vendida * l.preco;
        });
      });

      setStats({ totalVendido, receita, eventosAtivos: ativos, eventosTotal: eventos.length });
    }
    setCarregandoDados(false);
  }

  useEffect(() => {
    if (perfil && (perfil.role === 'diretor' || perfil.role === 'admin')) {
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
      setErroLogin(res.erro.includes('Invalid login') ? 'Email ou senha incorretos' : res.erro);
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

      if (!userPerfil || (userPerfil.role !== 'diretor' && userPerfil.role !== 'admin')) {
        setErroLogin('Sua conta é de cliente. O portal do diretor é exclusivo para organizadores.');
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
        <Carregando tamanho="lg" texto="Carregando portal do diretor..." />
      </div>
    );
  }

  
  const estaAutenticado = Boolean(usuario && perfil && (perfil.role === 'diretor' || perfil.role === 'admin'));

  if (!estaAutenticado) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-fundo-principal">
        <div className="orbe-roxa -top-20 -left-20 opacity-50" />
        <div className="orbe-rosa bottom-20 right-0 opacity-40" />

        <div className="w-full max-w-md relative z-10">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-texto-secundario hover:text-texto-principal transition-colors mb-8"
          >
            <ArrowLeft size={16} />
            Voltar ao site principal
          </Link>

          <div className="vidro-forte rounded-3xl p-8 shadow-glass animar-entrar-baixo border border-primaria-500/20">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#ff007a] via-[#8b5cf6] to-[#026cdf] flex items-center justify-center shadow-lg shrink-0">
                <Ticket className="w-6 h-6 text-white transform -rotate-12" />
              </div>
              <div>
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primaria-500/15 text-primaria-400 text-[10px] font-bold tracking-wider uppercase mb-1">
                  <ShieldCheck size={12} /> Portal do Diretor
                </div>
                <h1 className="text-xl font-bold font-titulo text-texto-principal">
                  Acesso do Diretor
                </h1>
              </div>
            </div>

            <form onSubmit={aoSubmeterLogin} className="space-y-5">
              <CampoTexto
                rotulo="Email corporativo ou da atlética"
                type="email"
                placeholder="diretor@atletica.com"
                value={email}
                onChange={(e) => setEmail((e.target as HTMLInputElement).value)}
                icone={<Mail size={18} />}
                required
              />

              <CampoTexto
                rotulo="Senha"
                type="password"
                placeholder="••••••••"
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

              <Botao
                type="submit"
                larguraTotal
                tamanho="lg"
                carregando={processandoLogin}
              >
                Entrar no Painel do Diretor
              </Botao>

              <CaptchaCloudflare />
            </form>

            <div className="mt-8 pt-6 border-t border-borda-sutil text-center space-y-2">
              <p className="text-xs text-texto-terciario">
                Não tem perfil de diretor?{' '}
                <Link
                  href="/autenticacao/cadastro"
                  className="text-primaria-400 hover:text-primaria-300 font-medium transition-colors"
                >
                  Cadastre-se como diretor
                </Link>
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
        <Carregando tamanho="lg" texto="Carregando métricas..." />
      </div>
    );
  }

  return (
    <div>
      {}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-black font-titulo">
          Olá, <span className="gradiente-texto">{perfil?.nome?.split(' ')[0]}</span>
        </h1>
        <p className="text-texto-secundario mt-1">Painel de gestão da sua atlética</p>
      </div>

      {}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { titulo: 'Ingressos Vendidos', valor: stats.totalVendido, icone: Ticket, cor: 'from-primaria-500 to-primaria-600' },
          { titulo: 'Receita Total', valor: formatarMoeda(stats.receita), icone: DollarSign, cor: 'from-emerald-500 to-emerald-600' },
          { titulo: 'Eventos Ativos', valor: stats.eventosAtivos, icone: CalendarDays, cor: 'from-secundaria-500 to-secundaria-600' },
          { titulo: 'Total de Eventos', valor: stats.eventosTotal, icone: TrendingUp, cor: 'from-blue-500 to-blue-600' },
        ].map((card, i) => (
          <Cartao key={i} variante="vidro" className="animar-entrar-baixo" style={{ animationDelay: `${i * 0.05}s` } as React.CSSProperties}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-texto-terciario mb-1">{card.titulo}</p>
                <p className="text-2xl font-black font-titulo">{card.valor}</p>
              </div>
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.cor} flex items-center justify-center`}>
                <card.icone className="w-5 h-5 text-white" />
              </div>
            </div>
          </Cartao>
        ))}
      </div>

      {}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <Link href="/eventos/novo">
          <Cartao variante="gradiente" interativo className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primaria-500/20 flex items-center justify-center">
              <CalendarPlus className="w-6 h-6 text-primaria-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold font-titulo">Criar Evento</h3>
              <p className="text-xs text-texto-terciario">Publique um novo evento</p>
            </div>
            <ArrowRight size={18} className="text-texto-terciario" />
          </Cartao>
        </Link>
        <Link href="/validar-entrada">
          <Cartao variante="gradiente" interativo className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-sucesso/20 flex items-center justify-center">
              <ScanLine className="w-6 h-6 text-sucesso" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold font-titulo">Validar Entrada</h3>
              <p className="text-xs text-texto-terciario">Escanear QR Code</p>
            </div>
            <ArrowRight size={18} className="text-texto-terciario" />
          </Cartao>
        </Link>
      </div>

      {}
      <Cartao variante="vidro">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold font-titulo">Eventos Recentes</h3>
          <Link href="/eventos"><Botao variante="fantasma" tamanho="sm">Ver todos</Botao></Link>
        </div>

        {eventosRecentes.length > 0 ? (
          <div className="space-y-3">
            {eventosRecentes.map(evento => (
              <Link key={evento.id} href={`/eventos/${evento.slug || evento.id}/vendas`}
                className="flex items-center gap-4 p-3 rounded-xl hover:bg-fundo-hover transition-all">
                <div className="w-10 h-10 rounded-lg bg-primaria-500/10 flex items-center justify-center flex-shrink-0">
                  <CalendarDays size={18} className="text-primaria-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium texto-limitado-1">{evento.titulo}</p>
                  <p className="text-xs text-texto-terciario">{formatarDataCurta(evento.data_evento)}</p>
                </div>
                <Distintivo status={evento.status} />
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-texto-terciario text-center py-8">Nenhum evento criado ainda</p>
        )}
      </Cartao>
    </div>
  );
}
