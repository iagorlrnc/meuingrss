'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Cartao from '@/componentes/ui/Cartao';
import Distintivo from '@/componentes/ui/Distintivo';
import Carregando from '@/componentes/ui/Carregando';
import dynamic from 'next/dynamic';
import EstadoVazio from '@/componentes/ui/EstadoVazio';

const ModalDetalhesIngresso = dynamic(
  () => import('@/componentes/ingressos/ModalDetalhesIngresso'),
  { ssr: false }
);
import Botao from '@/componentes/ui/Botao';
import { criarClienteNavegador } from '@/lib/supabase/cliente';
import { usarAutenticacao } from '@/contextos/ContextoAutenticacao';
import { formatarData, formatarMoeda, mascararCPF } from '@/lib/utilitarios';
import type { Ingresso, Evento, LoteIngresso, Perfil, Atletica, StatusIngresso } from '@/tipos';
import BarraNavegacaoMobile from '@/componentes/layout/BarraNavegacaoMobile';
import { 
  Ticket, 
  Calendar, 
  MapPin, 
  QrCode, 
  Download, 
  Building2, 
  Loader2, 
  CheckCircle2,
  ShieldCheck,
  XCircle,
  Clock,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { gerarPdfIngresso } from '@/lib/gerarPdfIngresso';
import { gerarQrCodeDataUrlComLogo } from '@/lib/gerarQrCode';

interface IngressoCompleto extends Ingresso {
  evento: Evento & {
    atletica?: Atletica;
  };
  lote: LoteIngresso;
  comprador?: Perfil;
}

type StatusPedido = 'aguardando' | 'aprovado' | 'cancelado' | 'estoque_esgotado' | 'erro' | null;

const INGRESSOS_POR_PAGINA = 20;

// Cache em memória para carregamento instantâneo (0ms) por usuário ao alternar de aba
const cacheIngressosPorUsuario: Record<string, IngressoCompleto[]> = {};

function ConteudoMeusIngressos() {
  const { usuario, perfil, carregando: carregandoAuth } = usarAutenticacao();
  const searchParams = useSearchParams();

  const cacheExistente = usuario?.id ? cacheIngressosPorUsuario[usuario.id] : null;

  const [ingressos, setIngressos] = useState<IngressoCompleto[]>(cacheExistente || []);
  const [carregando, setCarregando] = useState(!cacheExistente);
  const [ingressoSelecionado, setIngressoSelecionado] = useState<IngressoCompleto | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');
  const [gerandoPdfId, setGerandoPdfId] = useState<string | null>(null);

  // Paginação
  const [pagina, setPagina] = useState(1);
  const [temMais, setTemMais] = useState(false);
  const [carregandoMais, setCarregandoMais] = useState(false);

  // Status do pedido (polling após retorno do gateway)
  const [statusPedido, setStatusPedido] = useState<StatusPedido>(null);
  const [pollingAtivo, setPollingAtivo] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tentativasPollingRef = useRef(0);

  const supabase = criarClienteNavegador();

  const nomeUsuario = perfil?.nome || usuario?.user_metadata?.nome || usuario?.user_metadata?.full_name || usuario?.user_metadata?.name;
  const emailUsuario = perfil?.email || usuario?.email;
  const cpfUsuario = perfil?.cpf || usuario?.user_metadata?.cpf;

  // Parâmetros do URL para verificação de status pós-pagamento (captura completa do retorno Mercado Pago)
  const statusPedidoParam = searchParams.get('status_pedido');
  const pedidoIdParam = searchParams.get('pedido_id');
  const paymentIdParam = searchParams.get('payment_id') || searchParams.get('collection_id') || searchParams.get('data.id') || searchParams.get('id');
  const statusGatewayParam = searchParams.get('status') || searchParams.get('collection_status');
  const preferenceIdParam = searchParams.get('preference_id');
  const externalReferenceParam = searchParams.get('external_reference');
  const eventoIdParam = searchParams.get('evento_id');
  const loteIdParam = searchParams.get('lote_id');
  const compradorIdParam = searchParams.get('comprador_id');

  // --- Polling de status do pedido com resolução instantânea ---
  const consultarStatusPedido = useCallback(async (forcarReverificacao: boolean = false) => {
    if (!pedidoIdParam && !paymentIdParam && !externalReferenceParam && (!compradorIdParam || !eventoIdParam || !loteIdParam)) return;

    try {
      const params = new URLSearchParams();
      if (pedidoIdParam) params.set('pedido_id', pedidoIdParam);
      if (paymentIdParam) params.set('payment_id', paymentIdParam);
      if (statusGatewayParam) params.set('status', statusGatewayParam);
      if (preferenceIdParam) params.set('preference_id', preferenceIdParam);
      if (externalReferenceParam) params.set('external_reference', externalReferenceParam);
      if (compradorIdParam) params.set('comprador_id', compradorIdParam);
      if (eventoIdParam) params.set('evento_id', eventoIdParam);
      if (loteIdParam) params.set('lote_id', loteIdParam);

      const resp = await fetch(`/api/consultar-status-pedido?${params.toString()}`);
      const dados = await resp.json();

      if (dados.status_pedido === 'aprovado') {
        setStatusPedido('aprovado');
        setPollingAtivo(false);
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        // Limpar parâmetros da URL imediatamente para nunca mais reaparecer status antigo
        window.history.replaceState({}, '', '/meus-ingressos');
        // Recarregar ingressos para mostrar o novo imediatamente
        buscarIngressos(true);
        // Oculta mensagem de sucesso automaticamente após 7 segundos
        setTimeout(() => {
          setStatusPedido((prev) => (prev === 'aprovado' ? null : prev));
        }, 7000);
      } else if (dados.status_pedido === 'estoque_esgotado') {
        setStatusPedido('estoque_esgotado');
        setPollingAtivo(false);
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        window.history.replaceState({}, '', '/meus-ingressos');
      } else if (dados.status_pedido === 'cancelado') {
        setStatusPedido('cancelado');
        setPollingAtivo(false);
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        window.history.replaceState({}, '', '/meus-ingressos');
      } else if (dados.status_pedido === null || dados.status_pedido === 'nenhum') {
        setStatusPedido(null);
        setPollingAtivo(false);
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      }
    } catch {
      // Silenciosamente continua tentando
    }

    if (!forcarReverificacao) {
      tentativasPollingRef.current += 1;

      // Para o polling automático após 25 tentativas (50 segundos com intervalo de 2s)
      if (tentativasPollingRef.current >= 25) {
        setPollingAtivo(false);
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        window.history.replaceState({}, '', '/meus-ingressos');
        setStatusPedido(null);
      }
    }
  }, [pedidoIdParam, paymentIdParam, statusGatewayParam, preferenceIdParam, externalReferenceParam, compradorIdParam, eventoIdParam, loteIdParam]);

  useEffect(() => {
    const ehRetornoAprovado = statusGatewayParam === 'approved';
    const temIdentificador = Boolean(pedidoIdParam || paymentIdParam || externalReferenceParam || (compradorIdParam && eventoIdParam && loteIdParam));

    if (ehRetornoAprovado && temIdentificador) {
      // Pagamento aprovado no gateway — iniciar verificação imediata para liberação instantânea
      setStatusPedido('aguardando');
      setPollingAtivo(true);
      tentativasPollingRef.current = 0;
      consultarStatusPedido(true);
    } else if (statusPedidoParam === 'aprovado') {
      // Ingresso gratuito ou pagamento já confirmado — exibe conclusão diretamente sem passar por aguardando
      setStatusPedido('aprovado');
      window.history.replaceState({}, '', '/meus-ingressos');
      buscarIngressos(true);
      setTimeout(() => {
        setStatusPedido((prev) => (prev === 'aprovado' ? null : prev));
      }, 7000);
    } else if (statusPedidoParam === 'estoque_esgotado') {
      setStatusPedido('estoque_esgotado');
      window.history.replaceState({}, '', '/meus-ingressos');
    } else if (statusGatewayParam === 'rejected' || statusGatewayParam === 'cancelled' || statusPedidoParam === 'cancelado') {
      setStatusPedido('cancelado');
      window.history.replaceState({}, '', '/meus-ingressos');
    } else if (statusPedidoParam === 'aguardando' && temIdentificador) {
      // Retorno do gateway — iniciar polling para confirmar e liberar ingresso
      setStatusPedido('aguardando');
      setPollingAtivo(true);
      tentativasPollingRef.current = 0;
    }
  }, [statusPedidoParam, statusGatewayParam, pedidoIdParam, paymentIdParam, externalReferenceParam, compradorIdParam, eventoIdParam, loteIdParam, consultarStatusPedido]);

  useEffect(() => {
    if (pollingAtivo) {
      // Consultar imediatamente e depois a cada 2 segundos
      consultarStatusPedido();
      pollingRef.current = setInterval(consultarStatusPedido, 2000);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [pollingAtivo, consultarStatusPedido]);


  // --- Supabase Realtime: Atualização em tempo real do status dos ingressos ---
  useEffect(() => {
    if (!usuario?.id) return;

    const canal = supabase
      .channel(`ingressos-cliente-${usuario.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'ingressos',
          filter: `comprador_id=eq.${usuario.id}`,
        },
        (payload: { new: Partial<IngressoCompleto> }) => {
          const atualizado = payload.new;
          if (!atualizado?.id) return;

          setIngressos((prev) => {
            const novaLista = prev.map((ing) =>
              ing.id === atualizado.id
                ? {
                    ...ing,
                    status: (atualizado.status || ing.status) as StatusIngresso,
                    data_validacao: atualizado.data_validacao !== undefined ? atualizado.data_validacao : ing.data_validacao,
                    validado_por: atualizado.validado_por !== undefined ? atualizado.validado_por : ing.validado_por,
                  }
                : ing
            );
            // Atualizar cache
            if (usuario?.id) {
              cacheIngressosPorUsuario[usuario.id] = novaLista;
            }
            return novaLista;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [usuario?.id, supabase]);

  // --- Busca de ingressos com paginação ---
  useEffect(() => {
    if (usuario) {
      const temCache = !!cacheIngressosPorUsuario[usuario.id];
      if (!temCache) setCarregando(true);
      buscarIngressos(true);
    } else if (!carregandoAuth) {
      setCarregando(false);
    }
  }, [usuario, carregandoAuth]);

  async function buscarIngressos(resetar: boolean = false) {
    if (!usuario?.id) return;

    if (resetar) {
      if (!cacheIngressosPorUsuario[usuario.id]) setCarregando(true);
      setPagina(1);
    } else {
      setCarregandoMais(true);
    }

    const paginaAtual = resetar ? 1 : pagina;
    const inicio = (paginaAtual - 1) * INGRESSOS_POR_PAGINA;
    const fim = inicio + INGRESSOS_POR_PAGINA - 1;

    try {
      let { data, error } = await supabase
        .from('ingressos')
        .select(`
          id, evento_id, lote_id, comprador_id, qr_code_hash, status, data_compra, data_validacao,
          evento:eventos(id, titulo, descricao, imagem_url, data_evento, local, cidade, status, apagado_pelo_diretor, atletica_id,
            atletica:atleticas(id, nome, logo_url, cor_primaria, cor_secundaria)
          ),
          lote:lotes_ingresso(id, nome_lote, preco),
          comprador:profiles!ingressos_comprador_id_fkey(id, nome, email, cpf)
        `)
        .eq('comprador_id', usuario.id)
        .order('data_compra', { ascending: false })
        .range(inicio, fim);

      if (error) {
        console.warn('Tentando busca de ingressos sem join de comprador...', error.message);
        const { data: dataFallback, error: errorFallback } = await supabase
          .from('ingressos')
          .select(`
            id, evento_id, lote_id, comprador_id, qr_code_hash, status, data_compra, data_validacao,
            evento:eventos(id, titulo, descricao, imagem_url, data_evento, local, cidade, status, apagado_pelo_diretor, atletica_id,
              atletica:atleticas(id, nome, logo_url, cor_primaria, cor_secundaria)
            ),
            lote:lotes_ingresso(id, nome_lote, preco)
          `)
          .eq('comprador_id', usuario.id)
          .order('data_compra', { ascending: false })
          .range(inicio, fim);

        if (!errorFallback && dataFallback) {
          data = dataFallback;
          error = null;
        } else {
          console.error('Erro ao buscar ingressos:', errorFallback?.message || error?.message);
          if (resetar && !cacheIngressosPorUsuario[usuario.id]) setIngressos([]);
        }
      }

      if (data) {
        const ingressosProcessados = data as unknown as IngressoCompleto[];

        if (resetar) {
          cacheIngressosPorUsuario[usuario.id] = ingressosProcessados;
          setIngressos(ingressosProcessados);
        } else {
          setIngressos((prev) => {
            const novaLista = [...prev, ...ingressosProcessados];
            cacheIngressosPorUsuario[usuario.id] = novaLista;
            return novaLista;
          });
        }

        // Verifica se tem mais páginas
        setTemMais(ingressosProcessados.length === INGRESSOS_POR_PAGINA);
      }
    } catch (err) {
      console.error('Erro ao buscar ingressos do cliente:', err);
      if (resetar && !cacheIngressosPorUsuario[usuario.id]) setIngressos([]);
    } finally {
      setCarregando(false);
      setCarregandoMais(false);
    }
  }

  function carregarMais() {
    const novaPagina = pagina + 1;
    setPagina(novaPagina);
    buscarIngressos(false);
  }

  async function abrirDetalhesEQrCode(ingresso: IngressoCompleto) {
    setIngressoSelecionado(ingresso);
    try {
      const url = await gerarQrCodeDataUrlComLogo(ingresso.qr_code_hash, '/logomueingrss.png');
      setQrCodeUrl(url);
    } catch (err) {
      console.error('Erro ao gerar QR code:', err);
    }
  }

  async function handleBaixarPdf(ingresso: IngressoCompleto) {
    try {
      setGerandoPdfId(ingresso.id);

      // Garante que o QR code esteja gerado para inclusão no PDF
      let qrCode = qrCodeUrl;
      if (ingressoSelecionado?.id !== ingresso.id || !qrCode) {
        qrCode = await gerarQrCodeDataUrlComLogo(ingresso.qr_code_hash, '/logomueingrss.png');
      }

      await gerarPdfIngresso(
        ingresso,
        qrCode,
        nomeUsuario,
        emailUsuario,
        cpfUsuario
      );
    } catch (err) {
      console.error('Erro ao baixar PDF:', err);
    } finally {
      setGerandoPdfId(null);
    }
  }

  function dispensarStatusPedido() {
    setStatusPedido(null);
    setPollingAtivo(false);
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    // Limpar query params do URL sem recarregar a página
    window.history.replaceState({}, '', '/meus-ingressos');
  }

  function obterStatusEfetivo(ing: IngressoCompleto): StatusIngresso {
    if (ing.evento?.apagado_pelo_diretor) {
      return 'encerrado';
    }
    return ing.status;
  }

  const ingressosFiltrados = filtroStatus === 'todos'
    ? ingressos
    : ingressos.filter(i => obterStatusEfetivo(i) === filtroStatus);

  if (carregando || carregandoAuth) {
    return (
      <>
        <BarraNavegacaoMobile />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-6 pb-16">
          <div className="space-y-3 mb-6">
            <div className="h-8 w-48 bg-white/10 rounded-md animate-pulse" />
            <div className="h-4 w-72 bg-white/5 rounded-md animate-pulse" />
          </div>
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-44 rounded-xl bg-[#0f172a] border border-white/10 animate-pulse" />
            ))}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <BarraNavegacaoMobile />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-6 pb-16">

        {/* === Banner de Status do Pedido === */}
        {statusPedido === 'aguardando' && (
          <div className="mb-6 p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-amber-500/20 shrink-0">
                <Clock className="w-5 h-5 text-amber-400 animate-spin" style={{ animationDuration: '3s' }} />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-amber-300 mb-1">
                  Aguardando confirmação do pagamento...
                </h3>
                <p className="text-xs text-amber-200/80 leading-relaxed">
                  Estamos verificando a confirmação do seu pagamento junto ao banco. 
                  Isso pode levar alguns instantes. Seu ingresso será liberado automaticamente.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className={`w-3 h-3 text-amber-400 ${pollingAtivo ? 'animate-spin' : ''}`} />
                    <span className="text-[11px] text-amber-300/70">
                      {pollingAtivo ? `Verificando... (tentativa ${tentativasPollingRef.current}/25)` : 'Verificação pausada'}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setPollingAtivo(true);
                      tentativasPollingRef.current = 0;
                      consultarStatusPedido(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-bold border border-amber-500/40 transition-colors"
                  >
                    <RefreshCw size={12} className={pollingAtivo ? 'animate-spin' : ''} />
                    Verificar Agora
                  </button>
                </div>
              </div>
              <button
                onClick={dispensarStatusPedido}
                className="text-amber-400/60 hover:text-amber-300 transition-colors p-1"
                title="Dispensar"
              >
                <XCircle size={18} />
              </button>
            </div>
          </div>
        )}

        {statusPedido === 'aprovado' && (
          <div className="mb-6 p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-emerald-500/20 shrink-0">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-emerald-300 mb-1">
                  Compra concluída com sucesso!
                </h3>
                <p className="text-xs text-emerald-200/80 leading-relaxed">
                  Seu pagamento foi confirmado e o ingresso já está disponível abaixo. 
                  Apresente o QR Code na portaria ou baixe o PDF para salvar no seu celular.
                </p>
              </div>
              <button
                onClick={dispensarStatusPedido}
                className="text-emerald-400/60 hover:text-emerald-300 transition-colors p-1"
                title="Dispensar"
              >
                <XCircle size={18} />
              </button>
            </div>
          </div>
        )}

        {statusPedido === 'estoque_esgotado' && (
          <div className="mb-6 p-5 sm:p-6 rounded-2xl bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-red-500/15 border border-amber-500/40 shadow-xl backdrop-blur-md">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 shrink-0 border border-amber-500/30">
                <ShieldCheck className="w-6 h-6 text-amber-400" />
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Proteção Anti-Sobrevenda
                  </span>
                  <h3 className="text-sm sm:text-base font-extrabold text-amber-200">
                    Estoque Esgotado Durante o Processamento
                  </h3>
                </div>
                <p className="text-xs sm:text-sm text-amber-100/90 leading-relaxed">
                  Devido ao alto volume de compras simultâneas no mesmo instante, a quantidade total de ingressos deste lote foi atingida antes da conclusão da sua transação.
                </p>
                <div className="p-3 rounded-xl bg-black/40 border border-amber-500/20 text-xs text-amber-200/90 space-y-1">
                  <p className="font-semibold text-amber-300">O que acontece agora?</p>
                  <p>• A emissão do ingresso foi bloqueada para evitar vendas além do limite do lote.</p>
                  <p>• O valor total pago será <strong>estornado automaticamente</strong> na sua conta.</p>
                </div>
                {eventoIdParam && (
                  <div className="pt-1 flex flex-wrap items-center gap-2">
                    <Link
                      href={`/eventos/${eventoIdParam}`}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-bold transition-all border border-amber-500/40"
                    >
                      <RefreshCw size={13} />
                      Verificar novos lotes no evento
                    </Link>
                  </div>
                )}
              </div>
              <button
                onClick={dispensarStatusPedido}
                className="text-amber-400/60 hover:text-amber-300 transition-colors p-1 shrink-0"
                title="Dispensar"
              >
                <XCircle size={20} />
              </button>
            </div>
          </div>
        )}

        {statusPedido === 'cancelado' && (
          <div className="mb-6 p-5 rounded-2xl bg-red-500/10 border border-red-500/30">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-red-500/20 shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-red-300 mb-1">
                  Pagamento não foi concluído
                </h3>
                <p className="text-xs text-red-200/80 leading-relaxed">
                  O pagamento foi cancelado ou recusado pelo banco. Seu ingresso não foi gerado. 
                  Você pode tentar novamente acessando a página do evento.
                </p>
                {eventoIdParam && (
                  <Link
                    href={`/eventos/${eventoIdParam}`}
                    className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-bold transition-all border border-red-500/30"
                  >
                    <RefreshCw size={13} />
                    Tentar novamente
                  </Link>
                )}
              </div>
              <button
                onClick={dispensarStatusPedido}
                className="text-red-400/60 hover:text-red-300 transition-colors p-1"
                title="Dispensar"
              >
                <XCircle size={18} />
              </button>
            </div>
          </div>
        )}

        {/* Cabeçalho da Página */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black font-titulo">
              Meus <span className="gradiente-texto">Ingressos</span>
            </h1>
            <p className="text-texto-secundario text-xs sm:text-sm mt-1">
              Visualize seus eventos, apresente seu QR Code ou baixe o ingresso em PDF
            </p>
          </div>

          <div className="flex items-center gap-2 bg-fundo-card border border-borda-sutil rounded-xl p-1.5 self-start sm:self-auto">
            <Ticket className="w-4 h-4 text-primaria-400 ml-2" />
            <span className="text-xs font-semibold px-2 py-1 bg-primaria-500/10 text-primaria-400 rounded-lg">
              {ingressos.length} {ingressos.length === 1 ? 'ingresso' : 'ingressos'}
            </span>
          </div>
        </div>

        {/* Filtros por Status */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2 sem-barra-rolagem touch-pan-x">
          {[
            { id: 'todos', rotulo: 'Todos' },
            { id: 'valido', rotulo: 'Válidos' },
            { id: 'utilizado', rotulo: 'Utilizados' },
            { id: 'cancelado', rotulo: 'Cancelados' },
            { id: 'encerrado', rotulo: 'Encerrados' },
          ].map((filtro) => {
            const qtd = filtro.id === 'todos' 
              ? ingressos.length 
              : ingressos.filter(i => obterStatusEfetivo(i) === filtro.id).length;
            
            return (
              <button
                key={filtro.id}
                onClick={() => setFiltroStatus(filtro.id)}
                className={`px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all whitespace-nowrap min-h-[40px] touch-manipulation flex items-center gap-1.5 ${
                  filtroStatus === filtro.id
                    ? 'bg-primaria-500/20 text-primaria-400 border border-primaria-500/40 shadow-sm shadow-primaria-500/10'
                    : 'bg-fundo-card border border-borda-sutil text-texto-secundario hover:text-texto-principal hover:border-borda-media'
                }`}
              >
                <span>{filtro.rotulo}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  filtroStatus === filtro.id ? 'bg-primaria-500/30 text-primaria-300' : 'bg-fundo-subtil text-texto-terciario'
                }`}>
                  {qtd}
                </span>
              </button>
            );
          })}
        </div>

        {/* Lista de Ingressos */}
        {ingressosFiltrados.length > 0 ? (
          <div className="space-y-5">
            {ingressosFiltrados.map((ingresso) => {
              const estaGerandoPdf = gerandoPdfId === ingresso.id;
              const statusEfetivo = obterStatusEfetivo(ingresso);
              const ehEncerrado = statusEfetivo === 'encerrado';
              const ehCancelado = statusEfetivo === 'cancelado';
              const podeInteragir = !ehEncerrado && !ehCancelado;

              return (
                <Cartao 
                  key={ingresso.id} 
                  variante="vidro" 
                  className="overflow-hidden p-0 border border-borda-sutil hover:border-borda-media transition-all group duration-300"
                >
                  <div className="flex flex-col md:flex-row">
                    {/* Imagem do Banner / Lateral */}
                    <div className="relative md:w-48 h-36 md:h-auto bg-fundo-subtil flex-shrink-0 overflow-hidden">
                      {ingresso.evento?.imagem_url ? (
                        <img 
                          src={ingresso.evento.imagem_url} 
                          alt={ingresso.evento.titulo}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-gradient-to-br from-primaria-900/40 to-fundo-card text-center">
                          <Ticket className="w-10 h-10 text-primaria-400 mb-1 opacity-70" />
                          <span className="text-[10px] font-bold text-texto-terciario uppercase tracking-wider">
                            MeuIngrss
                          </span>
                        </div>
                      )}
                      
                      <div className="absolute inset-0 bg-gradient-to-t from-fundo-card via-transparent to-transparent md:bg-gradient-to-r md:from-transparent md:to-fundo-card/80 opacity-90 md:opacity-100" />
                      
                      <div className="absolute top-3 left-3 md:hidden">
                        <Distintivo status={statusEfetivo} tamanho="sm" />
                      </div>
                    </div>

                    {/* Conteúdo Principal */}
                    <div className="flex-1 p-5 flex flex-col justify-between">
                      <div>
                        {/* Status + Atlética Header */}
                        <div className="flex items-center justify-between gap-2 mb-2">
                          {ingresso.evento?.atletica?.nome ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-secundaria-400 bg-secundaria-500/10 px-2.5 py-1 rounded-md">
                              <Building2 size={12} />
                              {ingresso.evento.atletica.nome}
                            </span>
                          ) : (
                            <span className="text-xs font-semibold text-texto-terciario uppercase tracking-wider">
                              Evento Oficial
                            </span>
                          )}

                          <div className="hidden md:block">
                            <Distintivo status={statusEfetivo} tamanho="sm" />
                          </div>
                        </div>

                        {/* Título do Evento */}
                        <h3 className="text-lg sm:text-xl font-bold font-titulo text-texto-principal group-hover:text-primaria-400 transition-colors mb-2 leading-snug">
                          {ingresso.evento?.titulo}
                        </h3>

                        {/* Data e Local */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-texto-secundario mb-4">
                          <div className="flex items-center gap-1.5 bg-fundo-principal/50 p-2 rounded-lg border border-borda-sutil/50">
                            <Calendar size={14} className="text-primaria-400 flex-shrink-0" />
                            <span className="truncate">{formatarData(ingresso.evento?.data_evento)}</span>
                          </div>

                          <div className="flex items-center gap-1.5 bg-fundo-principal/50 p-2 rounded-lg border border-borda-sutil/50">
                            <MapPin size={14} className="text-secundaria-400 flex-shrink-0" />
                            <span className="truncate">{ingresso.evento?.local}</span>
                          </div>
                        </div>
                      </div>

                      {/* Rodapé do Card: Preço/Lote e Ações */}
                      <div className="pt-3 border-t border-borda-sutil flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 text-xs text-texto-terciario">
                            <span className="font-semibold text-texto-secundario bg-fundo-subtil px-2 py-0.5 rounded">
                              {ingresso.lote?.nome_lote || 'Lote Único'}
                            </span>
                            <span>•</span>
                            <span className="font-bold text-texto-principal">
                              {formatarMoeda(ingresso.lote?.preco || 0)}
                            </span>
                          </div>
                          {mascararCPF(ingresso.comprador?.cpf || cpfUsuario) && (
                            <div className="text-[11px] font-mono text-texto-terciario flex items-center gap-1.5">
                              <span>CPF: {mascararCPF(ingresso.comprador?.cpf || cpfUsuario)}</span>
                            </div>
                          )}
                        </div>

                        {/* Ações */}
                        {podeInteragir ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => abrirDetalhesEQrCode(ingresso)}
                              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-primaria-500/15 text-primaria-400 hover:bg-primaria-500/25 border border-primaria-500/30 text-xs font-bold transition-all min-h-[38px] touch-manipulation"
                            >
                              <QrCode size={14} />
                              Detalhes & QR
                            </button>

                            <button
                              onClick={() => handleBaixarPdf(ingresso)}
                              disabled={estaGerandoPdf}
                              title="Baixar ingresso em PDF"
                              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-fundo-subtil hover:bg-fundo-elevado text-texto-principal border border-borda-media text-xs font-bold transition-all min-h-[38px] touch-manipulation disabled:opacity-50"
                            >
                              {estaGerandoPdf ? (
                                <Loader2 size={14} className="animate-spin text-primaria-400" />
                              ) : (
                                <Download size={14} className="text-primaria-400" />
                              )}
                              <span className="hidden sm:inline">PDF</span>
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-semibold px-3 py-1.5 rounded-xl border ${
                              ehEncerrado
                                ? 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                                : 'bg-red-500/10 text-red-400 border-red-500/20'
                            }`}>
                              {ehEncerrado ? 'Evento encerrado' : 'Ingresso cancelado'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </Cartao>
              );
            })}

            {/* Botão Carregar Mais (Paginação) */}
            {temMais && (
              <div className="flex justify-center pt-4">
                <button
                  onClick={carregarMais}
                  disabled={carregandoMais}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-fundo-card hover:bg-fundo-elevado text-texto-principal border border-borda-media text-sm font-semibold transition-all min-h-[44px] touch-manipulation disabled:opacity-50"
                >
                  {carregandoMais ? (
                    <>
                      <Loader2 size={16} className="animate-spin text-primaria-400" />
                      Carregando...
                    </>
                  ) : (
                    <>
                      <RefreshCw size={16} className="text-primaria-400" />
                      Carregar mais ingressos
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        ) : (
          <EstadoVazio
            titulo={filtroStatus === 'todos' ? 'Nenhum ingresso encontrado no momento' : `Nenhum ingresso com status "${filtroStatus}"`}
            descricao={filtroStatus === 'todos' ? 'Você ainda não possui ingressos comprados. Explore os eventos disponíveis e garanta o seu!' : 'Alterne os filtros acima para visualizar outros ingressos.'}
            icone={<Ticket className="w-7 h-7" />}
            acao={
              filtroStatus === 'todos' ? (
                <Link href="/eventos">
                  <Botao>Explorar Eventos</Botao>
                </Link>
              ) : undefined
            }
          />
        )}

        {/* Modal de Detalhes Completos do Ingresso */}
        <ModalDetalhesIngresso
          aberto={!!ingressoSelecionado}
          aoFechar={() => setIngressoSelecionado(null)}
          ingresso={ingressoSelecionado}
          qrCodeUrl={qrCodeUrl}
          nomeUsuario={nomeUsuario}
          emailUsuario={emailUsuario}
          cpfUsuario={cpfUsuario}
          onBaixarPdf={handleBaixarPdf}
          estaGerandoPdf={!!gerandoPdfId && gerandoPdfId === ingressoSelecionado?.id}
        />
      </div>
    </>
  );
}

export default function PaginaMeusIngressos() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-fundo-principal">
        <Carregando tamanho="lg" texto="Carregando seus ingressos..." />
      </div>
    }>
      <ConteudoMeusIngressos />
    </Suspense>
  );
}
