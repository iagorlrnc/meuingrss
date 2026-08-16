'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usarAutenticacao } from '@/contextos/ContextoAutenticacao';
import Botao from '@/componentes/ui/Botao';
import CampoTexto from '@/componentes/ui/CampoTexto';
import { formatarTelefone, formatarCPF, validarCPF, avaliarSenha } from '@/lib/utilitarios';
import IndicadorForcaSenha from '@/componentes/ui/IndicadorForcaSenha';
import { criarClienteNavegador } from '@/lib/supabase/cliente';
import {
  Ticket,
  Mail,
  Lock,
  User,
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  Building2,
  Phone,
  Briefcase,
  Shield,
  MapPin,
  Check,
  Sparkles,
  Eye,
  EyeOff,
  Percent,
  Clock,
  QrCode,
  Award,
  CheckCircle2,
  ChevronDown,
  Trophy,
  CreditCard,
  KeyRound,
} from 'lucide-react';

import CaptchaCloudflare from '@/componentes/ui/CaptchaCloudflare';
import { useRateLimitAuth } from '@/hooks/useRateLimitAuth';

export default function PaginaCadastroDiretor() {
  const { cadastrar } = usarAutenticacao();
  const { bloqueado, segundosRestantes, mensagemRateLimit, aplicarStatus } = useRateLimitAuth();

  // Controle de etapas (1, 2 ou 3)
  const [etapa, setEtapa] = useState<1 | 2 | 3>(1);

  // Etapa 1: Dados Pessoais e de Contato
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [telefone, setTelefone] = useState('');
  const [cargo, setCargo] = useState('');

  // Etapa 2: Dados da Atlética
  const [atleticaNome, setAtleticaNome] = useState('');
  const [atleticaSigla, setAtleticaSigla] = useState('');
  const [atleticaCidade, setAtleticaCidade] = useState('');
  const [atleticaEstado, setAtleticaEstado] = useState('TO');

  // Etapa 3: Autenticação
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');

  // Estados de controle da página
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  const supabase = criarClienteNavegador();

  // Validação de E-mail via Código (OTP)
  const [codigoEnviado, setCodigoEnviado] = useState(false);
  const [enviandoCodigo, setEnviandoCodigo] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [validandoCodigo, setValidandoCodigo] = useState(false);
  const [emailVerificado, setEmailVerificado] = useState(false);
  const [tempoReenvio, setTempoReenvio] = useState(0);
  const [emailEnviado, setEmailEnviado] = useState('');

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
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          data: {
            nome,
            role: 'diretor',
            telefone,
            cpf,
            cargo,
            atleticaNome,
            atleticaSigla,
            atleticaCidade,
            atleticaEstado,
            atletica_nome: atleticaNome,
            atletica_sigla: atleticaSigla,
            atletica_cidade: atleticaCidade,
            atletica_estado: atleticaEstado,
          },
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

  function avancarEtapa1() {
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
    if (!telefone.trim()) {
      setErro('Por favor, informe um telefone de contato / WhatsApp.');
      return;
    }
    setEtapa(2);
  }

  function avancarEtapa2() {
    setErro('');
    if (!atleticaNome.trim()) {
      setErro('Por favor, informe o nome da Atlética ou Faculdade.');
      return;
    }
    setEtapa(3);
  }

  async function aoSubmeter(e: React.FormEvent) {
    e.preventDefault();
    if (bloqueado) return;

    setErro('');

    if (!email.trim() || !email.includes('@')) {
      setErro('Por favor, informe o email de acesso.');
      return;
    }

    if (!emailVerificado) {
      setErro('Verifique seu e-mail antes de concluir o cadastro.');
      return;
    }

    const statusSenha = avaliarSenha(senha);
    if (!statusSenha.valida) {
      setErro('A senha deve conter no mínimo 8 caracteres, 1 letra maiúscula, 1 número e 1 caractere especial (!@#$...).');
      return;
    }

    if (senha !== confirmarSenha) {
      setErro('As senhas não coincidem');
      return;
    }

    setCarregando(true);

    const resultado = await cadastrar(
      email,
      senha,
      nome,
      'diretor',
      {
        telefone,
        cpf,
        cargo,
        atleticaNome,
        atleticaSigla,
        atleticaCidade,
        atleticaEstado,
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
      // Redireciona diretamente para a tela de login do diretor exibindo o pop-up modal
      window.location.href = '/autenticacao/entrar?pendente=1';
    }
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-12 bg-[#080c14] relative overflow-hidden">
      {/* Elementos visuais de fundo (Orbes Neon) */}
      <div className="absolute top-0 -right-40 w-96 h-96 bg-[#ff007a]/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 -left-40 w-96 h-96 bg-[#8b5cf6]/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl h-96 bg-[#00e5ff]/5 rounded-full blur-3xl pointer-events-none" />

      {/* LADO ESQUERDO: Painel Informativo & Benefícios da Atlética (Desktop) */}
      <div className="hidden lg:flex lg:col-span-5 xl:col-span-5 flex-col justify-between p-12 xl:p-16 relative z-10 border-r border-white/10 bg-gradient-to-br from-[#0b101c]/90 via-[#080c14]/95 to-[#080c14]">
        <div>
          {/* Navegação Superior */}
          <Link
            href="/autenticacao/entrar"
            className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white transition-all uppercase tracking-wider bg-white/5 hover:bg-white/10 px-4 py-2 rounded-full border border-white/10 w-fit mb-12"
          >
            <ArrowLeft size={14} />
            Voltar ao login de diretor
          </Link>

          {/* Headline & Badges */}
          <div className="space-y-6">
            <h1 className="text-3xl xl:text-4xl font-black font-titulo text-white leading-tight tracking-tight">
              <span className="text-slate-400">Aumente as vendas de ingressos dos seus eventos com o</span>{' '}
              <span className="font-black italic tracking-tighter text-white font-titulo inline-flex items-center gap-0.5">
                Meu<span className="text-[#00e5ff]">ingrss</span>
              </span>
            </h1>

            <p className="text-sm text-slate-300 font-normal leading-relaxed">
              Junte-se às maiores atléticas universitárias. Gerencie vendas, lotes promocionais e entrada de público em um único lugar.
            </p>
          </div>

          {/* Apresentação da Plataforma meuingrss */}

          <div className="space-y-3.5 mt-8">
            <div className="p-4 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 hover:border-[#00e5ff]/30 transition-all flex items-start gap-3.5 group">
              <div className="w-10 h-10 rounded-xl bg-[#00e5ff]/15 text-[#00e5ff] flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-110 transition-transform">
                <Trophy size={20} />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-white group-hover:text-[#00e5ff] transition-colors">Perfil & Eventos da Atlética</h4>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  Página personalizada com os dados, história, contatos e todos os eventos da sua atlética reunidos em um só lugar.
                </p>
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 hover:border-[#ff007a]/30 transition-all flex items-start gap-3.5 group">
              <div className="w-10 h-10 rounded-xl bg-[#ff007a]/15 text-[#ff007a] flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-110 transition-transform">
                <Ticket size={20} />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-white group-hover:text-[#ff007a] transition-colors">Vendas & Lotes Automáticos</h4>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  Crie eventos em minutos, programe viradas de lote por quantidade ou horário e acompanhe o faturamento.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 hover:border-[#8b5cf6]/30 transition-all flex items-start gap-3.5 group">
              <div className="w-10 h-10 rounded-xl bg-[#8b5cf6]/15 text-[#8b5cf6] flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-110 transition-transform">
                <QrCode size={20} />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-white group-hover:text-[#8b5cf6] transition-colors">Check-in por QR Code</h4>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  Validação instantânea de ingressos na portaria direto pelo celular da equipe da atlética, sem filas nem fraudes.
                </p>
              </div>
            </div>

            
          </div>
        </div>

        {/* Resumo Dinâmico do Cadastro */}
        {(nome || atleticaNome) && (
          <div className="p-4 rounded-2xl bg-[#162036]/60 border border-white/10 text-xs space-y-2 mt-6">
            <span className="text-[10px] font-black uppercase text-[#00e5ff] tracking-wider block">Resumo dos Dados</span>
            {nome && <p className="text-slate-300"><strong className="text-white">{nome}</strong> {cargo ? `(${cargo})` : ''}</p>}
            {atleticaNome && <p className="text-slate-300"><strong className="text-white">{atleticaNome}</strong> {atleticaSigla ? `[${atleticaSigla}]` : ''}</p>}
          </div>
        )}
      </div>

      {/* LADO DIREITO: Formulario Step Wizard */}
      <div className="lg:col-span-7 xl:col-span-7 flex flex-col justify-center items-center p-3 sm:p-8 lg:p-12 relative z-10 w-full">
        {/* Botão de voltar visível apenas no mobile */}
        <div className="w-full max-w-xl lg:hidden mb-4 sm:mb-6">
          <Link
            href="/autenticacao/entrar"
            className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white transition-all uppercase tracking-wider bg-white/5 hover:bg-white/10 px-3.5 py-2 rounded-full border border-white/10"
          >
            <ArrowLeft size={14} />
            Voltar ao login do diretor
          </Link>
        </div>

        <div className="w-full max-w-xl vidro-forte rounded-3xl p-4 sm:p-8 md:p-10 shadow-2xl animar-entrar-baixo border border-white/15 backdrop-blur-2xl bg-[#0d1322]/90">
          {/* Cabeçalho */}
          <div className="flex items-center gap-3.5 sm:gap-4 mb-6 sm:mb-8 pb-5 sm:pb-6 border-b border-white/10">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-[#ff007a] via-[#8b5cf6] to-[#026cdf] flex items-center justify-center shadow-lg shadow-purple-500/20 shrink-0">
              <Ticket className="w-6 h-6 sm:w-7 sm:h-7 text-white transform -rotate-12" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black font-titulo text-white tracking-tight">
                Cadastro de Atlética
              </h1>
              <p className="text-xs text-slate-400">
                Registre sua atlética para gerenciar ingressos e eventos.
              </p>
            </div>
          </div>

          {/* Indicador de Etapas (Step Wizard) */}
          <div className="mb-6 sm:mb-8 bg-[#080c14]/70 p-3 sm:p-4 rounded-2xl border border-white/10">
            <div className="relative flex justify-between items-start">
              {/* Linha de fundo delimitada exatamente entre os ícones das extremidades */}
              <div className="absolute top-4 sm:top-5 left-[16.666%] right-[16.666%] h-1 bg-white/10 z-0 rounded-full" />
              {/* Linha de progresso ativa */}
              <div
                className="absolute top-4 sm:top-5 left-[16.666%] h-1 bg-gradient-to-r from-[#ff007a] via-[#8b5cf6] to-[#00e5ff] transition-all duration-500 z-0 rounded-full shadow-[0_0_12px_rgba(255,0,122,0.8)]"
                style={{
                  width: etapa === 1 ? '0%' : etapa === 2 ? '33.333%' : '66.666%',
                }}
              />

              {/* Etapa 1 Node */}
              <div className="relative z-10 flex flex-col items-center text-center gap-1.5 sm:gap-2 flex-1">
                <button
                  type="button"
                  onClick={() => {
                    if (etapa > 1) { setErro(''); setEtapa(1); }
                  }}
                  className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                    etapa === 1
                      ? 'bg-gradient-to-br from-[#ff007a] to-[#8b5cf6] text-white ring-4 ring-[#ff007a]/30 shadow-lg shadow-[#ff007a]/40 scale-105 sm:scale-110'
                      : etapa > 1
                      ? 'bg-emerald-500 text-white cursor-pointer shadow-md'
                      : 'bg-[#162036] text-slate-400 border border-white/10'
                  }`}
                >
                  {etapa > 1 ? <Check size={16} className="stroke-[3]" /> : <User size={16} />}
                </button>
                <span className={`text-[10px] sm:text-[11px] font-black uppercase tracking-wider leading-tight ${etapa >= 1 ? 'text-[#ff007a]' : 'text-slate-500'}`}>
                  <span className="hidden sm:inline">1. Dados Pessoais</span>
                  <span className="sm:hidden">1. Pessoal</span>
                </span>
              </div>

              {/* Etapa 2 Node */}
              <div className="relative z-10 flex flex-col items-center text-center gap-1.5 sm:gap-2 flex-1">
                <button
                  type="button"
                  onClick={() => {
                    if (etapa > 2) { setErro(''); setEtapa(2); }
                    else if (etapa === 1) { avancarEtapa1(); }
                  }}
                  className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                    etapa === 2
                      ? 'bg-gradient-to-br from-[#ff007a] to-[#8b5cf6] text-white ring-4 ring-[#ff007a]/30 shadow-lg shadow-[#ff007a]/40 scale-105 sm:scale-110'
                      : etapa > 2
                      ? 'bg-emerald-500 text-white cursor-pointer shadow-md'
                      : 'bg-[#162036] text-slate-400 border border-white/10'
                  }`}
                >
                  {etapa > 2 ? <Check size={16} className="stroke-[3]" /> : <Trophy size={16} />}
                </button>
                <span className={`text-[10px] sm:text-[11px] font-black uppercase tracking-wider leading-tight ${etapa >= 2 ? 'text-[#8b5cf6]' : 'text-slate-500'}`}>
                  2. Atlética
                </span>
              </div>

              {/* Etapa 3 Node */}
              <div className="relative z-10 flex flex-col items-center text-center gap-1.5 sm:gap-2 flex-1">
                <button
                  type="button"
                  onClick={() => {
                    if (etapa === 2) { avancarEtapa2(); }
                  }}
                  className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                    etapa === 3
                      ? 'bg-gradient-to-br from-[#ff007a] to-[#8b5cf6] text-white ring-4 ring-[#ff007a]/30 shadow-lg shadow-[#ff007a]/40 scale-105 sm:scale-110'
                      : 'bg-[#162036] text-slate-400 border border-white/10'
                  }`}
                >
                  <Lock size={16} />
                </button>
                <span className={`text-[10px] sm:text-[11px] font-black uppercase tracking-wider leading-tight ${etapa >= 3 ? 'text-[#00e5ff]' : 'text-slate-500'}`}>
                  <span className="hidden sm:inline">3. Autenticação</span>
                  <span className="sm:hidden">3. Acesso</span>
                </span>
              </div>
            </div>
          </div>

          {/* Formulário Multietapas */}
          <form onSubmit={aoSubmeter} className="space-y-6">
            {/* ETAPA 1: Dados Pessoais e de Contato */}
            {etapa === 1 && (
              <div className="space-y-5 animar-entrar-baixo">
                <div className="bg-[#162036]/50 p-4 rounded-xl border border-white/10 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                      <User size={16} className="text-[#ff007a]" />
                      Etapa 1: Dados Pessoais
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Identificação do diretor responsável.
                    </p>
                  </div>
                </div>

                <CampoTexto
                  rotulo="Nome completo do diretor"
                  type="text"
                  placeholder="Ex: Carlos Silva"
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

                <CampoTexto
                  rotulo="Telefone / WhatsApp"
                  type="tel"
                  placeholder="(63) 99999-9999"
                  value={telefone}
                  onChange={(e) => {
                    setErro('');
                    setTelefone(formatarTelefone((e.target as HTMLInputElement).value));
                  }}
                  icone={<Phone size={18} />}
                  maxLength={15}
                  required
                />

                <div className="space-y-1.5 w-full">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                    Cargo ou Função na Atlética
                  </label>
                  <div className="relative group">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#ff007a] transition-colors pointer-events-none z-10">
                      <Briefcase size={18} />
                    </span>
                    <select
                      value={cargo}
                      onChange={(e) => {
                        setErro('');
                        setCargo(e.target.value);
                      }}
                      className="w-full bg-[#111a2e]/90 border border-white/10 rounded-xl px-4 py-3 pl-11 pr-10 text-sm text-white placeholder:text-slate-500 font-normal transition-all duration-300 ease-out hover:border-white/20 hover:bg-[#16223d] focus:outline-none focus:border-[#ff007a] focus:ring-2 focus:ring-[#ff007a]/25 appearance-none cursor-pointer"
                    >
                      <option value="" className="bg-[#0d1322] text-slate-400">
                        Selecione o cargo...
                      </option>
                      <option value="Presidente" className="bg-[#0d1322] text-white">
                        Presidente
                      </option>
                      <option value="Vice-presidente" className="bg-[#0d1322] text-white">
                        Vice-presidente
                      </option>
                      <option value="Secretário" className="bg-[#0d1322] text-white">
                        Secretário
                      </option>
                      <option value="Tesoureiro / Diretor Financeiro" className="bg-[#0d1322] text-white">
                        Tesoureiro / Diretor Financeiro
                      </option>
                      <option value="Diretor de Esportes" className="bg-[#0d1322] text-white">
                        Diretor de Esportes
                      </option>
                      <option value="Diretor de Marketing" className="bg-[#0d1322] text-white">
                        Diretor de Marketing
                      </option>
                      <option value="Diretor de Eventos" className="bg-[#0d1322] text-white">
                        Diretor de Eventos
                      </option>
                    </select>
                    <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                      <ChevronDown size={18} />
                    </div>
                  </div>
                </div>

                {erro && (
                  <div className="p-3.5 rounded-xl bg-red-500/15 border border-red-500/30 text-xs font-semibold text-red-400 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-400 animate-ping shrink-0" />
                    {erro}
                  </div>
                )}

                <Botao
                  type="button"
                  variante="festiva"
                  larguraTotal
                  tamanho="lg"
                  onClick={avancarEtapa1}
                  icone={<ArrowRight size={18} />}
                >
                  Próximo Passo: Dados da Atlética
                </Botao>
              </div>
            )}

            {/* ETAPA 2: Dados da Atlética */}
            {etapa === 2 && (
              <div className="space-y-5 animar-entrar-baixo">
                <div className="bg-[#162036]/50 p-4 rounded-xl border border-white/10 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                      <Trophy size={16} className="text-[#8b5cf6]" />
                      Etapa 2: Dados da Atlética
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Informações da atlética.
                    </p>
                  </div>
                </div>

                <CampoTexto
                  rotulo="Nome da Atlética"
                  type="text"
                  placeholder="Ex: Atlética Cibernética"
                  value={atleticaNome}
                  onChange={(e) => {
                    setErro('');
                    setAtleticaNome((e.target as HTMLInputElement).value);
                  }}
                  icone={<Trophy size={18} />}
                  required
                />

                <CampoTexto
                  rotulo="Universidade/Faculdade"
                  type="text"
                  placeholder="Ex: UFT"
                  value={atleticaSigla}
                  onChange={(e) => {
                    setErro('');
                    setAtleticaSigla((e.target as HTMLInputElement).value);
                  }}
                  icone={<Building2 size={18} />}
                />

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <CampoTexto
                      rotulo="Cidade / Campus"
                      type="text"
                      placeholder="Ex: Palmas"
                      value={atleticaCidade}
                      onChange={(e) => {
                        setErro('');
                        setAtleticaCidade((e.target as HTMLInputElement).value);
                      }}
                      icone={<MapPin size={18} />}
                    />
                  </div>
                  <div className="space-y-1.5 w-full">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                      Estado
                    </label>
                    <div className="relative group">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#8b5cf6] transition-colors pointer-events-none z-10">
                        <MapPin size={18} />
                      </span>
                      <select
                        value={atleticaEstado}
                        onChange={(e) => {
                          setErro('');
                          setAtleticaEstado(e.target.value);
                        }}
                        className="w-full bg-[#111a2e]/90 border border-white/10 rounded-xl px-4 py-3 pl-11 pr-10 text-base sm:text-sm min-h-[44px] text-white placeholder:text-slate-500 font-normal transition-all duration-300 ease-out hover:border-white/20 hover:bg-[#16223d] focus:outline-none focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/25 appearance-none cursor-pointer"
                      >
                        <option value="TO" className="bg-[#0d1322] text-white">
                          TO
                        </option>
                      </select>
                      <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                        <ChevronDown size={18} />
                      </div>
                    </div>
                  </div>
                </div>

                {erro && (
                  <div className="p-3.5 rounded-xl bg-red-500/15 border border-red-500/30 text-xs font-semibold text-red-400 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-400 animate-ping shrink-0" />
                    {erro}
                  </div>
                )}

                <div className="flex items-center gap-3 pt-2">
                  <Botao
                    type="button"
                    variante="fantasma"
                    onClick={() => { setErro(''); setEtapa(1); }}
                    icone={<ArrowLeft size={16} />}
                  >
                    Voltar
                  </Botao>

                  <div className="flex-1">
                    <Botao
                      type="button"
                      variante="festiva"
                      larguraTotal
                      tamanho="lg"
                      onClick={avancarEtapa2}
                      icone={<ArrowRight size={18} />}
                    >
                      Próximo Passo: Autenticação
                    </Botao>
                  </div>
                </div>
              </div>
            )}

            {/* ETAPA 3: Dados de Autenticação */}
            {etapa === 3 && (
              <div className="space-y-5 animar-entrar-baixo">
                <div className="bg-[#162036]/50 p-4 rounded-xl border border-white/10 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                      <Lock size={16} className="text-[#00e5ff]" />
                      Etapa 3: Autenticação
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Credenciais para acesso ao painel do diretor.
                    </p>
                  </div>
                </div>

                {/* Verificação de E-mail com Validação Instantânea */}
                <div className="space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                    <div className="flex-1 min-w-0">
                      <CampoTexto
                        rotulo="Email corporativo ou da atlética"
                        type="email"
                        placeholder="diretor@atletica.com.br"
                        value={email}
                        onChange={(e) => {
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
                  placeholder="Repita a senha cadastrada"
                  value={confirmarSenha}
                  onChange={(e) => setConfirmarSenha((e.target as HTMLInputElement).value)}
                  icone={<Lock size={18} />}
                  required
                />

                <IndicadorForcaSenha senha={senha} />

                {bloqueado && (
                  <div className="p-4 rounded-2xl bg-red-500/15 border border-red-500/30 text-xs font-semibold text-red-400 flex items-start gap-3 animar-entrar-baixo">
                    <div className="w-8 h-8 rounded-xl bg-red-500/20 flex items-center justify-center shrink-0 text-red-400 font-bold mt-0.5">
                      <Clock size={18} className="animate-spin" />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-sm text-red-300">IP Bloqueado Temporariamente</p>
                      <p className="mt-1 leading-relaxed text-slate-300">
                        {mensagemRateLimit || 'Muitas tentativas erradas em sequência.'}
                      </p>
                      <div className="mt-2 text-xs font-mono font-bold text-red-400 flex items-center gap-1.5">
                        Tente novamente em: <span className="bg-red-950/80 px-2 py-0.5 rounded border border-red-500/30 text-red-300 text-sm font-bold">{segundosRestantes}s</span>
                      </div>
                    </div>
                  </div>
                )}

                {erro && !bloqueado && (
                  <div className="p-3.5 rounded-xl bg-red-500/15 border border-red-500/30 text-xs font-semibold text-red-400 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-400 animate-ping shrink-0" />
                    {erro}
                  </div>
                )}

                <CaptchaCloudflare
                  onVerify={(token) => setTurnstileToken(token)}
                  onExpire={() => setTurnstileToken('')}
                  onError={() => setTurnstileToken('')}
                />

                <div className="flex items-center gap-3 pt-2">
                  <Botao
                    type="button"
                    variante="fantasma"
                    onClick={() => { setErro(''); setEtapa(2); }}
                    icone={<ArrowLeft size={16} />}
                  >
                    Voltar
                  </Botao>

                  <div className="flex-1">
                    <Botao
                      type="submit"
                      variante="festiva"
                      larguraTotal
                      tamanho="lg"
                      carregando={carregando}
                      disabled={bloqueado || carregando || !turnstileToken}
                    >
                      {bloqueado ? `Aguarde ${segundosRestantes}s` : 'Cadastrar e Solicitar Acesso'}
                    </Botao>
                  </div>
                </div>
              </div>
            )}
          </form>

          {/* Rodapé / Link para Login */}
          <div className="mt-8 pt-6 border-t border-white/10 text-center">
            <p className="text-xs text-slate-400">
              Já possui uma conta de diretor cadastrada?{' '}
              <Link
                href="/autenticacao/entrar"
                className="text-[#00e5ff] hover:text-[#00e5ff]/80 underline font-bold transition-colors ml-1"
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



