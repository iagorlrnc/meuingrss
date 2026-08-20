'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { usarAutenticacao } from '@/contextos/ContextoAutenticacao';
import Botao from '@/componentes/ui/Botao';
import { cn, normalizarListaCidades } from '@/lib/utilitarios';
import { criarClienteNavegador } from '@/lib/supabase/cliente';
import Modal from '@/componentes/ui/Modal';
import Logo from '@/componentes/ui/Logo';
import {
  Menu,
  X,
  Ticket,
  LogOut,
  LogIn,
  Search,
  MapPin,
  HelpCircle,
  Home,
  Calendar,
  Trophy,
  Mail,
  Copy,
  Check,
} from 'lucide-react';

import { obterCidadesCache, obterOuBuscarCidades } from '@/lib/cacheEventos';

function ConteudoCabecalhoCliente() {
  const { usuario, perfil, sair, carregando } = usarAutenticacao();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [menuAberto, setMenuAberto] = useState(false);
  const [perfilAberto, setPerfilAberto] = useState(false);
  const [modalAjudaAberto, setModalAjudaAberto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [termoBusca, setTermoBusca] = useState(searchParams.get('busca') || '');
  const [cidadeSelecionada, setCidadeSelecionada] = useState(searchParams.get('cidade') || '');

  function copiarEmail() {
    navigator.clipboard.writeText('suporte.meuingrss@gmail.com');
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  }
  const [cidades, setCidades] = useState<string[]>(() => normalizarListaCidades(obterCidadesCache() || []));
  const supabase = criarClienteNavegador();

  useEffect(() => {
    setTermoBusca(searchParams.get('busca') || '');
    setCidadeSelecionada(searchParams.get('cidade') || '');
  }, [searchParams]);

  useEffect(() => {
    async function carregarCidades() {
      const lista = await obterOuBuscarCidades(supabase);
      if (lista && lista.length > 0) {
        setCidades(normalizarListaCidades(lista));
      }
    }
    carregarCidades();
    const interval = setInterval(() => {
      const c = obterCidadesCache();
      if (c && c.length > 0) setCidades(normalizarListaCidades(c));
    }, 2000);
    return () => clearInterval(interval);
  }, [supabase]);

  function navegarComFiltros(buscaVal: string, cidadeVal: string) {
    const params = new URLSearchParams();
    if (buscaVal.trim()) params.set('busca', buscaVal.trim());
    if (cidadeVal) params.set('cidade', cidadeVal);
    const queryString = params.toString();
    const rotaBase = pathname.includes('/atleticas') ? '/atleticas' : '/eventos';
    router.push(`${rotaBase}${queryString ? `?${queryString}` : ''}`);
  }

  const ehInicio = pathname === '/' || pathname === '/cliente';
  const ehEventos = pathname.startsWith('/eventos') || pathname.startsWith('/cliente/eventos');
  const ehAtleticas = pathname.startsWith('/atleticas') || pathname.startsWith('/cliente/atleticas');
  const ehMeusIngressos = pathname.startsWith('/meus-ingressos') || pathname.startsWith('/cliente/meus-ingressos');

  const nomeUsuario = perfil?.nome || usuario?.user_metadata?.nome || usuario?.user_metadata?.full_name || usuario?.user_metadata?.name || '';
  const emailUsuario = perfil?.email || usuario?.email || '';

  return (
    <>
      {/* Drawer Overlay Backdrop */}
      {menuAberto && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-xs z-40 md:hidden"
          onClick={() => setMenuAberto(false)}
        />
      )}

      <header className="fixed top-0 left-0 right-0 z-50 bg-[#080c14] border-b border-white/10 shadow-2xl pt-safe">
        {/* Lollapalooza Festive Gradient Accent Line */}
        <div className="h-1 w-full bg-gradient-to-r from-[#ff007a] via-[#8b5cf6] to-[#00e5ff]" />

        {/* Top Header Bar */}
        <div className="max-w-7xl mx-auto px-3 sm:px-6">
          <div className="flex items-center justify-between h-14 sm:h-20 gap-2 sm:gap-3">
            <Logo href="/" tamanhoIcone="md" tamanhoTexto="lg" />

            {/* Central Festive Search Bar (Desktop) */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                navegarComFiltros(termoBusca, cidadeSelecionada);
              }}
              className="hidden lg:flex flex-1 max-w-xl items-center bg-[#111a2e] border border-white/15 rounded-md focus-within:border-[#ff007a] transition-all overflow-hidden"
            >
              <div className="flex items-center pl-3 text-slate-400">
                <Search size={18} />
              </div>
              <input
                type="text"
                placeholder="Buscar eventos, atléticas ou cidades..."
                value={termoBusca}
                onChange={(e) => {
                  const val = e.target.value;
                  setTermoBusca(val);
                  if (pathname.includes('/eventos') || pathname.includes('/atleticas')) {
                    navegarComFiltros(val, cidadeSelecionada);
                  }
                }}
                style={{ outline: 'none', boxShadow: 'none' }}
                className="w-full bg-transparent px-3 py-2 text-sm text-white placeholder-slate-400 outline-none focus:outline-none focus:ring-0 focus-visible:outline-none border-none shadow-none"
              />
              <div className="flex items-center border-l border-white/10 px-3 py-2 text-xs font-bold uppercase text-[#00e5ff] gap-1 bg-[#162036] shrink-0">
                <MapPin size={14} className="text-[#ff007a] shrink-0" />
                <select
                  value={cidadeSelecionada}
                  onChange={(e) => {
                    const novaCidade = e.target.value;
                    setCidadeSelecionada(novaCidade);
                    navegarComFiltros(termoBusca, novaCidade);
                  }}
                  style={{ outline: 'none', boxShadow: 'none' }}
                  className="bg-transparent text-xs font-bold uppercase text-[#00e5ff] cursor-pointer pr-1 outline-none focus:outline-none focus:ring-0 focus-visible:outline-none border-none shadow-none"
                >
                  <option value="" className="bg-[#080c14] text-white">Todas as Cidades</option>
                  {cidades.map((c) => (
                    <option key={c} value={c} className="bg-[#080c14] text-white">
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </form>

            {/* Right Action Menu */}
            <div className="flex items-center gap-1.5 sm:gap-3">
              <Link
                href="/eventos"
                className="p-2 text-slate-300 hover:text-white rounded-md hover:bg-[#162036] transition-all min-h-[40px] min-w-[40px] flex items-center justify-center lg:hidden"
                aria-label="Buscar Eventos"
              >
                <Search size={20} />
              </Link>

              <button
                type="button"
                onClick={() => setModalAjudaAberto(true)}
                className="hidden sm:flex items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-300 hover:text-white rounded-md hover:bg-[#162036] transition-all cursor-pointer"
              >
                <HelpCircle size={15} />
                <span>Ajuda</span>
              </button>

              {!carregando && (
                <>
                  {usuario ? (
                    <div className="relative">
                      <button
                        onClick={() => setPerfilAberto(!perfilAberto)}
                        className="flex items-center gap-2 p-1.5 sm:pr-3 rounded-md bg-[#162036] border border-white/10 hover:border-[#ff007a] transition-all min-h-[40px]"
                      >
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-sm bg-gradient-to-br from-[#ff007a] to-[#026cdf] flex items-center justify-center text-xs font-black text-white shrink-0">
                          {nomeUsuario?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <span className="text-xs font-bold text-white uppercase tracking-wider hidden sm:block max-w-[150px] truncate">
                          {nomeUsuario || 'Minha Conta'}
                        </span>
                      </button>

                      {perfilAberto && (
                        <>
                          <div
                            className="fixed inset-0 z-40"
                            onClick={() => setPerfilAberto(false)}
                          />
                          <div className="absolute right-0 top-12 w-60 bg-[#0f172a] rounded-md border border-white/15 shadow-2xl z-50 overflow-hidden">
                            <div className="p-4 border-b border-white/10 bg-[#162036]">
                              <p className="text-sm font-bold text-white truncate">
                                {nomeUsuario || 'Usuário'}
                              </p>
                              <p className="text-xs text-slate-400 truncate">
                                {emailUsuario}
                              </p>
                            </div>
                            <div className="p-2 space-y-1">
                              <Link
                                href="/meus-ingressos"
                                onClick={() => setPerfilAberto(false)}
                                className="flex items-center gap-2.5 px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-200 hover:bg-[#ff007a] hover:text-white rounded-sm transition-all"
                              >
                                <Ticket size={16} />
                                Meus Ingressos
                              </Link>
                              <button
                                onClick={sair}
                                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-red-400 hover:bg-red-500/10 rounded-sm transition-all"
                              >
                                <LogOut size={16} />
                                Sair da Conta
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <Link href="/autenticacao/entrar">
                        <Botao variante="fantasma" tamanho="sm" className="px-2.5 sm:px-3.5">
                          <LogIn size={15} className="mr-1" />
                          <span className="text-xs font-bold uppercase tracking-wider">Entrar</span>
                        </Botao>
                      </Link>
                      <Link href="/autenticacao/cadastro" className="hidden sm:inline-flex">
                        <Botao variante="festiva" tamanho="sm">
                          <span className="text-xs font-black uppercase tracking-wider">Criar Conta</span>
                        </Botao>
                      </Link>
                    </div>
                  )}
                </>
              )}

              {/* Mobile Hamburger */}
              <button
                onClick={() => setMenuAberto(!menuAberto)}
                className="p-1.5 text-slate-300 hover:text-white rounded-md hover:bg-[#162036] transition-all md:hidden min-h-[40px] min-w-[40px] flex items-center justify-center touch-manipulation"
                aria-label={menuAberto ? "Fechar Menu" : "Abrir Menu"}
              >
                {menuAberto ? <X size={22} /> : <Menu size={22} />}
              </button>
            </div>
          </div>
        </div>

        {/* Ticketmaster Festive Sub-Header Navigation Strip (Desktop) */}
        <div className="hidden md:block bg-[#060910] border-t border-white/5">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <nav className="flex items-center space-x-8 h-10 overflow-x-auto text-xs font-extrabold uppercase tracking-wider">
              <Link
                href="/"
                className={cn(
                  'py-2.5 transition-colors whitespace-nowrap flex items-center gap-1.5',
                  ehInicio
                    ? 'text-[#ff007a] border-b-2 border-[#ff007a]'
                    : 'text-slate-300 hover:text-white'
                )}
              >
                <Home size={14} />
                Início
              </Link>

              <Link
                href="/eventos"
                className={cn(
                  'py-2.5 transition-colors whitespace-nowrap flex items-center gap-1.5',
                  ehEventos
                    ? 'text-[#ff007a] border-b-2 border-[#ff007a]'
                    : 'text-slate-300 hover:text-white'
                )}
              >
                <Calendar size={14} />
                Todos os Eventos
              </Link>

              <Link
                href="/atleticas"
                className={cn(
                  'py-2.5 transition-colors whitespace-nowrap flex items-center gap-1.5',
                  ehAtleticas
                    ? 'text-[#ff007a] border-b-2 border-[#ff007a]'
                    : 'text-slate-300 hover:text-white'
                )}
              >
                <Trophy size={14} />
                Atléticas
              </Link>

              {usuario && (
                <Link
                  href="/meus-ingressos"
                  className={cn(
                    'py-2.5 transition-colors whitespace-nowrap ml-auto flex items-center gap-1.5',
                    ehMeusIngressos
                      ? 'text-[#ffbe00] border-b-2 border-[#ffbe00]'
                      : 'text-[#ffbe00] hover:text-white'
                  )}
                >
                  <Ticket size={14} />
                  ★ Meus Ingressos
                </Link>
              )}
            </nav>
          </div>
        </div>

        {/* Mobile Drawer Navigation */}
        <div
          className={cn(
            'md:hidden overflow-hidden transition-all duration-300 border-t border-white/10 bg-[#060910] relative z-50',
            menuAberto ? 'max-h-[36rem]' : 'max-h-0 border-t-0'
          )}
        >
          <nav className="px-4 py-4 space-y-2">
            <Link
              href="/"
              onClick={() => setMenuAberto(false)}
              className={cn(
                'block px-3 py-2.5 text-xs font-black uppercase tracking-wider rounded-md transition-all flex items-center gap-2 min-h-[44px]',
                ehInicio
                  ? 'bg-[#ff007a] text-white'
                  : 'text-slate-300 hover:bg-[#162036] hover:text-white'
              )}
            >
              <Home size={16} />
              Início
            </Link>

            <Link
              href="/eventos"
              onClick={() => setMenuAberto(false)}
              className={cn(
                'block px-3 py-2.5 text-xs font-black uppercase tracking-wider rounded-md transition-all flex items-center gap-2 min-h-[44px]',
                ehEventos
                  ? 'bg-[#ff007a] text-white'
                  : 'text-slate-300 hover:bg-[#162036] hover:text-white'
              )}
            >
              <Calendar size={16} />
              Todos os Eventos
            </Link>

            <Link
              href="/atleticas"
              onClick={() => setMenuAberto(false)}
              className={cn(
                'block px-3 py-2.5 text-xs font-black uppercase tracking-wider rounded-md transition-all flex items-center gap-2 min-h-[44px]',
                ehAtleticas
                  ? 'bg-[#ff007a] text-white'
                  : 'text-slate-300 hover:bg-[#162036] hover:text-white'
              )}
            >
              <Trophy size={16} />
              Atléticas
            </Link>

            <button
              type="button"
              onClick={() => {
                setMenuAberto(false);
                setModalAjudaAberto(true);
              }}
              className="w-full px-3 py-2.5 text-xs font-black uppercase tracking-wider rounded-md transition-all flex items-center gap-2 min-h-[44px] text-slate-300 hover:bg-[#162036] hover:text-white text-left cursor-pointer"
            >
              <HelpCircle size={16} />
              Ajuda & Suporte
            </button>

            {usuario ? (
              <>
                <Link
                  href="/meus-ingressos"
                  onClick={() => setMenuAberto(false)}
                  className={cn(
                    'block px-3 py-2.5 text-xs font-black uppercase tracking-wider rounded-md transition-all flex items-center gap-2 border border-[#ffbe00]/30 min-h-[44px]',
                    ehMeusIngressos
                      ? 'bg-[#ffbe00] text-[#080c14]'
                      : 'text-[#ffbe00] hover:bg-[#162036]'
                  )}
                >
                  <Ticket size={16} />
                  ★ Meus Ingressos
                </Link>

                <div className="pt-2 border-t border-white/10 mt-2 space-y-2">
                  <div className="px-3 py-2 bg-[#162036] rounded-md">
                    <p className="text-xs font-bold text-white truncate">{nomeUsuario || 'Usuário'}</p>
                    <p className="text-[11px] text-slate-400 truncate">{emailUsuario}</p>
                  </div>
                  <button
                    onClick={() => {
                      setMenuAberto(false);
                      sair();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-red-400 bg-red-500/10 rounded-md min-h-[44px]"
                  >
                    <LogOut size={16} />
                    Sair da Conta
                  </button>
                </div>
              </>
            ) : (
              <div className="pt-3.5 border-t border-white/10 mt-3 flex flex-col gap-3.5">
                <Link href="/autenticacao/entrar" onClick={() => setMenuAberto(false)} className="w-full">
                  <Botao variante="primario" larguraTotal tamanho="md">
                    <LogIn size={16} className="mr-1.5" />
                    Entrar na Conta
                  </Botao>
                </Link>
                <Link href="/autenticacao/cadastro" onClick={() => setMenuAberto(false)} className="w-full">
                  <Botao variante="festiva" larguraTotal tamanho="md">
                    Criar Conta Grátis
                  </Botao>
                </Link>
              </div>
            )}
          </nav>
        </div>
      </header>

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

export default function CabecalhoCliente() {
  return (
    <Suspense fallback={null}>
      <ConteudoCabecalhoCliente />
    </Suspense>
  );
}

