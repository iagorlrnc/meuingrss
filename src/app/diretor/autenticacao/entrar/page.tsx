'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { usarAutenticacao } from '@/contextos/ContextoAutenticacao';
import Botao from '@/componentes/ui/Botao';
import CampoTexto from '@/componentes/ui/CampoTexto';
import Carregando from '@/componentes/ui/Carregando';
import Modal from '@/componentes/ui/Modal';
import { criarClienteNavegador } from '@/lib/supabase/cliente';
import {
  Ticket,
  Mail,
  Lock,
  ArrowLeft,
  ShieldCheck,
  Clock,
  Eye,
  EyeOff,
  TrendingUp,
  QrCode,
  CheckCircle2,
  Sparkles,
  Shield,
  ArrowRight
} from 'lucide-react';

import { useRateLimitAuth } from '@/hooks/useRateLimitAuth';
import CaptchaCloudflare from '@/componentes/ui/CaptchaCloudflare';

import { construirUrl } from '@/lib/dominios';

function FormularioEntrarDiretor() {
  const { entrar } = usarAutenticacao();
  const { bloqueado, segundosRestantes, mensagemRateLimit, aplicarStatus } = useRateLimitAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const redirecionar = searchParams.get('redirecionar') || '/';
  const urlSitePrincipal = construirUrl('cliente', '/');

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [modalPendenteAberto, setModalPendenteAberto] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const supabase = criarClienteNavegador();

  useEffect(() => {
    if (searchParams.get('pendente') === '1') {
      setModalPendenteAberto(true);
    }
  }, [searchParams]);

  async function aoSubmeter(e: React.FormEvent) {
    e.preventDefault();
    if (bloqueado) return;

    setErro('');
    setCarregando(true);

    const emailTratado = email.trim().toLowerCase();

    // 1. Verifica preventivamente se o e-mail possui um cadastro pendente de aprovação
    try {
      const { data: statusResp } = await supabase.rpc('verificar_status_cadastro', {
        p_email: emailTratado,
      });

      const infoStatus = Array.isArray(statusResp) ? statusResp[0] : statusResp;

      if (infoStatus?.status === 'pendente') {
        await supabase.auth.signOut();
        setModalPendenteAberto(true);
        setErro('Sua solicitação de cadastro para o painel de diretor está em análise pelo administrador. Aguarde a aprovação para acessar o sistema.');
        setCarregando(false);
        return;
      }
    } catch (eCheck) {
      console.warn('Não foi possível pré-verificar o status do e-mail:', eCheck);
    }

    // 2. Realiza a tentativa de autenticação
    const resultado = await entrar(email, senha);

    if (resultado.erro) {
      // Caso a senha esteja errada ou haja erro de login, verifica se a conta está pendente para dar o aviso correto
      try {
        const { data: perfilPendente } = await supabase
          .from('profiles')
          .select('status, role')
          .eq('email', emailTratado)
          .maybeSingle();

        if (perfilPendente?.status === 'pendente' || (perfilPendente?.role === 'diretor' && perfilPendente?.status === 'pendente')) {
          await supabase.auth.signOut();
          setModalPendenteAberto(true);
          setErro('Sua solicitação de cadastro para o painel de diretor está em análise pelo administrador. Aguarde a aprovação para acessar o sistema.');
          setCarregando(false);
          return;
        }
      } catch (errCheck) {
        console.warn('Erro ao consultar perfil pendente:', errCheck);
      }

      if (resultado.rateLimitData) {
        aplicarStatus(resultado.rateLimitData);
      }
      setErro(resultado.erro);
      setCarregando(false);
      return;
    }

    // 3. Validação da sessão ativada
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { data: perfil } = await supabase
        .from('profiles')
        .select('role, status')
        .eq('id', user.id)
        .single();

      if (perfil?.status === 'pendente') {
        await supabase.auth.signOut();
        setModalPendenteAberto(true);
        setErro('Sua solicitação de cadastro para o painel de diretor está em análise pelo administrador. Aguarde a aprovação para acessar o sistema.');
        setCarregando(false);
        return;
      }

      if (perfil?.status === 'bloqueado') {
        setErro('Sua solicitação de cadastro de diretor foi recusada ou está bloqueada pelo administrador.');
        await supabase.auth.signOut();
        setCarregando(false);
        return;
      }

      if (!perfil || (perfil.role !== 'diretor' && perfil.role !== 'admin')) {
        setErro('Sua conta é de cliente. O portal do diretor é restrito a diretores de atlética.');
        await supabase.auth.signOut();
        setCarregando(false);
        return;
      }
    }

    window.location.href = redirecionar;
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-12 bg-[#080c14] relative overflow-hidden">
      {/* Orbes Neon de fundo */}
      <div className="absolute top-0 -left-40 w-96 h-96 bg-[#ff007a]/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 -right-40 w-96 h-96 bg-[#8b5cf6]/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl h-96 bg-[#00e5ff]/5 rounded-full blur-3xl pointer-events-none" />

      {/* LADO ESQUERDO: Painel Informativo & Métricas de Valor (Desktop) */}
      <div className="hidden lg:flex lg:col-span-6 xl:col-span-7 flex-col justify-between p-12 xl:p-16 relative z-10 border-r border-white/10 bg-gradient-to-br from-[#0b101c]/90 via-[#080c14]/95 to-[#080c14]">
        <div>
          {/* Navegação Superior */}
          <a
            href={urlSitePrincipal}
            className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white transition-all uppercase tracking-wider bg-white/5 hover:bg-white/10 px-4 py-2 rounded-full border border-white/10 w-fit mb-12"
          >
            <ArrowLeft size={14} />
            Voltar ao site principal
          </a>

          {/* Headline & Badges */}
          <div className="max-w-xl space-y-6">
            <h1 className="text-4xl xl:text-5xl font-black font-titulo text-white leading-tight tracking-tight">
              Gerencie sua Atlética com{' '}
              <span className="bg-gradient-to-r from-[#ff007a] via-[#8b5cf6] to-[#00e5ff] bg-clip-text text-transparent">
                Painel Executivo
              </span>
            </h1>

            <p className="text-base text-slate-300 font-normal leading-relaxed">
              Painel completo para gestão de vendas de ingressos em tempo real, controle de lotes, validação via QR Code e relatórios financeiros transparentes.
            </p>
          </div>

          {/* Destaques de Recursos */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-12 max-w-xl">
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-md hover:border-[#ff007a]/40 transition-all">
              <div className="w-10 h-10 rounded-xl bg-[#ff007a]/15 text-[#ff007a] flex items-center justify-center mb-3">
                <TrendingUp size={20} />
              </div>
              <h3 className="text-sm font-bold text-white mb-1">Vendas ao Vivo</h3>
              <p className="text-xs text-slate-400 leading-normal">
                Métricas e gráfico de conversão em tempo real.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-md hover:border-[#8b5cf6]/40 transition-all">
              <div className="w-10 h-10 rounded-xl bg-[#8b5cf6]/15 text-[#8b5cf6] flex items-center justify-center mb-3">
                <QrCode size={20} />
              </div>
              <h3 className="text-sm font-bold text-white mb-1">Check-in Rápido</h3>
              <p className="text-xs text-slate-400 leading-normal">
                Leitor de QR Code para portaria sem filas.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-md hover:border-[#00e5ff]/40 transition-all">
              <div className="w-10 h-10 rounded-xl bg-[#00e5ff]/15 text-[#00e5ff] flex items-center justify-center mb-3">
                <Ticket size={20} />
              </div>
              <h3 className="text-sm font-bold text-white mb-1">Virada de Lotes</h3>
              <p className="text-xs text-slate-400 leading-normal">
                Programação automática de horários e limites.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* LADO DIREITO: Form de Autenticação */}
      <div className="lg:col-span-6 xl:col-span-5 flex flex-col justify-center items-center p-3 sm:p-8 lg:p-12 relative z-10 w-full">
        {/* Botão de voltar visível apenas no mobile */}
        <div className="w-full max-w-md lg:hidden mb-4 sm:mb-6">
          <a
            href={urlSitePrincipal}
            className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white transition-all uppercase tracking-wider bg-white/5 hover:bg-white/10 px-3.5 py-2 rounded-full border border-white/10"
          >
            <ArrowLeft size={14} />
            Voltar ao site principal
          </a>
        </div>

        <div className="w-full max-w-md vidro-forte rounded-3xl p-5 sm:p-8 md:p-10 shadow-2xl animar-entrar-baixo border border-white/15 backdrop-blur-2xl bg-[#0d1322]/90">
          {/* Cabeçalho do Card */}
          <div className="flex items-center gap-3.5 sm:gap-4 mb-6 sm:mb-8 pb-5 sm:pb-6 border-b border-white/10">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-[#ff007a] via-[#8b5cf6] to-[#026cdf] flex items-center justify-center shadow-lg shadow-purple-500/20 shrink-0">
              <Ticket className="w-6 h-6 sm:w-7 sm:h-7 text-white transform -rotate-12" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black font-titulo text-white tracking-tight">
                Painel da Diretoria
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Digite suas credenciais cadastradas.
              </p>
            </div>
          </div>

          <form onSubmit={aoSubmeter} className="space-y-4 sm:space-y-5">
            <CampoTexto
              rotulo="Email corporativo ou da atlética"
              type="email"
              placeholder="diretor@atletica.com.br"
              value={email}
              onChange={(e) => setEmail((e.target as HTMLInputElement).value)}
              icone={<Mail size={18} />}
              required
            />

            <CampoTexto
              rotulo="Senha de acesso"
              type="password"
              placeholder="••••••••"
              value={senha}
              onChange={(e) => setSenha((e.target as HTMLInputElement).value)}
              icone={<Lock size={18} />}
              required
            />

            {bloqueado && (
              <div className="p-3.5 sm:p-4 rounded-2xl bg-red-500/15 border border-red-500/30 text-xs font-semibold text-red-400 flex items-start gap-3 animar-entrar-baixo">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-red-500/20 flex items-center justify-center shrink-0 text-red-400 font-bold mt-0.5">
                  <Clock size={16} className="animate-spin" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-xs sm:text-sm text-red-300">IP Bloqueado Temporariamente</p>
                  <p className="mt-1 leading-relaxed text-slate-300">
                    {mensagemRateLimit || 'Muitas tentativas erradas em sequência.'}
                  </p>
                  <div className="mt-2 text-xs font-mono font-bold text-red-400 flex items-center gap-1.5 flex-wrap">
                    Tente novamente em: <span className="bg-red-950/80 px-2 py-0.5 rounded border border-red-500/30 text-red-300 text-sm font-bold">{segundosRestantes}s</span>
                  </div>
                </div>
              </div>
            )}

            {erro && !bloqueado && (
              <div className="p-3.5 sm:p-4 rounded-xl bg-red-500/15 border border-red-500/30 text-xs font-semibold text-red-400 leading-relaxed flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-400 animate-ping shrink-0" />
                <span>{erro}</span>
              </div>
            )}

            <Botao
              type="submit"
              variante="festiva"
              larguraTotal
              tamanho="lg"
              carregando={carregando}
              disabled={bloqueado || carregando || !turnstileToken}
              icone={<ArrowRight size={18} />}
            >
              {bloqueado ? `Aguarde ${segundosRestantes}s` : 'Acessar Painel do Diretor'}
            </Botao>

            <CaptchaCloudflare
              onVerify={(token) => setTurnstileToken(token)}
              onExpire={() => setTurnstileToken('')}
              onError={() => setTurnstileToken('')}
            />
          </form>

          {/* Chamada para Cadastro */}
          <div className="mt-6 sm:mt-8 pt-5 sm:pt-6 border-t border-white/10 text-center">
            <p className="text-xs text-slate-400">
              Sua atlética ainda não tem cadastro?{' '}
              <Link
                href="/autenticacao/cadastro"
                className="text-[#00e5ff] hover:text-[#00e5ff]/80 underline font-bold transition-colors ml-1 inline-block"
              >
                Cadastrar Atlética
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* Modal Pop-up de Aguardando Aprovação */}
      <Modal
        aberto={modalPendenteAberto}
        aoFechar={() => setModalPendenteAberto(false)}
        tamanho="sm"
      >
        <div className="text-center space-y-4 py-2">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400 shadow-lg shadow-amber-500/10">
            <Clock size={32} />
          </div>

          <h3 className="text-xl font-black font-titulo text-white">
            Cadastro em Análise
          </h3>

          <p className="text-xs text-slate-300 leading-relaxed">
            Sua conta de <strong className="text-amber-400 font-bold">Diretor de Atlética</strong> e os dados cadastrados foram recebidos e estão aguardando a aprovação do <strong className="text-white">Administrador</strong>.
          </p>

          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 font-medium">
            ⏳ Você receberá a permissão de acesso ao painel assim que o administrador aprovar seu credenciamento.
          </div>

          <Botao
            variante="festiva"
            larguraTotal
            onClick={() => setModalPendenteAberto(false)}
          >
            Entendido
          </Botao>
        </div>
      </Modal>
    </div>
  );
}

export default function PaginaEntrarDiretor() {
  return (
    <Suspense fallback={<Carregando telaCheia texto="Carregando portal do diretor..." />}>
      <FormularioEntrarDiretor />
    </Suspense>
  );
}


