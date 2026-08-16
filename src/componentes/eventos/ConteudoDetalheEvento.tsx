'use client';

import { useState, useEffect, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Botao from '@/componentes/ui/Botao';
import Carregando from '@/componentes/ui/Carregando';
import { criarClienteNavegador } from '@/lib/supabase/cliente';
import { formatarDataHora, formatarMoeda } from '@/lib/utilitarios';
import { usarAutenticacao } from '@/contextos/ContextoAutenticacao';
import { obterEventoCache, salvarEventoCache, type EventoCompleto } from '@/lib/cacheEventos';
import type { LoteIngresso } from '@/tipos';
import {
  Calendar,
  MapPin,
  Ticket,
  Users,
  ShoppingCart,
  Minus,
  Plus,
  Clock,
  Info,
  ShieldCheck,
  Map,
  CheckCircle,
  AlertTriangle,
  Flame,
  XCircle,
  Share2,
  Check,
} from 'lucide-react';

interface ConteudoDetalheEventoProps {
  eventoInicial?: EventoCompleto | null;
}

function ComponenteDetalheEvento({ eventoInicial }: ConteudoDetalheEventoProps) {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { usuario } = usarAutenticacao();
  const eventoId = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';
  const cacheInicial = eventoInicial || (eventoId ? obterEventoCache(eventoId) : null);

  const [evento, setEvento] = useState<EventoCompleto | null>(cacheInicial || null);
  const [carregando, setCarregando] = useState(!cacheInicial);
  const [loteSelecionado, setLoteSelecionado] = useState<string | null>(() => {
    if (cacheInicial) {
      const lotes = cacheInicial.lotes_ingresso
        .filter(l => l.ativo && l.quantidade_vendida < l.quantidade_total)
        .sort((a, b) => a.ordem - b.ordem);
      return lotes.length > 0 ? lotes[0].id : null;
    }
    return null;
  });
  const [quantidade, setQuantidade] = useState(1);
  const [abaAtiva, setAbaAtiva] = useState<'sobre' | 'lotes' | 'mapa' | 'regras'>('sobre');
  const [bannerCancelamento, setBannerCancelamento] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const supabase = criarClienteNavegador();

  async function buscarEvento() {
    if (!eventoId) return;
    if (!obterEventoCache(eventoId) && !eventoInicial) {
      setCarregando(true);
    }

    const ehUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventoId);
    
    let query = supabase
      .from('eventos')
      .select(`
        *,
        atletica:atleticas(*),
        lotes_ingresso(*)
      `);

    if (ehUUID) {
      query = query.eq('id', eventoId);
    } else {
      query = query.eq('slug', eventoId);
    }

    query = query.eq('apagado_pelo_diretor', false);

    const { data } = await query.single();

    if (data) {
      const eventoFormatado = data as unknown as EventoCompleto;
      salvarEventoCache(eventoFormatado);
      setEvento(eventoFormatado);
      
      const lotes = eventoFormatado.lotes_ingresso
        .filter(l => l.ativo && l.quantidade_vendida < l.quantidade_total)
        .sort((a, b) => a.ordem - b.ordem);
      if (lotes.length > 0 && !loteSelecionado) {
        setLoteSelecionado(lotes[0].id);
      }
    }
    setCarregando(false);
  }

  useEffect(() => {
    if (eventoInicial) {
      salvarEventoCache(eventoInicial);
      setEvento(eventoInicial);
      setCarregando(false);
      const lotes = eventoInicial.lotes_ingresso
        .filter(l => l.ativo && l.quantidade_vendida < l.quantidade_total)
        .sort((a, b) => a.ordem - b.ordem);
      if (lotes.length > 0 && !loteSelecionado) {
        setLoteSelecionado(lotes[0].id);
      }
    } else if (eventoId) {
      const cache = obterEventoCache(eventoId);
      if (cache) {
        setEvento(cache);
        setCarregando(false);
        const lotes = cache.lotes_ingresso
          .filter(l => l.ativo && l.quantidade_vendida < l.quantidade_total)
          .sort((a, b) => a.ordem - b.ordem);
        if (lotes.length > 0 && !loteSelecionado) {
          setLoteSelecionado(lotes[0].id);
        }
      }
    }
    buscarEvento();
    if (searchParams.get('pagamento_cancelado') === 'true') {
      setBannerCancelamento(true);
    }
  }, [eventoId, searchParams, eventoInicial]);

  async function aoCompartilhar() {
    if (!evento) return;
    const url = window.location.href;
    const titulo = `${evento.titulo} | meuingrss`;
    const texto = `Confira ${evento.titulo} no meuingrss e garanta seu ingresso!`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: titulo,
          text: texto,
          url: url,
        });
        return;
      } catch {
        /* Ignorar se o usuário cancelou o menu de compartilhamento */
      }
    }

    // Fallback para cópia para área de transferência
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 3000);
    } catch {
      /* Fallback em navegadores sem suporte */
    }
  }

  function obterLoteSelecionado(): LoteIngresso | undefined {
    return evento?.lotes_ingresso.find(l => l.id === loteSelecionado);
  }

  function lotesDisponiveis(): LoteIngresso[] {
    return evento?.lotes_ingresso
      .filter(l => l.ativo && l.quantidade_vendida < l.quantidade_total)
      .sort((a, b) => a.ordem - b.ordem) || [];
  }

  function aoComprar() {
    if (!podeComprar) return;
    if (!usuario) {
      router.push(`/autenticacao/entrar?redirecionar=/eventos/${params.id}`);
      return;
    }
    if (loteSelecionado) {
      router.push(`/eventos/${params.id}/checkout?lote=${loteSelecionado}&qtd=${quantidade}`);
    }
  }

  if (carregando) {
    return (
      <div className="min-h-screen bg-[#080c14] flex items-center justify-center pt-20">
        <Carregando tamanho="lg" texto="Carregando detalhes do evento..." />
      </div>
    );
  }

  if (!evento) {
    return (
      <div className="min-h-screen bg-[#080c14] flex items-center justify-center pt-20 text-white">
        <div className="text-center max-w-md p-8 bg-[#0f172a] rounded-md border border-white/10">
          <Ticket className="w-16 h-16 text-[#ff007a] mx-auto mb-4" />
          <h2 className="text-2xl font-black font-titulo uppercase mb-2">Evento não encontrado</h2>
          <p className="text-xs text-slate-400 mb-6">O evento solicitado não está disponível ou foi encerrado.</p>
          <Link href="/eventos">
            <Botao variante="festiva">Voltar aos Eventos</Botao>
          </Link>
        </div>
      </div>
    );
  }

  const lote = obterLoteSelecionado();
  const disponiveis = lotesDisponiveis();
  const statusEvento = evento?.status;
  const ehPublicado = statusEvento === 'publicado';
  const ehCancelado = statusEvento === 'cancelado';
  const ehEncerrado = statusEvento === 'encerrado' || (evento?.data_evento ? new Date(evento.data_evento) < new Date() : false);
  const podeComprar = ehPublicado && !ehCancelado && !ehEncerrado;

  const textoBotaoDesktop = ehCancelado
    ? 'CANCELADO'
    : ehEncerrado
    ? 'ENCERRADO'
    : !ehPublicado
    ? (statusEvento ? statusEvento.toUpperCase() : 'NÃO PUBLICADO')
    : usuario
    ? 'COMPRAR INGRESSO'
    : 'ENTRAR PARA COMPRAR';

  const textoBotaoMobile = ehCancelado
    ? 'CANCELADO'
    : ehEncerrado
    ? 'ENCERRADO'
    : !ehPublicado
    ? (statusEvento ? statusEvento.toUpperCase() : 'NÃO PUBLICADO')
    : usuario
    ? 'COMPRAR'
    : 'ENTRAR';

  return (
    <div className="min-h-screen bg-[#080c14] text-white">
      {bannerCancelamento && (
        <div className="bg-red-500/10 border-b border-red-500/30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <AlertTriangle size={18} className="text-red-400 shrink-0" />
              <div>
                <p className="text-sm font-bold text-red-300">
                  Pagamento não foi concluído
                </p>
                <p className="text-xs text-red-200/70">
                  O pagamento foi cancelado ou não foi finalizado. Seu ingresso não foi gerado. Você pode tentar novamente abaixo.
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setBannerCancelamento(false);
                window.history.replaceState({}, '', `/eventos/${params.id}`);
              }}
              className="text-red-400/60 hover:text-red-300 transition-colors p-1 shrink-0"
            >
              <XCircle size={18} />
            </button>
          </div>
        </div>
      )}

      <div className="bg-[#060910] border-b border-white/10 py-2.5 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 truncate">
            <Link href="/" className="hover:text-white transition-colors">Início</Link>
            <span>/</span>
            <Link href="/eventos" className="hover:text-[#00e5ff] transition-colors">Eventos</Link>
            <span>/</span>
            <span className="text-white font-bold truncate max-w-xs">{evento.titulo}</span>
          </div>

          <button
            onClick={aoCompartilhar}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#162036] hover:bg-white/10 text-slate-200 hover:text-white text-xs font-medium transition-all border border-white/10 shrink-0"
          >
            {copiado ? (
              <>
                <Check size={13} className="text-emerald-400" />
                <span className="text-emerald-400 font-bold">Link Copiado</span>
              </>
            ) : (
              <>
                <Share2 size={13} className="text-[#00e5ff]" />
                <span>Compartilhar</span>
              </>
            )}
          </button>
        </div>
      </div>

      <section className="relative overflow-hidden bg-[#060910] border-b border-white/10">
        <div className="relative min-h-[420px] sm:min-h-[500px] flex items-end pb-8 sm:pb-12 pt-8 sm:pt-12">
          <div className="absolute inset-0 z-0">
            {evento.imagem_url ? (
              <img
                src={evento.imagem_url}
                alt={evento.titulo}
                className="w-full h-full object-cover filter brightness-40 blur-md scale-110"
              />
            ) : (
              <div
                className="w-full h-full"
                style={{
                  background: `linear-gradient(135deg, ${evento.atletica?.cor_primaria || '#ff007a'}, #8b5cf6, #080c14)`,
                }}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#080c14] via-[#080c14]/70 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#080c14] via-[#080c14]/40 to-transparent" />
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10 w-full">
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-6 sm:gap-8">
              {evento.imagem_url ? (
                <div className="w-full md:w-80 sm:max-w-xs shrink-0 rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl bg-[#162036] aspect-[4/3] sm:aspect-[16/10] md:aspect-[4/3] relative group">
                  <img
                    src={evento.imagem_url}
                    alt={evento.titulo}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              ) : (
                <div className="w-full md:w-80 sm:max-w-xs shrink-0 rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl bg-gradient-to-br from-[#ff007a] via-[#8b5cf6] to-[#026cdf] aspect-[4/3] sm:aspect-[16/10] md:aspect-[4/3] flex items-center justify-center">
                  <Ticket className="w-20 h-20 text-white/40" />
                </div>
              )}

              <div className="flex-1 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-3 py-1 rounded-sm bg-gradient-to-r from-[#ff007a] to-[#8b5cf6] text-white text-xs font-black uppercase tracking-wider shadow-lg flex items-center gap-1">
                      <Flame size={14} className="animate-bounce" />
                      VENDA EXCLUSIVA
                    </span>
                    {evento.atletica?.nome && (
                      <span className="px-2.5 py-1 rounded-sm bg-[#080c14]/80 text-[#00e5ff] text-xs font-black uppercase tracking-wider border border-[#00e5ff]/30 backdrop-blur-sm">
                        {evento.atletica.nome}
                      </span>
                    )}
                  </div>

                  <button
                    onClick={aoCompartilhar}
                    className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#080c14]/90 hover:bg-[#162036] text-white hover:text-[#00e5ff] text-xs font-bold transition-all border border-white/20 hover:border-[#00e5ff]/50 backdrop-blur-md shadow-md active:scale-95"
                  >
                    {copiado ? (
                      <>
                        <Check size={15} className="text-emerald-400" />
                        <span className="text-emerald-400 font-bold">Link Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Share2 size={15} className="text-[#00e5ff]" />
                        <span>Compartilhar Evento</span>
                      </>
                    )}
                  </button>
                </div>

                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black font-titulo tracking-tight uppercase text-white drop-shadow-lg leading-tight">
                  {evento.titulo}
                </h1>

                <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm font-bold text-slate-200">
                  <div className="flex items-center gap-1.5 bg-[#080c14]/80 px-3.5 py-2 rounded-md border border-white/10 text-[#00e5ff]">
                    <Calendar size={16} className="text-[#ff007a]" />
                    <span>{formatarDataHora(evento.data_evento)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-[#080c14]/80 px-3.5 py-2 rounded-md border border-white/10 text-slate-200">
                    <MapPin size={16} className="text-[#ff007a]" />
                    <span>{evento.local}{evento.cidade ? `, ${evento.cidade}` : ''}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#0f172a] border-b border-white/10 sticky top-[64px] sm:top-[80px] z-30 shadow-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <nav className="flex space-x-4 sm:space-x-8 overflow-x-auto text-xs font-black uppercase tracking-wider sem-barra-rolagem touch-pan-x py-0.5">
            <button
              onClick={() => setAbaAtiva('sobre')}
              className={`py-3.5 border-b-2 transition-colors whitespace-nowrap min-h-[44px] touch-manipulation ${
                abaAtiva === 'sobre'
                  ? 'border-[#ff007a] text-[#ff007a]'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              Sobre o Evento
            </button>
            <button
              onClick={() => setAbaAtiva('lotes')}
              className={`py-3.5 border-b-2 transition-colors whitespace-nowrap min-h-[44px] touch-manipulation ${
                abaAtiva === 'lotes'
                  ? 'border-[#ff007a] text-[#ff007a]'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              Ingressos & Setores
            </button>
            <button
              onClick={() => setAbaAtiva('mapa')}
              className={`py-3.5 border-b-2 transition-colors whitespace-nowrap min-h-[44px] touch-manipulation ${
                abaAtiva === 'mapa'
                  ? 'border-[#ff007a] text-[#ff007a]'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              Mapa do Local
            </button>
            <button
              onClick={() => setAbaAtiva('regras')}
              className={`py-3.5 border-b-2 transition-colors whitespace-nowrap min-h-[44px] touch-manipulation ${
                abaAtiva === 'regras'
                  ? 'border-[#ff007a] text-[#ff007a]'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              Informações Importantes
            </button>
          </nav>
        </div>
      </section>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            {abaAtiva === 'sobre' && (
              <div className="space-y-6">
                <div className="bg-[#0f172a] border border-white/10 rounded-md p-6">
                  <h3 className="text-base font-black uppercase tracking-wider text-white mb-4 pb-3 border-b border-white/10 flex items-center gap-2">
                    <Info size={18} className="text-[#ff007a]" />
                    Sobre o Evento
                  </h3>
                  <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                    {evento.descricao ||
                      'Prepare-se para viver uma experiência inesquecível! Este evento conta com estrutura completa, segurança especializada e os melhores DJs e atrações.'}
                  </p>
                </div>

                <div className="bg-[#0f172a] border border-white/10 rounded-md p-6">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3">
                    Organização Oficial
                  </h3>
                  <div className="flex items-center gap-4">
                    {evento.atletica?.logo_url ? (
                      <img
                        src={evento.atletica.logo_url}
                        alt={evento.atletica.nome}
                        className="w-12 h-12 rounded-md object-cover border border-white/10"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-md bg-gradient-to-br from-[#ff007a] to-[#026cdf] flex items-center justify-center text-white font-black text-lg">
                        {evento.atletica?.nome?.[0] || 'A'}
                      </div>
                    )}
                    <div>
                      <p className="text-base font-bold text-white">{evento.atletica?.nome || 'Atlética Organizadora'}</p>
                      <p className="text-xs text-slate-400">{evento.atletica?.faculdade || 'Parceiro meuingrss'}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {abaAtiva === 'lotes' && (
              <div className="bg-[#0f172a] border border-white/10 rounded-md p-6">
                <h3 className="text-base font-black uppercase tracking-wider text-white mb-4 pb-3 border-b border-white/10 flex items-center gap-2">
                  <Ticket size={18} className="text-[#00e5ff]" />
                  Tabela de Preços e Setores
                </h3>
                <div className="space-y-3">
                  {evento.lotes_ingresso.map((l) => (
                    <div
                      key={l.id}
                      className="flex items-center justify-between p-4 rounded-md bg-[#162036] border border-white/10"
                    >
                      <div>
                        <p className="text-sm font-black text-white flex items-center gap-1.5">
                          {l.nome_lote}
                        </p>
                        <p className="text-xs text-slate-400">Entrada individual com QR Code</p>
                      </div>
                      <div className="text-right">
                        <p className="text-base font-black text-[#00e5ff]">
                          {l.preco > 0 ? formatarMoeda(l.preco) : 'Grátis'}
                        </p>
                        {!l.ativo ? (
                          <span className="text-[10px] font-black uppercase text-slate-400">Inativo</span>
                        ) : !podeComprar ? (
                          <span className="text-[10px] font-black uppercase text-red-500">Indisponível</span>
                        ) : l.quantidade_total - l.quantidade_vendida > 0 ? (
                          <span className="text-[10px] font-black uppercase text-emerald-400">Disponível</span>
                        ) : (
                          <span className="text-[10px] font-black uppercase text-red-500">Esgotado</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {abaAtiva === 'mapa' && (
              <div className="bg-[#0f172a] border border-white/10 rounded-md p-6">
                <h3 className="text-base font-black uppercase tracking-wider text-white mb-4 pb-3 border-b border-white/10 flex items-center gap-2">
                  <Map size={18} className="text-[#ff007a]" />
                  Mapa de Setores do Evento
                </h3>
                <div className="relative h-72 sm:h-88 bg-[#162036] rounded-md border border-white/10 flex flex-col items-center justify-center p-6 text-center">
                  <div className="w-full max-w-md h-28 bg-gradient-to-r from-[#ff007a] via-[#8b5cf6] to-[#026cdf] rounded-md flex items-center justify-center mb-6 shadow-xl">
                    <span className="text-base font-black text-[#ffffff] uppercase tracking-widest flex items-center gap-2">
                      PALCO PRINCIPAL
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 w-full max-w-md">
                    <div className="p-3 bg-[#ff007a]/20 border border-[#ff007a] rounded-md text-xs font-black text-[#ff007a] uppercase">
                      PISTA PREMIUM
                    </div>
                    <div className="p-3 bg-[#00e5ff]/20 border border-[#00e5ff] rounded-md text-xs font-black text-[#00e5ff] uppercase">
                      PISTA GERAL
                    </div>
                    <div className="p-3 bg-[#ffbe00]/20 border border-[#ffbe00] rounded-md text-xs font-black text-[#ffbe00] uppercase">
                      ÁREA VIP
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 mt-6">
                    Localização: <strong className="text-white">{evento.local}</strong> ({evento.cidade || 'Brasil'})
                  </p>
                </div>
              </div>
            )}

            {abaAtiva === 'regras' && (
              <div className="bg-[#0f172a] border border-white/10 rounded-md p-6 space-y-4">
                <h3 className="text-base font-black uppercase tracking-wider text-white mb-4 pb-3 border-b border-white/10 flex items-center gap-2">
                  <AlertTriangle size={18} className="text-[#ffbe00]" />
                  Informações de Entrada & Regras
                </h3>
                <ul className="space-y-3 text-xs text-slate-300 leading-relaxed">
                  <li className="flex items-start gap-2">
                    <CheckCircle size={14} className="text-[#ff007a] shrink-0 mt-0.5" />
                    <span><strong>Classificação Etária:</strong> Evento destinado para maiores de 18 anos. Apresentação obrigatória de documento oficial com foto.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle size={14} className="text-[#ff007a] shrink-0 mt-0.5" />
                    <span><strong>QR Code de Acesso:</strong> O ingresso será disponibilizado digitalmente em sua conta meuingrss imediatamente após a confirmação do pagamento.</span>
                  </li>
                </ul>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-[#0f172a] border border-white/20 rounded-md p-6 sticky top-[140px] shadow-2xl space-y-5">
              <div className="pb-4 border-b border-white/10 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#00e5ff]">
                    PLATAFORMA MEUINGRSS
                  </span>
                  <h3 className="text-xl font-black uppercase font-titulo text-white flex items-center gap-2 mt-0.5">
                    <ShoppingCart size={20} className="text-[#ff007a]" />
                    Comprar Ingresso
                  </h3>
                </div>
                <button
                  onClick={aoCompartilhar}
                  className="p-2 rounded-md bg-[#162036] hover:bg-[#ff007a]/20 text-slate-300 hover:text-[#00e5ff] border border-white/10 transition-all active:scale-95 flex items-center gap-1.5 text-xs font-bold shrink-0"
                  title="Compartilhar evento"
                >
                  {copiado ? (
                    <>
                      <Check size={16} className="text-emerald-400" />
                      <span className="text-emerald-400 text-[11px]">Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Share2 size={16} className="text-[#00e5ff]" />
                    </>
                  )}
                </button>
              </div>

              {disponiveis.length > 0 ? (
                <>
                  <div className="space-y-2.5">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-400 block">
                      Selecione o Lote / Setor:
                    </label>
                    {disponiveis.map((l) => {
                      const restantes = l.quantidade_total - l.quantidade_vendida;
                      const selecionado = loteSelecionado === l.id;

                      return (
                        <button
                          key={l.id}
                          disabled={!podeComprar}
                          onClick={() => {
                            if (!podeComprar) return;
                            setLoteSelecionado(l.id);
                            setQuantidade(1);
                          }}
                          className={`w-full p-3.5 rounded-md border text-left transition-all ${
                            !podeComprar
                              ? 'border-white/5 bg-[#162036]/50 opacity-60 cursor-not-allowed'
                              : selecionado
                              ? 'border-[#ff007a] bg-[#ff007a]/15 shadow-lg cursor-pointer'
                              : 'border-white/10 bg-[#162036] hover:border-white/30 cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-white">{l.nome_lote}</span>
                            <span className="text-base font-black text-[#00e5ff]">
                              {l.preco > 0 ? formatarMoeda(l.preco) : 'Grátis'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                            <Users size={12} />
                            <span>
                              {podeComprar ? `${restantes} ingressos restantes` : 'Indisponível'}
                            </span>
                            {podeComprar && restantes <= 15 && (
                              <span className="text-red-400 font-bold">• Poucas vagas</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {lote && (
                    <div className="flex items-center justify-between p-3.5 rounded-md bg-[#162036] border border-white/10">
                      <span className="text-xs font-black uppercase text-slate-300">Quantidade</span>
                      <div className="flex items-center gap-3">
                        <button
                          disabled={!podeComprar || quantidade <= 1}
                          onClick={() => podeComprar && setQuantidade(Math.max(1, quantidade - 1))}
                          className="w-8 h-8 rounded-md bg-[#080c14] flex items-center justify-center text-white hover:bg-[#ff007a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#080c14]"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="text-base font-black text-white w-6 text-center">
                          {quantidade}
                        </span>
                        <button
                          disabled={!podeComprar || (lote && quantidade >= Math.min(5, lote.quantidade_total - lote.quantidade_vendida))}
                          onClick={() => {
                            if (!podeComprar || !lote) return;
                            const max = lote.quantidade_total - lote.quantidade_vendida;
                            setQuantidade(Math.min(5, max, quantidade + 1));
                          }}
                          className="w-8 h-8 rounded-md bg-[#080c14] flex items-center justify-center text-white hover:bg-[#ff007a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#080c14]"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  )}

                  {lote && (
                    <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                      <span className="text-xs font-black uppercase text-slate-400">Valor Total</span>
                      <span className="text-2xl font-black text-white">
                        {formatarMoeda(lote.preco * quantidade)}
                      </span>
                    </div>
                  )}

                  <Botao
                    larguraTotal
                    tamanho="xl"
                    onClick={aoComprar}
                    disabled={!podeComprar || !loteSelecionado}
                    variante={podeComprar ? 'festiva' : 'fantasma'}
                  >
                    {textoBotaoDesktop}
                  </Botao>

                  <div className="flex items-center justify-center gap-2 text-[10px] uppercase font-bold text-slate-400 pt-1">
                    <ShieldCheck size={14} className="text-emerald-400" />
                    <span>Pagamento Seguro via Pix ou Cartão</span>
                  </div>
                </>
              ) : (
                <div className="text-center py-8 space-y-4">
                  <Clock className="w-10 h-10 text-slate-500 mx-auto mb-2" />
                  <p className="text-sm font-bold uppercase text-white">
                    {ehCancelado ? 'Evento Cancelado' : ehEncerrado ? 'Evento Encerrado' : 'Ingressos Esgotados'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {ehCancelado
                      ? 'Este evento foi cancelado pela organização.'
                      : ehEncerrado
                      ? 'As vendas para este evento foram encerradas.'
                      : 'Acompanhe as atualizações de novos lotes.'}
                  </p>
                  {!podeComprar && (
                    <Botao
                      larguraTotal
                      tamanho="xl"
                      disabled={true}
                      variante="fantasma"
                    >
                      {textoBotaoDesktop}
                    </Botao>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {(disponiveis.length > 0 || !podeComprar) && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0b101d]/95 backdrop-blur-md px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] border-t border-white/20 shadow-2xl flex items-center justify-between gap-3">
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
              {podeComprar ? `Total (${quantidade}x)` : 'Status'}
            </span>
            <span className="text-lg font-black text-[#00e5ff]">
              {podeComprar
                ? lote ? formatarMoeda(lote.preco * quantidade) : 'Selecione'
                : ehCancelado ? 'Cancelado' : ehEncerrado ? 'Encerrado' : 'Indisponível'}
            </span>
          </div>

          <Botao
            tamanho="md"
            onClick={aoComprar}
            disabled={!podeComprar || !loteSelecionado}
            variante={podeComprar ? 'festiva' : 'fantasma'}
            className="flex-1 max-w-[200px]"
          >
            {textoBotaoMobile}
          </Botao>
        </div>
      )}
    </div>
  );
}

export default function ConteudoDetalheEvento({ eventoInicial }: ConteudoDetalheEventoProps) {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#080c14] flex items-center justify-center pt-20">
        <Carregando tamanho="lg" texto="Carregando detalhes do evento..." />
      </div>
    }>
      <ComponenteDetalheEvento eventoInicial={eventoInicial} />
    </Suspense>
  );
}
