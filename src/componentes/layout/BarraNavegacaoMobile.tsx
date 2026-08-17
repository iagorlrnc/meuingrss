'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { criarClienteNavegador } from '@/lib/supabase/cliente';
import {
  Home,
  Calendar,
  Trophy,
  Ticket,
  Search,
  MapPin,
} from 'lucide-react';

import { obterCidadesCache, obterOuBuscarCidades } from '@/lib/cacheEventos';
import { normalizarListaCidades } from '@/lib/utilitarios';

function ConteudoBarraNavegacaoMobile() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [termoBusca, setTermoBusca] = useState(searchParams.get('busca') || '');
  const [cidadeSelecionada, setCidadeSelecionada] = useState(searchParams.get('cidade') || '');
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

  // Define os 3 botões dinamicamente com base na página atual
  const botoes = ehInicio
    ? [
        { rotulo: 'Eventos', rotuloCurto: 'Eventos', href: '/eventos', icone: Calendar },
        { rotulo: 'Atléticas', rotuloCurto: 'Atléticas', href: '/atleticas', icone: Trophy },
        { rotulo: 'Meus Ingressos', rotuloCurto: 'Ingressos', href: '/meus-ingressos', icone: Ticket },
      ]
    : ehEventos
    ? [
        { rotulo: 'Início', rotuloCurto: 'Início', href: '/', icone: Home },
        { rotulo: 'Atléticas', rotuloCurto: 'Atléticas', href: '/atleticas', icone: Trophy },
        { rotulo: 'Meus Ingressos', rotuloCurto: 'Ingressos', href: '/meus-ingressos', icone: Ticket },
      ]
    : ehAtleticas
    ? [
        { rotulo: 'Início', rotuloCurto: 'Início', href: '/', icone: Home },
        { rotulo: 'Eventos', rotuloCurto: 'Eventos', href: '/eventos', icone: Calendar },
        { rotulo: 'Meus Ingressos', rotuloCurto: 'Ingressos', href: '/meus-ingressos', icone: Ticket },
      ]
    : [
        { rotulo: 'Início', rotuloCurto: 'Início', href: '/', icone: Home },
        { rotulo: 'Eventos', rotuloCurto: 'Eventos', href: '/eventos', icone: Calendar },
        { rotulo: 'Atléticas', rotuloCurto: 'Atléticas', href: '/atleticas', icone: Trophy },
      ];

  const ehMeusIngressos = pathname.startsWith('/meus-ingressos') || pathname.startsWith('/cliente/meus-ingressos');

  return (
    <nav className="lg:hidden bg-[#0b101d] border-b border-white/10 p-3 shadow-2xl sticky top-14 z-30">
      <div className="max-w-7xl mx-auto space-y-2.5">
        {/* Links Principais de Navegação Móbile (Divididos em 3 Colunas na Tela) */}
        <div className={`grid grid-cols-3 gap-1.5 w-full ${!ehMeusIngressos ? 'border-b border-white/10 pb-2' : ''}`}>
          {botoes.map((item) => {
            const Icone = item.icone;
            const estaAtivo =
              item.href === '/'
                ? ehInicio
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`py-2 px-1 rounded-md text-[10px] sm:text-[11px] font-black uppercase tracking-tight flex items-center justify-center gap-1 transition-all min-h-[38px] text-center ${
                  estaAtivo
                    ? 'bg-gradient-to-r from-[#38bdf8] to-[#00e5ff] text-slate-950 font-black shadow-md'
                    : 'bg-[#162036] text-slate-300 hover:text-white border border-white/5'
                }`}
              >
                <Icone size={13} className="shrink-0" />
                <span className="truncate">
                  <span className="sm:hidden">{item.rotuloCurto}</span>
                  <span className="hidden sm:inline">{item.rotulo}</span>
                </span>
              </Link>
            );
          })}
        </div>

        {/* Barra de Pesquisa e Filtro de Cidade (Oculta na aba Meus Ingressos) */}
        {!ehMeusIngressos && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              navegarComFiltros(termoBusca, cidadeSelecionada);
            }}
            className="flex items-center bg-[#111a2e] border border-white/15 rounded-md overflow-hidden"
          >
            <div className="flex items-center pl-3 text-slate-400">
              <Search size={15} />
            </div>
            <input
              type="text"
              placeholder="Buscar eventos, atléticas..."
              value={termoBusca}
              onChange={(e) => {
                const val = e.target.value;
                setTermoBusca(val);
                if (pathname.includes('/eventos') || pathname.includes('/atleticas')) {
                  navegarComFiltros(val, cidadeSelecionada);
                }
              }}
              style={{ outline: 'none', boxShadow: 'none' }}
              className="w-full bg-transparent px-2.5 py-2 text-xs text-white placeholder-slate-400 outline-none focus:outline-none focus:ring-0 focus-visible:outline-none border-none shadow-none"
            />
            <div className="flex items-center border-l border-white/10 px-2 py-2 text-xs font-bold uppercase text-[#00e5ff] gap-1 bg-[#162036] shrink-0">
              <MapPin size={13} className="text-[#ff007a] shrink-0" />
              <select
                value={cidadeSelecionada}
                onChange={(e) => {
                  const novaCidade = e.target.value;
                  setCidadeSelecionada(novaCidade);
                  navegarComFiltros(termoBusca, novaCidade);
                }}
                style={{ outline: 'none', boxShadow: 'none' }}
                className="bg-transparent text-[11px] font-bold uppercase text-[#00e5ff] cursor-pointer outline-none focus:outline-none focus:ring-0 focus-visible:outline-none border-none shadow-none"
              >
                <option value="" className="bg-[#080c14] text-white">Todas</option>
                {cidades.map((c) => (
                  <option key={c} value={c} className="bg-[#080c14] text-white">
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </form>
        )}
      </div>
    </nav>
  );
}

export default function BarraNavegacaoMobile() {
  return (
    <Suspense fallback={null}>
      <ConteudoBarraNavegacaoMobile />
    </Suspense>
  );
}
