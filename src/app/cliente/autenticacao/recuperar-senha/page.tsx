'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { usarAutenticacao } from '@/contextos/ContextoAutenticacao';
import Botao from '@/componentes/ui/Botao';
import CampoTexto from '@/componentes/ui/CampoTexto';
import Carregando from '@/componentes/ui/Carregando';
import CaptchaCloudflare from '@/componentes/ui/CaptchaCloudflare';
import { useRateLimitAuth } from '@/hooks/useRateLimitAuth';
import { Mail, ArrowLeft, KeyRound, CheckCircle2, Clock, Sparkles } from 'lucide-react';

function FormularioRecuperarSenha() {
  const { recuperarSenha } = usarAutenticacao();
  const [erro, setErro] = useState('');
  const { bloqueado, segundosRestantes, mensagemRateLimit, aplicarStatus } = useRateLimitAuth(() => {
    setErro('');
  });

  const [email, setEmail] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [enviadoComSucesso, setEnviadoComSucesso] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');

  async function aoSubmeter(e: React.FormEvent) {
    e.preventDefault();
    if (bloqueado || !email.trim()) return;

    setErro('');
    setCarregando(true);

    const resultado = await recuperarSenha(email, turnstileToken);

    if (resultado.erro) {
      if (resultado.rateLimitData?.bloqueado || resultado.bloqueado) {
        aplicarStatus(
          resultado.rateLimitData || {
            bloqueado: true,
            segundosRestantes: resultado.segundosRestantes,
            mensagem: resultado.erro,
          }
        );
        setErro('');
      } else {
        setErro(resultado.erro);
      }
      setCarregando(false);
    } else {
      setErro('');
      setEnviadoComSucesso(true);
      setCarregando(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-3 sm:p-6 relative overflow-hidden bg-[#080c14]">
      {/* Orbes de iluminação Neon */}
      <div className="orbe-roxa -top-20 -left-20 opacity-40 pointer-events-none" />
      <div className="orbe-rosa bottom-20 right-0 opacity-30 pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        <Link
          href="/autenticacao/entrar"
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white transition-all uppercase tracking-wider mb-4 sm:mb-6 bg-white/5 hover:bg-white/10 px-3.5 py-2 rounded-full border border-white/10"
        >
          <ArrowLeft size={14} />
          Voltar ao login
        </Link>

        <div className="vidro-forte rounded-3xl p-5 sm:p-8 shadow-glass animar-entrar-baixo border border-white/15 backdrop-blur-2xl bg-[#0d1322]/85">
          {/* Cabeçalho */}
          <div className="flex items-center gap-3.5 mb-6 sm:mb-8 pb-5 border-b border-white/10">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#ff007a] via-[#8b5cf6] to-[#026cdf] flex items-center justify-center shadow-lg shrink-0">
              <KeyRound className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold font-titulo text-white">
                Recuperar Senha
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Redefina o acesso à sua conta
              </p>
            </div>
          </div>

          {enviadoComSucesso ? (
            /* Estado de Sucesso */
            <div className="text-center space-y-5 py-2 animar-entrar-baixo">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400 shadow-lg shadow-emerald-500/10">
                <CheckCircle2 size={36} />
              </div>

              <div className="space-y-2">
                <h2 className="text-lg font-bold font-titulo text-white">
                  E-mail de recuperação enviado!
                </h2>
                <p className="text-xs text-slate-300 leading-relaxed max-w-sm mx-auto">
                  Enviamos as instruções para <strong className="text-[#00e5ff] font-semibold">{email}</strong>. Clique no link enviado para cadastrar uma nova senha.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 text-xs text-slate-400 space-y-1.5 text-left">
                <div className="flex items-center gap-1.5 font-bold text-slate-300">
                  <span>Dicas importantes:</span>
                </div>
                <p>• O link é temporário e expira em breve por segurança.</p>
                <p>• Se não encontrar na caixa de entrada, verifique sua pasta de <strong>Spam</strong> ou <strong>Lixo Eletrônico</strong>.</p>
              </div>

              <div className="pt-3 space-y-3">
                <Botao
                  variante="festiva"
                  larguraTotal
                  tamanho="lg"
                  onClick={() => {
                    setEnviadoComSucesso(false);
                    setEmail('');
                  }}
                >
                  Enviar para outro e-mail
                </Botao>

                <Link
                  href="/autenticacao/entrar"
                  className="block text-center text-xs font-bold text-slate-400 hover:text-white transition-colors py-2"
                >
                  Voltar para tela de login
                </Link>
              </div>
            </div>
          ) : (
            /* Formulário de Envio */
            <form onSubmit={aoSubmeter} className="space-y-4 sm:space-y-5">
              <p className="text-xs text-slate-300 leading-relaxed">
                Digite o e-mail cadastrado na sua conta. Nós lhe enviaremos um link seguro para você redefinir sua senha.
              </p>

              <CampoTexto
                rotulo="Email cadastrado"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => {
                  setEmail((e.target as HTMLInputElement).value);
                  if (erro) setErro('');
                }}
                icone={<Mail size={18} />}
                required
              />

              {bloqueado && (
                <div className="p-3.5 sm:p-4 rounded-2xl bg-red-500/15 border border-red-500/30 text-xs font-semibold text-red-400 flex items-start gap-3 animar-entrar-baixo">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-red-500/20 flex items-center justify-center shrink-0 text-red-400 font-bold mt-0.5">
                    <Clock size={16} className="animate-spin" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-xs sm:text-sm text-red-300">Bloqueado Temporariamente</p>
                    <p className="mt-1 leading-relaxed text-slate-300">
                      {mensagemRateLimit || 'Muitas tentativas em sequência.'}
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
                {bloqueado ? `Aguarde ${segundosRestantes}s` : 'Enviar Link de Recuperação'}
              </Botao>

              <CaptchaCloudflare
                onVerify={(token) => setTurnstileToken(token)}
                onExpire={() => setTurnstileToken('')}
                onError={() => setTurnstileToken('')}
              />

              <p className="text-center text-xs text-slate-400 pt-2">
                Lembrou a senha?{' '}
                <Link
                  href="/autenticacao/entrar"
                  className="text-[#00e5ff] hover:underline font-bold transition-colors ml-1 inline-block"
                >
                  Entrar agora
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PaginaRecuperarSenha() {
  return (
    <Suspense fallback={<Carregando telaCheia texto="Carregando recuperação de senha..." />}>
      <FormularioRecuperarSenha />
    </Suspense>
  );
}
