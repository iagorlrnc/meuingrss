'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usarCookies } from '@/contextos/ContextoCookies';
import { Ticket, CreditCard, ShieldCheck, Mail, Copy, Check, HelpCircle } from 'lucide-react';
import Logo from '@/componentes/ui/Logo';
import Modal from '@/componentes/ui/Modal';
import { construirUrl } from '@/lib/dominios';
import { VERSAO_SISTEMA } from '@/lib/constantes';

export default function Rodape() {
  const { abrirBanner } = usarCookies();
  const [modalAjudaAberto, setModalAjudaAberto] = useState(false);
  const [copiado, setCopiado] = useState(false);

  function copiarEmail() {
    navigator.clipboard.writeText('suporte.meuingrss@gmail.com');
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  }

  const urlLoginDiretor = construirUrl('diretor', '/autenticacao/entrar');
  const urlLoginAdmin = construirUrl('admin', '/autenticacao/entrar');

  return (
    <>
      <footer className="border-t border-white/10 bg-[#060910] text-slate-400 font-sans relative z-10 pb-safe">
        {/* Top Accent Line */}
        <div className="h-1 w-full bg-gradient-to-r from-[#ff007a] via-[#8b5cf6] to-[#00e5ff]" />

        {/* Main Footer Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-8 sm:gap-10">
            {/* Brand Info Column */}
            <div className="sm:col-span-2 space-y-4">
              <Logo href="/" tamanhoIcone="md" tamanhoTexto="lg" />

              <p className="text-xs text-slate-400 leading-relaxed max-w-sm">
                A plataforma definitiva para compra e gestão de ingressos de eventos universitários organizados por atléticas. Entrada rápida e segura com QR Code.
              </p>

              <div className="flex flex-col space-y-2 pt-2 text-xs font-bold uppercase tracking-wider text-slate-300">
                <div className="flex items-center gap-2 text-emerald-400">
                  <ShieldCheck size={16} className="shrink-0" />
                  <span>Compra 100% Segura & Criptografada</span>
                </div>
              </div>
            </div>

            {/* Column 1: Navegação */}
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-white mb-4 flex items-center gap-1.5">
                Navegação
              </h4>
              <ul className="space-y-2.5 text-xs font-medium">
                <li>
                  <Link href="/" className="hover:text-white transition-colors">
                    Início
                  </Link>
                </li>
                <li>
                  <Link href="/eventos" className="hover:text-white transition-colors">
                    Todos os Eventos
                  </Link>
                </li>
                <li>
                  <Link href="/atleticas" className="hover:text-white transition-colors">
                    Atléticas Parceiras
                  </Link>
                </li>
                <li>
                  <Link href="/meus-ingressos" className="hover:text-[#ffbe00] transition-colors flex items-center gap-1">
                    Meus Ingressos
                  </Link>
                </li>
              </ul>
            </div>

            {/* Column 2: Conta & Acesso */}
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-white mb-4 flex items-center gap-1.5">
                Área de Acesso
              </h4>
              <ul className="space-y-2.5 text-xs font-medium">
                <li>
                  <Link href="/autenticacao/entrar" className="hover:text-white transition-colors">
                    Entrar na Conta
                  </Link>
                </li>
                <li>
                  <Link href="/autenticacao/cadastro" className="hover:text-white transition-colors">
                    Criar Conta Grátis
                  </Link>
                </li>
                <li>
                  <a href={urlLoginDiretor} className="hover:text-[#ff007a] transition-colors">
                    Painel do Diretor
                  </a>
                </li>
                <li>
                  <a href={urlLoginAdmin} className="hover:text-amber-400 transition-colors">
                    Administração
                  </a>
                </li>
              </ul>
            </div>

            {/* Column 3: Suporte & Regras */}
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-white mb-4 flex items-center gap-1.5">
                Informações
              </h4>
              <ul className="space-y-2.5 text-xs font-medium">
                <li>
                  <button
                    type="button"
                    onClick={() => setModalAjudaAberto(true)}
                    className="hover:text-[#00e5ff] transition-colors text-left flex items-center gap-1.5 cursor-pointer font-bold"
                  >
                    <span>Central de Ajuda</span>
                  </button>
                </li>
                <li>
                  <Link href="/termos-e-privacidade" className="hover:text-white transition-colors">
                    Termos & Privacidade
                  </Link>
                </li>
                <li>
                  <button
                    onClick={abrirBanner}
                    className="hover:text-[#ffbe00] transition-colors text-left flex items-center gap-1.5 cursor-pointer font-bold"
                  >
                    <span>Preferências de Cookies</span>
                  </button>
                </li>
              </ul>
            </div>
          </div>

          {/* Payment Methods & Bottom Bar */}
          <div className="border-t border-white/10 mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 text-[11px] text-slate-400">
              <span>
                © {new Date().getFullYear()} <strong className="text-white">Meu<span className="text-[#00e5ff]">ingrss</span></strong>
              </span>
              <span>•</span>
              <span>CNPJ: <strong className="text-slate-300 font-mono">68.627.894/0001-88</strong></span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium text-slate-400 bg-white/5 border border-white/10">
                {VERSAO_SISTEMA}
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2.5 text-slate-400">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Pagamento Seguro:</span>
              <div className="px-2.5 py-1 bg-[#111a2e] rounded-md border border-white/10 text-xs font-extrabold text-[#00e5ff]">
                PIX
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#111a2e] rounded-md border border-white/10 text-xs font-bold text-white">
                <CreditCard size={14} className="text-[#ff007a]" />
                <span>Cartão de Crédito</span>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* Modal de Central de Ajuda & Suporte */}
      <Modal
        aberto={modalAjudaAberto}
        aoFechar={() => setModalAjudaAberto(false)}
        titulo="Central de Ajuda & Suporte"
        descricao="Precisa de ajuda com suas compras ou dúvidas sobre o MeuIngrss?"
        tamanho="md"
      >
        <div className="space-y-5 text-slate-200">
          <div className="flex items-center gap-3.5 p-4 rounded-xl bg-[#162036] border border-white/10">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#38bdf8] to-[#00e5ff] flex items-center justify-center text-slate-950 shrink-0 shadow-lg font-bold">
              <Mail size={22} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white uppercase tracking-wider">E-mail Oficial de Atendimento</h4>
              <p className="text-xs text-slate-400 mt-0.5">Entre em contato diretamente com a nossa equipe de suporte.</p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#080c14] border border-[#00e5ff]/30 space-y-3 shadow-inner">
            <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
              <div className="flex items-center gap-2 text-sm sm:text-base font-black text-white font-titulo select-all break-all">
                <span>suporte.meuingrss@gmail.com</span>
              </div>

              <button
                type="button"
                onClick={copiarEmail}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#162036] hover:bg-[#00e5ff] text-white hover:text-slate-950 text-xs font-bold uppercase tracking-wider transition-all border border-white/10 shrink-0 cursor-pointer"
              >
                {copiado ? (
                  <>
                    <Check size={14} className="text-emerald-400" />
                    <span>Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    <span>Copiar</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="space-y-2 text-xs text-slate-400 bg-[#162036]/60 p-4 rounded-xl border border-white/5">
            <p className="flex items-center gap-2 text-[#00e5ff] font-bold">
              Atendimento Rápido
            </p>
            <p>
              Respondemos em até 24 horas úteis. Para agilizar o atendimento, informe o e-mail cadastrado ou o código do seu pedido.
            </p>
          </div>

          <div className="pt-2 flex justify-end gap-2 border-t border-white/10">
            <a
              href="mailto:suporte.meuingrss@gmail.com"
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#38bdf8] to-[#00e5ff] text-slate-950 font-black text-xs uppercase tracking-wider hover:brightness-110 transition-all flex items-center gap-1.5 shadow-md"
            >
              <Mail size={15} />
              Enviar E-mail Agora
            </a>
          </div>
        </div>
      </Modal>
    </>
  );
}
