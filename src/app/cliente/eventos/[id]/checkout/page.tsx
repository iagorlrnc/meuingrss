'use client';

import { useState, useEffect, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Botao from '@/componentes/ui/Botao';
import Cartao from '@/componentes/ui/Cartao';
import Carregando from '@/componentes/ui/Carregando';
import CaptchaCloudflare from '@/componentes/ui/CaptchaCloudflare';
import { criarClienteNavegador } from '@/lib/supabase/cliente';
import { formatarMoeda, formatarDataHora } from '@/lib/utilitarios';
import { usarAutenticacao } from '@/contextos/ContextoAutenticacao';
import type { Evento, LoteIngresso } from '@/tipos';
import {
  ArrowLeft,
  CreditCard,
  Shield,
  Lock,
  Ticket,
  Calendar,
  MapPin,
} from 'lucide-react';

function ConteudoCheckout() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { usuario } = usarAutenticacao();
  const loteId = searchParams.get('lote');
  const qtd = parseInt(searchParams.get('qtd') || '1');

  const [evento, setEvento] = useState<Evento | null>(null);
  const [lote, setLote] = useState<LoteIngresso | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState('');
  const supabase = criarClienteNavegador();

  async function buscarDados() {
    const eventoIdParam = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';
    const ehUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventoIdParam);

    let query = supabase
      .from('eventos')
      .select('id, slug, titulo, data_evento, local, cidade, status, imagem_url, atletica_id, atletica:atleticas(nome, logo_url)');

    if (ehUUID) {
      query = query.eq('id', eventoIdParam);
    } else {
      query = query.eq('slug', eventoIdParam);
    }

    query = query.eq('apagado_pelo_diretor', false);

    const { data: eventoData } = await query.single();

    if (eventoData) {
      setEvento(eventoData as Evento);
    }

    if (loteId) {
      const { data: loteData } = await supabase
        .from('lotes_ingresso')
        .select('id, evento_id, nome_lote, preco, quantidade_total, quantidade_vendida, ativo')
        .eq('id', loteId)
        .single();

      if (loteData) setLote(loteData as LoteIngresso);
    }

    setCarregando(false);
  }

  useEffect(() => {
    buscarDados();
  }, [params.id, loteId]);

  async function processarPagamento() {
    if (!usuario || !lote || !evento) return;

    setProcessando(true);
    setErro('');

    try {
      const resposta = await fetch('/api/criar-sessao-pagamento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evento_id: evento.id,
          lote_id: lote.id,
          quantidade: qtd,
          comprador_id: usuario.id,
        }),
      });

      const dados = await resposta.json();

      if (dados.url) {
        window.location.href = dados.url;
      } else {
        setErro(dados.erro || 'Erro ao criar sessão de pagamento');
        setProcessando(false);
      }
    } catch {
      setErro('Erro de conexão. Tente novamente.');
      setProcessando(false);
    }
  }

  if (carregando) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Carregando tamanho="lg" texto="Preparando checkout..." />
      </div>
    );
  }

  if (!evento || !lote) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold font-titulo mb-4">Dados inválidos</h2>
          <Link href="/eventos">
            <Botao variante="contorno">Voltar aos eventos</Botao>
          </Link>
        </div>
      </div>
    );
  }

  const TAXA_PERCENTUAL = 0.12;
  const subtotal = lote.preco * qtd;
  const taxaServico = lote.preco === 0 ? 0 : Math.round((subtotal * TAXA_PERCENTUAL) * 100) / 100;
  const totalFinal = subtotal + taxaServico;

  return (
    <div className="min-h-screen pt-16 sm:pt-20 md:pt-24 pb-12 px-4">
      <div className="max-w-3xl mx-auto">
        <Link
          href={`/eventos/${params.id}`}
          className="inline-flex items-center gap-2 text-sm text-texto-secundario hover:text-texto-principal transition-colors mb-8"
        >
          <ArrowLeft size={16} />
          Voltar ao evento
        </Link>

        <h1 className="text-2xl sm:text-3xl font-black font-titulo mb-8">
          Finalizar <span className="gradiente-texto">Compra</span>
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Resumo do Evento e Ingressos */}
          <div className="lg:col-span-3">
            <Cartao variante="vidro" className="overflow-hidden !p-0">
              {/* Banner do Evento acima do título */}
              {evento.imagem_url ? (
                <div className="relative w-full h-44 sm:h-52 overflow-hidden border-b border-borda-sutil">
                  <img
                    src={evento.imagem_url}
                    alt={evento.titulo}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-fundo-card via-fundo-card/30 to-transparent" />
                  <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primaria-500/90 text-white backdrop-blur-md shadow-lg">
                      <Ticket size={13} />
                      {lote.nome_lote}
                    </span>
                    {evento.cidade && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-black/60 text-texto-principal backdrop-blur-md border border-white/10">
                        <MapPin size={13} className="text-secundaria-400" />
                        {evento.cidade}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="w-full h-32 bg-gradient-to-r from-primaria-600/20 to-secundaria-600/20 border-b border-borda-sutil flex items-center justify-center">
                  <Ticket size={40} className="text-primaria-400 opacity-60" />
                </div>
              )}

              <div className="p-5 sm:p-6">
                <h3 className="text-xl sm:text-2xl font-bold font-titulo text-texto-principal mb-2">
                  {evento.titulo}
                </h3>

                {evento.descricao && (
                  <p className="text-xs sm:text-sm text-texto-secundario mb-4 line-clamp-2 leading-relaxed">
                    {evento.descricao}
                  </p>
                )}

                {/* Informações detalhadas do Evento */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-fundo-input border border-borda-sutil mb-6">
                  <div className="flex items-start gap-2.5">
                    <div className="p-2 rounded-lg bg-primaria-500/10 text-primaria-400 shrink-0">
                      <Calendar size={16} />
                    </div>
                    <div>
                      <span className="block text-[11px] font-semibold text-texto-terciario uppercase tracking-wider">Data e Horário</span>
                      <span className="text-xs sm:text-sm font-medium text-texto-principal">
                        {formatarDataHora(evento.data_evento)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <div className="p-2 rounded-lg bg-secundaria-500/10 text-secundaria-400 shrink-0">
                      <MapPin size={16} />
                    </div>
                    <div>
                      <span className="block text-[11px] font-semibold text-texto-terciario uppercase tracking-wider">Local</span>
                      <span className="text-xs sm:text-sm font-medium text-texto-principal truncate block max-w-[180px]" title={evento.local}>
                        {evento.local}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-borda-sutil pt-4 space-y-2.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-texto-secundario">Lote</span>
                    <span className="text-texto-principal font-medium">{lote.nome_lote}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-texto-secundario">Preço unitário</span>
                    <span className="text-texto-principal font-medium">{formatarMoeda(lote.preco)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-texto-secundario">Quantidade</span>
                    <span className="text-texto-principal font-medium">{qtd}x</span>
                  </div>

                  {subtotal > 0 && (
                    <>
                      <div className="flex items-center justify-between text-sm pt-1 border-t border-borda-sutil/50">
                        <span className="text-texto-secundario">Subtotal</span>
                        <span className="text-texto-principal font-medium">{formatarMoeda(subtotal)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-texto-secundario flex items-center gap-1">
                          Taxa da plataforma e banco (12%)
                        </span>
                        <span className="text-primaria-400 font-semibold">+{formatarMoeda(taxaServico)}</span>
                      </div>
                    </>
                  )}

                  <div className="border-t border-borda-sutil pt-3 flex items-center justify-between">
                    <div>
                      <span className="text-base sm:text-lg font-bold text-texto-principal block">Valor Final a Pagar</span>
                      {taxaServico > 0 && (
                        <span className="text-[11px] text-texto-terciario">Inclui ingressos e taxas da plataforma</span>
                      )}
                    </div>
                    <span className="text-2xl sm:text-3xl font-black gradiente-texto">{formatarMoeda(totalFinal)}</span>
                  </div>
                </div>
              </div>
            </Cartao>
          </div>

          {/* Formas de Pagamento e Botão */}
          <div className="lg:col-span-2">
            <Cartao variante="elevado">
              <h3 className="text-lg font-bold font-titulo mb-4 flex items-center gap-2">
                <CreditCard size={20} className="text-primaria-400" />
                Pagamento
              </h3>

              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-2 text-xs text-texto-terciario">
                  <Shield size={14} className="text-sucesso shrink-0" />
                  Pagamento seguro via Mercado Pago (PIX, Cartão ou Boleto)
                </div>
                <div className="flex items-center gap-2 text-xs text-texto-terciario">
                  <Lock size={14} className="text-sucesso shrink-0" />
                  Pagamento criptografado via Mercado Pago
                </div>
                <div className="flex items-center gap-2 text-xs text-texto-terciario">
                  <Ticket size={14} className="text-sucesso shrink-0" />
                  Ingresso liberado após confirmação do pagamento
                </div>
              </div>

              {erro && (
                <div className="p-3 rounded-xl bg-erro/10 border border-erro/20 text-sm text-erro mb-4">
                  {erro}
                </div>
              )}

              <Botao
                larguraTotal
                tamanho="xl"
                carregando={processando}
                onClick={processarPagamento}
                icone={<CreditCard size={20} />}
              >
                Pagar {formatarMoeda(totalFinal)}
              </Botao>

              <CaptchaCloudflare />

              <p className="text-[10px] text-texto-terciario text-center mt-4">
                Ao clicar em "Pagar", você será redirecionado para o ambiente seguro do Mercado Pago.
              </p>
            </Cartao>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PaginaCheckout() {
  return (
    <Suspense fallback={<Carregando telaCheia texto="Carregando checkout..." />}>
      <ConteudoCheckout />
    </Suspense>
  );
}
