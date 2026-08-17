'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { usarAutenticacao } from '@/contextos/ContextoAutenticacao';
import { construirUrl } from '@/lib/dominios';
import Botao from '@/componentes/ui/Botao';
import CampoTexto from '@/componentes/ui/CampoTexto';
import Modal from '@/componentes/ui/Modal';
import Carregando from '@/componentes/ui/Carregando';
import CaptchaCloudflare from '@/componentes/ui/CaptchaCloudflare';
import { useRateLimitAuth } from '@/hooks/useRateLimitAuth';
import { Ticket, Mail, Lock, ArrowLeft, Clock } from 'lucide-react';

function FormularioEntrar() {
  const { entrar } = usarAutenticacao();
  const { bloqueado, segundosRestantes, mensagemRateLimit, aplicarStatus } = useRateLimitAuth();
  const parametrosBusca = useSearchParams();
  const redirecionar = parametrosBusca.get('redirecionar') || '/';

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [modalPendenteAberto, setModalPendenteAberto] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');

  // Capturar mensagens de erro passadas no redirecionamento
  useEffect(() => {
    const codErro = parametrosBusca.get('erro');
    if (codErro === 'conta_bloqueada') {
      setErro('Sua conta está bloqueada. Entre em contato com a equipe de suporte.');
    } else if (codErro === 'permissao_negada') {
      setErro('Acesso negado: Você não possui permissão para acessar esta área.');
    }
  }, [parametrosBusca]);

  async function aoSubmeter(e: React.FormEvent) {
    e.preventDefault();
    if (bloqueado) return;

    setErro('');
    setCarregando(true);

    const resultado = await entrar(email, senha);

    if (resultado.erro) {
      if (resultado.rateLimitData) {
        aplicarStatus(resultado.rateLimitData);
      }
      setErro(resultado.erro);
      setCarregando(false);
    } else {
      const { criarClienteNavegador } = await import('@/lib/supabase/cliente');
      const supabase = criarClienteNavegador();
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
          setCarregando(false);
          return;
        }

        if (perfil?.role === 'diretor') {
          window.location.href = construirUrl('diretoria', '/');
          return;
        }
        if (perfil?.role === 'admin') {
          window.location.href = construirUrl('dev', '/');
          return;
        }
      }

      window.location.href = redirecionar;
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-3 sm:p-6 relative overflow-hidden bg-[#080c14]">
      {/* Background glowing Orbs */}
      <div className="orbe-roxa -top-20 -left-20 opacity-40 pointer-events-none" />
      <div className="orbe-rosa bottom-20 right-0 opacity-30 pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white transition-all uppercase tracking-wider mb-4 sm:mb-6 bg-white/5 hover:bg-white/10 px-3.5 py-2 rounded-full border border-white/10"
        >
          <ArrowLeft size={14} />
          Voltar ao início
        </Link>

        <div className="vidro-forte rounded-3xl p-5 sm:p-8 shadow-glass animar-entrar-baixo border border-white/15 backdrop-blur-2xl bg-[#0d1322]/85">
          <div className="flex items-center gap-3.5 mb-6 sm:mb-8 pb-5 border-b border-white/10">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#ff007a] via-[#8b5cf6] to-[#026cdf] flex items-center justify-center shadow-lg shrink-0">
              <Ticket className="w-6 h-6 text-white transform -rotate-12" />
            </div>
            <div>
              <h1 className="text-xl font-bold font-titulo text-white">
                Entrar
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Acesse sua conta meuingrss
              </p>
            </div>
          </div>

          <form onSubmit={aoSubmeter} className="space-y-4 sm:space-y-5">
            <CampoTexto
              rotulo="Email"
              type="email"
              placeholder="seu@email.com"
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
              <div className="p-3 sm:p-3.5 rounded-xl bg-red-500/15 border border-red-500/30 text-xs font-semibold text-red-400 leading-relaxed flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-400 animate-ping shrink-0" />
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
            >
              {bloqueado ? `Aguarde ${segundosRestantes}s` : 'Entrar'}
            </Botao>

            <CaptchaCloudflare
              onVerify={(token) => setTurnstileToken(token)}
              onExpire={() => setTurnstileToken('')}
              onError={() => setTurnstileToken('')}
            />
          </form>



          <p className="text-center text-xs sm:text-sm text-slate-400 mt-6">
            Não tem conta?{' '}
            <Link
              href="/autenticacao/cadastro"
              className="text-[#00e5ff] hover:underline font-bold transition-colors ml-1 inline-block"
            >
              Cadastre-se gratuitamente
            </Link>
          </p>
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
            Sua conta de <strong className="text-amber-400 font-bold">Diretor de Atlética</strong> e os dados cadastrados ainda estão aguardando a aprovação do <strong className="text-white">Administrador</strong>.
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

export default function PaginaEntrar() {
  return (
    <Suspense fallback={<Carregando telaCheia texto="Carregando..." />}>
      <FormularioEntrar />
    </Suspense>
  );
}
