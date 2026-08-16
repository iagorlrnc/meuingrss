'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { usarAutenticacao } from '@/contextos/ContextoAutenticacao';
import Botao from '@/componentes/ui/Botao';
import CampoTexto from '@/componentes/ui/CampoTexto';
import Carregando from '@/componentes/ui/Carregando';
import CaptchaCloudflare from '@/componentes/ui/CaptchaCloudflare';
import { criarClienteNavegador } from '@/lib/supabase/cliente';
import { useRateLimitAuth } from '@/hooks/useRateLimitAuth';
import { Shield, Mail, Lock, ArrowLeft, Ticket, Clock } from 'lucide-react';

function FormularioEntrarAdmin() {
  const { entrar } = usarAutenticacao();
  const { bloqueado, segundosRestantes, mensagemRateLimit, aplicarStatus } = useRateLimitAuth();
  const searchParams = useSearchParams();
  const redirecionar = searchParams.get('redirecionar') || '/';

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const supabase = criarClienteNavegador();

  async function aoSubmeter(e: React.FormEvent) {
    e.preventDefault();
    if (bloqueado) return;

    setErro('');
    setCarregando(true);

    const resultado = await entrar(email, senha, 'admin');

    if (resultado.erro) {
      if (resultado.rateLimitData) {
        aplicarStatus(resultado.rateLimitData);
      }
      setErro(resultado.erro);
      setCarregando(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { data: perfil } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (!perfil || perfil.role !== 'admin') {
        setErro('Acesso restrito. Esta conta não possui privilégios de administrador da plataforma.');
        await supabase.auth.signOut();
        setCarregando(false);
        return;
      }
    }

    window.location.href = redirecionar;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-3 sm:p-6 relative overflow-hidden bg-[#080c14]">
      {/* Background glowing Orbs */}
      <div className="w-96 h-96 rounded-full bg-amber-500/10 blur-3xl absolute -top-20 -left-20 pointer-events-none" />
      <div className="w-96 h-96 rounded-full bg-red-500/10 blur-3xl absolute bottom-10 right-0 pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white transition-all uppercase tracking-wider mb-4 sm:mb-6 bg-white/5 hover:bg-white/10 px-3.5 py-2 rounded-full border border-white/10"
        >
          <ArrowLeft size={14} />
          Voltar ao site principal
        </Link>

        <div className="vidro-forte rounded-3xl p-5 sm:p-8 shadow-glass animar-entrar-baixo border border-amber-500/30 backdrop-blur-2xl bg-[#0d1322]/90">
          <div className="flex items-center gap-3.5 mb-6 sm:mb-8 pb-5 border-b border-white/10">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#ff007a] via-[#8b5cf6] to-[#026cdf] flex items-center justify-center shadow-lg shadow-purple-500/20 shrink-0">
              <Ticket className="w-6 h-6 text-white transform -rotate-12" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-bold tracking-wider uppercase mb-1 border border-amber-500/20">
                <Shield size={12} /> Acesso Restrito
              </div>
              <h1 className="text-xl font-bold font-titulo text-white">
                Portal do Administrador
              </h1>
            </div>
          </div>

          <form onSubmit={aoSubmeter} className="space-y-4 sm:space-y-5">
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
              rotulo="Chave de Acesso / Senha"
              type="password"
              placeholder="••••••••••••"
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
              variante="secundario"
              larguraTotal
              tamanho="lg"
              carregando={carregando}
              disabled={bloqueado || carregando || !turnstileToken}
            >
              {bloqueado ? `Aguarde ${segundosRestantes}s` : 'Acessar Painel Global'}
            </Botao>

            <CaptchaCloudflare
              onVerify={(token) => setTurnstileToken(token)}
              onExpire={() => setTurnstileToken('')}
              onError={() => setTurnstileToken('')}
            />
          </form>

          <div className="mt-6 sm:mt-8 pt-5 sm:pt-6 border-t border-white/10 text-center">
            <p className="text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
              <Shield size={12} className="text-amber-400 shrink-0" />
              <span>Sessão protegida por log de auditoria global.</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PaginaEntrarAdmin() {
  return (
    <Suspense fallback={<Carregando telaCheia texto="Carregando portal do administrador..." />}>
      <FormularioEntrarAdmin />
    </Suspense>
  );
}
