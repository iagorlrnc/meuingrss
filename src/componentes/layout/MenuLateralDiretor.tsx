'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utilitarios';
import { usarAutenticacao } from '@/contextos/ContextoAutenticacao';
import {
  LayoutDashboard,
  Trophy,
  CalendarDays,
  ScanLine,
  LogOut,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Menu as MenuIcon,
  X,
} from 'lucide-react';
import { useState } from 'react';
import Logo from '@/componentes/ui/Logo';

const itensMenu = [
  { href: '/', icone: LayoutDashboard, rotulo: 'Dashboard' },
  { href: '/atletica', icone: Trophy, rotulo: 'Atlética' },
  { href: '/eventos', icone: CalendarDays, rotulo: 'Meus Eventos' },
  { href: '/validar-entrada', icone: ScanLine, rotulo: 'Validar Entrada' },
];

export default function MenuLateralDiretor() {
  const pathname = usePathname();
  const { perfil, sair } = usarAutenticacao();
  const [recolhido, setRecolhido] = useState(false);
  const [mobileAberto, setMobileAberto] = useState(false);

  const protocolo = process.env.NEXT_PUBLIC_PROTOCOLO || 'https';
  const dominioPrincipal = (process.env.NEXT_PUBLIC_DOMINIO_PRINCIPAL || 'meuingrss.com.br').replace(/\/+$/, '');

  return (
    <>
      {/* Top Mobile Navigation Bar (< md) */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 pt-safe bg-[#080c14]/95 backdrop-blur-md border-b border-borda-sutil z-40 px-4 flex items-center justify-between">
        <Logo href="/" subtitulo="Painel do Diretor" tamanhoIcone="sm" tamanhoTexto="sm" />

        <button
          onClick={() => setMobileAberto(!mobileAberto)}
          className="p-2 rounded-xl text-texto-secundario hover:text-texto-principal hover:bg-fundo-hover transition-all border border-borda-sutil min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
          aria-label="Abrir Menu"
        >
          {mobileAberto ? <X size={20} /> : <MenuIcon size={20} />}
        </button>
      </div>

      {/* Mobile Menu Drawer & Overlay (< md) */}
      {mobileAberto && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setMobileAberto(false)}
          />

          <aside className="relative z-10 w-72 bg-[#0b101d] border-r border-borda-sutil flex flex-col h-full shadow-2xl p-4 animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-borda-sutil">
              <Logo href="/" subtitulo="Painel do Diretor" tamanhoIcone="sm" tamanhoTexto="sm" aoClicar={() => setMobileAberto(false)} />
              <button
                onClick={() => setMobileAberto(false)}
                className="p-1.5 rounded-lg text-texto-terciario hover:text-texto-principal hover:bg-fundo-hover"
              >
                <X size={20} />
              </button>
            </div>

            <nav className="flex-1 py-4 space-y-1.5 overflow-y-auto">
              {itensMenu.map((item) => {
                const ativo =
                  pathname === item.href ||
                  (item.href !== '/' && pathname.startsWith(item.href));

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileAberto(false)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all',
                      ativo
                        ? 'bg-primaria-500/15 text-primaria-400 border border-primaria-500/20 font-bold'
                        : 'text-texto-secundario hover:text-texto-principal hover:bg-fundo-hover'
                    )}
                  >
                    <item.icone size={20} className="flex-shrink-0" />
                    <span>{item.rotulo}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="pt-4 border-t border-borda-sutil space-y-2">
              <a
                href={`${protocolo}://${dominioPrincipal}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-texto-terciario hover:text-texto-principal hover:bg-fundo-hover transition-all"
              >
                <ExternalLink size={18} className="flex-shrink-0" />
                <span>Ver Site</span>
              </a>
              <button
                onClick={sair}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-erro hover:bg-erro/10 transition-all"
              >
                <LogOut size={18} className="flex-shrink-0" />
                <span>Sair</span>
              </button>

              {perfil && (
                <div className="mt-2 px-3 py-2 bg-fundo-card/50 rounded-xl border border-borda-sutil">
                  <p className="text-xs font-semibold text-texto-principal truncate">
                    {perfil.nome}
                  </p>
                  <p className="text-[10px] text-texto-terciario truncate">{perfil.email}</p>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Desktop Fixed Sidebar (>= md) */}
      <aside
        className={cn(
          'hidden md:flex fixed left-0 top-0 h-screen z-30 flex-col vidro-forte border-r border-borda-sutil transition-all duration-300',
          recolhido ? 'w-[72px]' : 'w-64'
        )}
      >
        <div className="h-16 flex items-center justify-between px-4 border-b border-borda-sutil">
          {!recolhido && (
            <Logo href="/" subtitulo="Painel do Diretor" tamanhoIcone="sm" tamanhoTexto="sm" />
          )}
          <button
            onClick={() => setRecolhido(!recolhido)}
            className="p-1.5 rounded-lg text-texto-terciario hover:text-texto-principal hover:bg-fundo-hover transition-all"
          >
            {recolhido ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {itensMenu.map((item) => {
            const ativo =
              pathname === item.href ||
              (item.href !== '/' && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                  ativo
                    ? 'bg-primaria-500/15 text-primaria-400 border border-primaria-500/20 font-bold'
                    : 'text-texto-secundario hover:text-texto-principal hover:bg-fundo-hover'
                )}
                title={recolhido ? item.rotulo : undefined}
              >
                <item.icone size={20} className="flex-shrink-0" />
                {!recolhido && <span>{item.rotulo}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-borda-sutil space-y-1">
          <a
            href={`${protocolo}://${dominioPrincipal}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-texto-terciario hover:text-texto-principal hover:bg-fundo-hover transition-all"
            title={recolhido ? 'Ver Site' : undefined}
          >
            <ExternalLink size={18} className="flex-shrink-0" />
            {!recolhido && <span>Ver Site</span>}
          </a>
          <button
            onClick={sair}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-erro hover:bg-erro/10 transition-all"
            title={recolhido ? 'Sair' : undefined}
          >
            <LogOut size={18} className="flex-shrink-0" />
            {!recolhido && <span>Sair</span>}
          </button>

          {!recolhido && perfil && (
            <div className="mt-3 px-3 py-2">
              <p className="text-xs font-medium text-texto-secundario truncate">
                {perfil.nome}
              </p>
              <p className="text-[10px] text-texto-terciario truncate">{perfil.email}</p>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
