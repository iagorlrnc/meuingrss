'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Compass, Home, ArrowLeft, Ticket, CalendarDays } from 'lucide-react';
import Botao from '@/componentes/ui/Botao';
import Logo from '@/componentes/ui/Logo';

export default function PaginaNaoEncontrada() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#080c14] text-white flex flex-col items-center justify-center p-4 sm:p-6 selection:bg-[#ff007a] selection:text-white relative overflow-hidden">
      {/* Background Decorative Glow Blobs */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-to-tr from-[#ff007a]/20 via-[#8b5cf6]/20 to-[#00e5ff]/20 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-72 h-72 bg-[#026cdf]/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Header Bar Centered close to main */}
      <header className="mb-4 sm:mb-5 relative z-10 text-center">
        <Logo href="/" tamanhoIcone="md" tamanhoTexto="lg" className="mx-auto" />
      </header>

      {/* Central 404 Hero Section */}
      <main className="w-full max-w-xl relative z-10">
        <div className="w-full text-center space-y-8 bg-[#0b101d]/80 border border-white/10 rounded-3xl p-8 sm:p-12 backdrop-blur-xl shadow-2xl relative overflow-hidden">
          
          {/* Neon Top Bar */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#ff007a] via-[#8b5cf6] to-[#00e5ff]" />

          {/* 404 Animated Badge */}
          <div className="relative inline-flex items-center justify-center mx-auto">
            <div className="absolute -inset-3 bg-gradient-to-r from-[#ff007a] via-[#8b5cf6] to-[#00e5ff] rounded-3xl opacity-30 blur-xl animate-pulse" />
            <div className="relative bg-[#111a2e] border border-white/15 px-8 py-3 rounded-2xl flex items-center justify-center shadow-inner">
              <span className="text-6xl sm:text-7xl font-black tracking-normal text-transparent bg-clip-text bg-gradient-to-r from-[#ff007a] via-[#00e5ff] to-white inline-block px-3 py-1 leading-none select-none text-center">
                404
              </span>
            </div>
          </div>

          {/* Title & Description */}
          <div className="space-y-3">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white font-titulo">
              Página Não Encontrada
            </h1>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed max-w-md mx-auto">
              Ops! Parece que o ingresso para essa página não existe ou o endereço foi alterado.
            </p>
          </div>

          {/* Primary Action Buttons */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/" className="w-full sm:w-auto">
              <Botao variante="festiva" tamanho="lg" icone={<Home size={18} />} larguraTotal>
                Voltar para o Início
              </Botao>
            </Link>

            <button
              onClick={() => router.back()}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white font-bold text-sm transition-all min-h-[48px] touch-manipulation cursor-pointer"
            >
              <ArrowLeft size={18} />
              <span>Voltar Página</span>
            </button>
          </div>

          {/* Secondary Quick Links */}
          <div className="pt-6 border-t border-white/10 flex flex-wrap items-center justify-center gap-4 text-xs font-semibold text-slate-400">
            <span className="text-slate-500">Links Úteis:</span>
            <Link href="/eventos" className="hover:text-[#00e5ff] transition-colors flex items-center gap-1.5">
              <CalendarDays size={14} className="text-[#00e5ff]" />
              <span>Explorar Eventos</span>
            </Link>
            <span className="text-slate-600">•</span>
            <Link href="/meus-ingressos" className="hover:text-[#ffbe00] transition-colors flex items-center gap-1.5">
              <Ticket size={14} className="text-[#ffbe00]" />
              <span>Meus Ingressos</span>
            </Link>
          </div>
        </div>
      </main>

      {/* Footer Disclaimer */}
      <footer className="mt-4 sm:mt-5 text-center text-xs text-slate-500 relative z-10">
        <p>© {new Date().getFullYear()} <strong className="text-slate-400">MeuIngrss</strong></p>
      </footer>
    </div>
  );
}
