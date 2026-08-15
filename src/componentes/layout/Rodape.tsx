'use client';

import Link from 'next/link';
import { usarCookies } from '@/contextos/ContextoCookies';
import { Ticket, CreditCard, ShieldCheck } from 'lucide-react';
import Logo from '@/componentes/ui/Logo';
import { construirUrl } from '@/lib/dominios';

export default function Rodape() {
  const { abrirBanner } = usarCookies();

  const urlLoginDiretor = construirUrl('diretor', '/autenticacao/entrar');
  const urlLoginAdmin = construirUrl('admin', '/autenticacao/entrar');

  return (
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
                  <Ticket size={12} />
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
                <Link href="/termos-e-privacidade" className="hover:text-[#00e5ff] transition-colors font-bold">
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
          <p className="text-[11px] text-slate-400">
            © {new Date().getFullYear()} <strong className="text-white">MeuIngrss</strong> — Todos os direitos reservados. Plataforma oficial de vendas universitárias.
          </p>

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
  );
}
