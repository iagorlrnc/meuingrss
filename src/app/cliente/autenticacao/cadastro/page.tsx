'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usarAutenticacao } from '@/contextos/ContextoAutenticacao';
import Botao from '@/componentes/ui/Botao';
import CampoTexto from '@/componentes/ui/CampoTexto';
import { formatarTelefone, formatarCPF, validarCPF, avaliarSenha } from '@/lib/utilitarios';
import IndicadorForcaSenha from '@/componentes/ui/IndicadorForcaSenha';
import { criarClienteNavegador } from '@/lib/supabase/cliente';
import CaptchaCloudflare from '@/componentes/ui/CaptchaCloudflare';
import { useRateLimitAuth } from '@/hooks/useRateLimitAuth';
import {
  Ticket,
  Mail,
  Lock,
  User,
  ArrowLeft,
  CheckCircle,
  Phone,
  CreditCard,
  KeyRound,
  ShieldCheck,
  Clock,
} from 'lucide-react';

export default function PaginaCadastro() {
  const { cadastrar } = usarAutenticacao();
  const { bloqueado, segundosRestantes, mensagemRateLimit, aplicarStatus } = useRateLimitAuth();
  const supabase = criarClienteNavegador();

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [cpf, setCpf] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');

  // Validação de E-mail via Código (OTP)
  const [codigoEnviado, setCodigoEnviado] = useState(false);
  const [enviandoCodigo, setEnviandoCodigo] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [validandoCodigo, setValidandoCodigo] = useState(false);
  const [emailVerificado, setEmailVerificado] = useState(false);
  const [tempoReenvio, setTempoReenvio] = useState(0);
  const [emailEnviado, setEmailEnviado] = useState('');

  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState(false);
  const [carregando, setCarregando] = useState(false);

  // Contador regressivo para reenviar código
  useEffect(() => {
    if (tempoReenvio <= 0) return;
    const interval = setInterval(() => {
      setTempoReenvio((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [tempoReenvio]);

  async function enviarCodigoValidacao() {
    setErro('');
    if (!email || !email.includes('@')) {
      setErro('Informe um e-mail válido para receber o código.');
      return;
    }

    if (enviandoCodigo || (email === emailEnviado && tempoReenvio > 0)) return;

    setEnviandoCodigo(true);
    try {
      // Tenta enviar o OTP via Supabase Auth
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
        },
      });

      if (error) {
        const msg = error.message || '';
        if (msg.includes('rate limit') || msg.includes('over_email_send_rate_limit') || error.status === 429) {
          setErro(
            'Limite de envio de e-mails atingido (Supabase/SMTP). Aguarde alguns minutos ou certifique-se de que o Custom SMTP (Brevo) está ativado no Supabase.'
          );
        } else if (msg.includes('Error sending confirmation email') || msg.includes('confirmation email') || msg.includes('smtp') || msg.includes('SMTP')) {
          setErro(
            'Configuração de e-mail necessária: No painel do Supabase (Authentication -> Email Settings), altere o campo "Sender Email" (Remetente) para o mesmo e-mail validado na sua conta da Brevo.'
          );
        } else {
          setErro(msg);
        }
      } else {
        setCodigoEnviado(true);
        setEmailEnviado(email);
        setTempoReenvio(60);
      }
    } catch {
      setErro('Erro de conexão ao enviar o código de validação.');
    } finally {
      setEnviandoCodigo(false);
    }
  }

  async function validarCodigoOtp() {
    setErro('');
    if (codigo.length < 6) {
      setErro('Digite o código de 6 dígitos enviado para seu e-mail.');
      return;
    }

    setValidandoCodigo(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: codigo,
        type: 'email',
      });

      if (error) {
        setErro('Código de verificação inválido ou expirado.');
      } else {
        setEmailVerificado(true);
      }
    } catch {
      setErro('Erro de conexão ao validar o código.');
    } finally {
      setValidandoCodigo(false);
    }
  }

  async function aoSubmeter(e: React.FormEvent) {
    e.preventDefault();
    if (bloqueado) return;

    setErro('');

    if (!nome.trim()) {
      setErro('Por favor, informe seu nome completo.');
      return;
    }

    if (!cpf.trim()) {
      setErro('Por favor, informe seu CPF.');
      return;
    }

    if (!validarCPF(cpf)) {
      setErro('Por favor, informe um CPF válido.');
      return;
    }

    if (!email.trim() || !email.includes('@')) {
      setErro('Por favor, informe um e-mail válido.');
      return;
    }

    if (!emailVerificado) {
      setErro('Valide seu e-mail antes de concluir o cadastro.');
      return;
    }

    const statusSenha = avaliarSenha(senha);
    if (!statusSenha.valida) {
      setErro('A senha deve conter no mínimo 8 caracteres, 1 letra maiúscula, 1 número e 1 caractere especial (!@#$...).');
      return;
    }

    if (senha !== confirmarSenha) {
      setErro('As senhas não coincidem.');
      return;
    }

    setCarregando(true);

    const resultado = await cadastrar(
      email,
      senha,
      nome,
      'cliente',
      {
        telefone,
        cpf,
      },
      turnstileToken
    );

    if (resultado.erro) {
      if (resultado.rateLimitData) {
        aplicarStatus(resultado.rateLimitData);
      }
      setErro(resultado.erro);
      setCarregando(false);
    } else {
      setSucesso(true);
      setCarregando(false);
    }
  }

  if (sucesso) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#080c14] relative overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="vidro-forte rounded-3xl p-8 sm:p-10 shadow-2xl max-w-md w-full text-center animar-entrar-escala border border-emerald-500/30 relative z-10 backdrop-blur-xl">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-500/10">
            <CheckCircle className="w-10 h-10 text-emerald-400" />
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-3">
            Sucesso
          </span>
          <h2 className="text-2xl font-black font-titulo text-white mb-3 tracking-tight">
            Cadastro realizado!
          </h2>
          <p className="text-sm text-slate-300 mb-6 leading-relaxed">
            Sua conta foi criada e seu e-mail <strong className="text-white font-medium">{email}</strong> foi validado com sucesso!
          </p>
          <Link href="/autenticacao/entrar">
            <Botao variante="festiva" larguraTotal tamanho="lg">
              Ir para o Login
            </Botao>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-3 sm:p-6 py-6 sm:py-12 bg-[#080c14] relative overflow-hidden">
      {/* Elementos visuais de fundo (Orbes Neon) */}
      <div className="absolute -top-32 -right-32 w-96 h-96 bg-[#ff007a]/25 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-[#8b5cf6]/25 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg h-96 bg-[#026cdf]/15 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white transition-all uppercase tracking-wider mb-4 sm:mb-6 bg-white/5 hover:bg-white/10 px-3.5 py-2 rounded-full border border-white/10"
        >
          <ArrowLeft size={14} />
          Voltar ao início
        </Link>

        <div className="vidro-forte rounded-3xl p-4 sm:p-8 shadow-2xl shadow-purple-500/10 animar-entrar-baixo border border-white/15 backdrop-blur-2xl bg-[#0d1322]/85">
          {/* Cabeçalho */}
          <div className="flex items-center gap-3.5 sm:gap-4 mb-6 pb-5 sm:pb-6 border-b border-white/10">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-[#ff007a] via-[#8b5cf6] to-[#026cdf] flex items-center justify-center shadow-lg shadow-purple-500/20 shrink-0">
              <Ticket className="w-6 h-6 text-white transform -rotate-12" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black font-titulo text-white tracking-tight">
                Criar Conta
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Cadastre-se na meuingrss para garantir seus ingressos
              </p>
            </div>
          </div>

          {/* Formulário */}
          <form onSubmit={aoSubmeter} className="space-y-4">
            <CampoTexto
              rotulo="Nome completo"
              type="text"
              placeholder="Seu nome"
              value={nome}
              onChange={(e) => {
                setErro('');
                setNome((e.target as HTMLInputElement).value);
              }}
              icone={<User size={18} />}
              required
            />

            <div className="space-y-1">
              <CampoTexto
                rotulo="CPF"
                type="text"
                placeholder="000.000.000-00"
                value={cpf}
                onChange={(e) => {
                  setErro('');
                  setCpf(formatarCPF((e.target as HTMLInputElement).value));
                }}
                icone={<CreditCard size={18} />}
                required
              />
              {cpf.replace(/\D/g, '').length === 11 && (
                validarCPF(cpf) ? (
                  <p className="text-[11px] font-semibold text-emerald-400 pl-1 flex items-center gap-1">
                    <span>✓</span> CPF válido
                  </p>
                ) : (
                  <p className="text-[11px] font-semibold text-red-400 pl-1 flex items-center gap-1">
                    <span>✕</span> CPF inválido. Verifique os números digitados.
                  </p>
                )
              )}
            </div>

            {/* Verificação de E-mail com Validação Instantânea */}
            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                <div className="flex-1 min-w-0">
                  <CampoTexto
                    rotulo="Email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => {
                      setErro('');
                      const novoEmail = (e.target as HTMLInputElement).value;
                      setEmail(novoEmail);
                      if (novoEmail !== emailEnviado) {
                        setEmailVerificado(false);
                        setCodigoEnviado(false);
                        setTempoReenvio(0);
                      }
                    }}
                    icone={<Mail size={18} />}
                    required
                  />
                </div>

                {!emailVerificado && (
                  <Botao
                    type="button"
                    variante="contorno"
                    tamanho="md"
                    carregando={enviandoCodigo}
                    disabled={!email || !email.includes('@') || enviandoCodigo || (email === emailEnviado && tempoReenvio > 0)}
                    onClick={enviarCodigoValidacao}
                    className="shrink-0 h-[46px] text-xs px-3.5 border-white/20 hover:border-[#00e5ff] text-slate-300 hover:text-white whitespace-nowrap w-full sm:w-auto"
                  >
                    {email === emailEnviado && tempoReenvio > 0 ? `Aguarde ${tempoReenvio}s` : codigoEnviado ? 'Reenviar' : 'Verificar'}
                  </Botao>
                )}
              </div>

              {!emailVerificado && email.includes('@') && !codigoEnviado && (
                <p className="text-[11px] font-semibold text-amber-400 flex items-center gap-1.5 pt-0.5">
                  <span>Clique em <strong>"Verificar"</strong> para receber o código no seu e-mail.</span>
                </p>
              )}

              {/* Status de E-mail Verificado */}
              {emailVerificado && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs font-bold text-emerald-400 animar-entrar-escala">
                  <ShieldCheck size={16} className="shrink-0" />
                  <span>E-mail verificado com sucesso!</span>
                </div>
              )}

              {/* Caixa para Digitar e Confirmar Código (OTP) */}
              {codigoEnviado && !emailVerificado && (
                <div className="p-3.5 rounded-2xl bg-[#162036] border border-[#00e5ff]/30 space-y-3 animar-entrar-baixo">
                  <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <KeyRound size={14} className="text-[#00e5ff] shrink-0" />
                    <span>Digite o código de 6 dígitos enviado para seu e-mail:</span>
                  </label>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="000000"
                      value={codigo}
                      onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
                      className="flex-1 min-w-0 bg-[#080c14] border border-white/15 rounded-xl px-3 sm:px-4 py-2.5 text-center text-base sm:text-lg font-black font-mono tracking-widest text-white focus:outline-none focus:border-[#00e5ff]"
                    />

                    <Botao
                      type="button"
                      variante="festiva"
                      tamanho="md"
                      carregando={validandoCodigo}
                      disabled={codigo.length < 6 || validandoCodigo}
                      onClick={validarCodigoOtp}
                      className="shrink-0 h-[44px] text-xs px-3 sm:px-4 whitespace-nowrap"
                    >
                      Validar
                    </Botao>
                  </div>
                </div>
              )}
            </div>

            <CampoTexto
              rotulo="Telefone / WhatsApp"
              type="tel"
              placeholder="(00) 00000-0000"
              value={telefone}
              onChange={(e) => setTelefone(formatarTelefone((e.target as HTMLInputElement).value))}
              icone={<Phone size={18} />}
              required
            />

            <CampoTexto
              rotulo="Senha"
              type="password"
              placeholder="Ex: Senha#2026"
              value={senha}
              onChange={(e) => setSenha((e.target as HTMLInputElement).value)}
              icone={<Lock size={18} />}
              required
            />

            <CampoTexto
              rotulo="Confirmar senha"
              type="password"
              placeholder="Repita a senha"
              value={confirmarSenha}
              onChange={(e) => setConfirmarSenha((e.target as HTMLInputElement).value)}
              icone={<Lock size={18} />}
              required
            />

            <IndicadorForcaSenha senha={senha} />

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
              <div className="p-3 sm:p-3.5 rounded-xl bg-red-500/15 border border-red-500/30 text-xs font-semibold text-red-400 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-400 animate-ping shrink-0" />
                <span>{erro}</span>
              </div>
            )}

            <CaptchaCloudflare
              onVerify={(token) => setTurnstileToken(token)}
              onExpire={() => setTurnstileToken('')}
              onError={() => setTurnstileToken('')}
            />

            <Botao type="submit" variante="festiva" larguraTotal tamanho="lg" carregando={carregando} disabled={bloqueado || carregando || !turnstileToken}>
              {bloqueado ? `Aguarde ${segundosRestantes}s` : 'Criar conta'}
            </Botao>
          </form>



          {/* Rodapé */}
          <div className="mt-6 sm:mt-8 pt-5 sm:pt-6 border-t border-white/10 text-center">
            <p className="text-xs text-slate-400">
              Já tem uma conta?{' '}
              <Link
                href="/autenticacao/entrar"
                className="text-[#00e5ff] hover:underline font-bold transition-colors ml-1 inline-block"
              >
                Entrar
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
