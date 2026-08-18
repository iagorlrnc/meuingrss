'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { usarAutenticacao } from '@/contextos/ContextoAutenticacao';
import { criarClienteNavegador } from '@/lib/supabase/cliente';
import Botao from '@/componentes/ui/Botao';
import CampoTexto from '@/componentes/ui/CampoTexto';
import Carregando from '@/componentes/ui/Carregando';
import { Lock, CheckCircle2, AlertCircle, ArrowLeft, KeyRound, ShieldCheck } from 'lucide-react';

function FormularioRedefinirSenha() {
  const { redefinirSenha } = usarAutenticacao();
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = criarClienteNavegador();

  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [verificandoSessao, setVerificandoSessao] = useState(true);
  const [sessaoValida, setSessaoValida] = useState(false);
  const [sucesso, setSucesso] = useState(false);

  useEffect(() => {
    let montado = true;

    async function validarAcessoRecuperacao() {
      // 1. Verificar se o Supabase retornou algum erro na URL (ex: token expirado)
      const erroUrl = searchParams.get('error') || searchParams.get('error_description');
      if (erroUrl) {
        if (montado) {
          setErro(
            searchParams.get('error_description') ||
            'O link de recuperação é inválido ou já expirou. Solicite um novo link.'
          );
          setSessaoValida(false);
          setVerificandoSessao(false);
        }
        return;
      }

      // 2. Se houver código PKCE nos parâmetros, trocar pela sessão
      const code = searchParams.get('code');
      if (code) {
        try {
          const { error: errCode } = await supabase.auth.exchangeCodeForSession(code);
          if (errCode) {
            console.warn('Erro ao trocar código por sessão de recuperação:', errCode);
          }
        } catch (e) {
          console.warn('Falha na troca de código:', e);
        }
      }

      // 3. Verificar se há sessão ativa ou evento de recuperação
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (montado) {
          if (session?.user) {
            setSessaoValida(true);
          } else {
            // Aguarda um pequeno intervalo caso o listener onAuthStateChange esteja processando o hash da URL
            const timeoutId = setTimeout(async () => {
              if (!montado) return;
              const { data: { session: retrySession } } = await supabase.auth.getSession();
              if (retrySession?.user) {
                setSessaoValida(true);
              } else {
                setSessaoValida(false);
                setErro('Link de recuperação inválido ou expirado. Por favor, solicite uma nova redefinição de senha.');
              }
              setVerificandoSessao(false);
            }, 1000);

            return () => clearTimeout(timeoutId);
          }
          setVerificandoSessao(false);
        }
      } catch (err) {
        if (montado) {
          setSessaoValida(false);
          setErro('Não foi possível verificar a validade do link de recuperação.');
          setVerificandoSessao(false);
        }
      }
    }

    validarAcessoRecuperacao();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      if (_event === 'PASSWORD_RECOVERY' || (session?.user && montado)) {
        setSessaoValida(true);
        setVerificandoSessao(false);
      }
    });

    return () => {
      montado = false;
      subscription.unsubscribe();
    };
  }, [supabase, searchParams]);

  async function aoSubmeter(e: React.FormEvent) {
    e.preventDefault();
    setErro('');

    if (novaSenha.length < 6) {
      setErro('A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }

    if (novaSenha !== confirmarSenha) {
      setErro('As senhas digitadas não coincidem.');
      return;
    }

    setCarregando(true);

    const resultado = await redefinirSenha(novaSenha);

    if (resultado.erro) {
      setErro(resultado.erro);
      setCarregando(false);
    } else {
      setSucesso(true);
      setCarregando(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-3 sm:p-6 relative overflow-hidden bg-[#080c14]">
      {/* Orbes de fundo */}
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
                Nova Senha
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Crie uma senha forte e segura
              </p>
            </div>
          </div>

          {verificandoSessao ? (
            <div className="text-center py-10 space-y-4">
              <Carregando texto="Validando link de recuperação..." />
            </div>
          ) : sucesso ? (
            /* Estado de Sucesso */
            <div className="text-center space-y-5 py-2 animar-entrar-baixo">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400 shadow-lg shadow-emerald-500/10">
                <CheckCircle2 size={36} />
              </div>

              <div className="space-y-2">
                <h2 className="text-lg font-bold font-titulo text-white">
                  Senha alterada com sucesso!
                </h2>
                <p className="text-xs text-slate-300 leading-relaxed max-w-sm mx-auto">
                  Sua nova senha já está ativa. Você pode agora fazer login com as novas credenciais.
                </p>
              </div>

              <div className="pt-3">
                <Botao
                  variante="festiva"
                  larguraTotal
                  tamanho="lg"
                  onClick={() => router.push('/autenticacao/entrar')}
                >
                  Ir para o Login 🚀
                </Botao>
              </div>
            </div>
          ) : !sessaoValida ? (
            /* Link Inválido ou Expirado */
            <div className="text-center space-y-5 py-2 animar-entrar-baixo">
              <div className="w-16 h-16 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center mx-auto text-red-400 shadow-lg shadow-red-500/10">
                <AlertCircle size={36} />
              </div>

              <div className="space-y-2">
                <h2 className="text-lg font-bold font-titulo text-white">
                  Link Inválido ou Expirado
                </h2>
                <p className="text-xs text-slate-300 leading-relaxed max-w-sm mx-auto">
                  {erro || 'O link de recuperação que você utilizou já foi usado ou expirou por motivos de segurança.'}
                </p>
              </div>

              <div className="pt-3 space-y-3">
                <Botao
                  variante="festiva"
                  larguraTotal
                  tamanho="lg"
                  onClick={() => router.push('/autenticacao/recuperar-senha')}
                >
                  Solicitar Novo Link
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
            /* Formulário de Nova Senha */
            <form onSubmit={aoSubmeter} className="space-y-4 sm:space-y-5">
              <div className="p-3.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-300 flex items-center gap-2">
                <ShieldCheck size={16} className="shrink-0 text-cyan-400" />
                <span>Link validado com segurança. Digite sua nova senha abaixo.</span>
              </div>

              <CampoTexto
                rotulo="Nova Senha"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={novaSenha}
                onChange={(e) => setNovaSenha((e.target as HTMLInputElement).value)}
                icone={<Lock size={18} />}
                required
              />

              <CampoTexto
                rotulo="Confirmar Nova Senha"
                type="password"
                placeholder="Repita a nova senha"
                value={confirmarSenha}
                onChange={(e) => setConfirmarSenha((e.target as HTMLInputElement).value)}
                icone={<Lock size={18} />}
                required
              />

              {erro && (
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
                disabled={carregando || !novaSenha || !confirmarSenha}
              >
                Salvar Nova Senha
              </Botao>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PaginaRedefinirSenha() {
  return (
    <Suspense fallback={<Carregando telaCheia texto="Carregando redefinição de senha..." />}>
      <FormularioRedefinirSenha />
    </Suspense>
  );
}
