'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { initMercadoPago, CardPayment } from '@mercadopago/sdk-react';
import Botao from '@/componentes/ui/Botao';
import Carregando from '@/componentes/ui/Carregando';
import { formatarMoeda } from '@/lib/utilitarios';
import { usarCarrinho } from '@/contextos/ContextoCarrinho';
import {
  QrCode,
  CreditCard,
  Copy,
  Check,
  Clock,
  RefreshCw,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

interface PropsCheckoutLoja {
  itens: {
    product_id: string;
    size: string | null;
    quantity: number;
  }[];
  usuario: {
    id: string;
    nome?: string;
    email?: string;
    cpf?: string;
    telefone?: string;
  };
  totalCentavos: number;
}

interface DadosPixLoja {
  order_id: string;
  payment_id: string;
  qr_code: string;
  qr_code_base64: string;
  date_of_expiration: string;
}

// Inicializa o Mercado Pago SDK no lado do cliente
if (typeof window !== 'undefined') {
  const pk = process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY;
  if (pk) {
    try {
      initMercadoPago(pk, { locale: 'pt-BR' });
    } catch {
      // Ignora re-inicialização
    }
  }
}

function ContadorPix({
  dataExpiracaoIso,
  onExpirar,
}: {
  dataExpiracaoIso: string;
  onExpirar?: () => void;
}) {
  const [segundosRestantes, setSegundosRestantes] = useState<number | null>(null);

  useEffect(() => {
    const calcularDiferenca = () => {
      const expiraEm = new Date(dataExpiracaoIso).getTime();
      const agora = Date.now();
      const diff = Math.max(0, Math.floor((expiraEm - agora) / 1000));
      setSegundosRestantes(diff);

      if (diff <= 0 && onExpirar) {
        onExpirar();
      }
    };

    calcularDiferenca();
    const interval = setInterval(calcularDiferenca, 1000);
    return () => clearInterval(interval);
  }, [dataExpiracaoIso, onExpirar]);

  function formatarTempo(segundos: number): string {
    const min = Math.floor(segundos / 60);
    const seg = segundos % 60;
    return `${String(min).padStart(2, '0')}:${String(seg).padStart(2, '0')}`;
  }

  return (
    <div className="flex items-center justify-between p-3 sm:p-3.5 rounded-xl bg-[#0b101d] border border-white/10">
      <div className="flex items-center gap-2 text-xs text-slate-300">
        <Clock size={16} className="text-[#00e5ff] shrink-0" />
        Expira em:
      </div>
      {segundosRestantes !== null && segundosRestantes > 0 ? (
        <span className="font-mono text-xs sm:text-sm font-bold text-[#00e5ff]">
          {formatarTempo(segundosRestantes)}
        </span>
      ) : (
        <span className="text-xs font-bold text-red-400 flex items-center gap-1">
          QR Code Expirado
        </span>
      )}
    </div>
  );
}

export default function CheckoutTransparenteLoja({
  itens,
  usuario,
  totalCentavos,
}: PropsCheckoutLoja) {
  const router = useRouter();
  const { limparCarrinho } = usarCarrinho();
  const [metodo, setMetodo] = useState<'pix' | 'cartao'>('pix');

  // Estados Pix
  const [gerandoPix, setGerandoPix] = useState(false);
  const [dadosPix, setDadosPix] = useState<DadosPixLoja | null>(null);
  const [pixExpirado, setPixExpirado] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [pixAprovado, setPixAprovado] = useState(false);
  const [erroPix, setErroPix] = useState('');

  // Estados Cartão
  const [processandoCard, setProcessandoCard] = useState(false);
  const [brickCarregando, setBrickCarregando] = useState(true);
  const [erroCard, setErroCard] = useState('');
  const [cardAprovado, setCardAprovado] = useState(false);

  const timerPollingRef = useRef<NodeJS.Timeout | null>(null);
  const totalReais = totalCentavos / 100;

  useEffect(() => {
    const publicKey = process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY;
    if (publicKey && typeof window !== 'undefined') {
      try {
        initMercadoPago(publicKey, { locale: 'pt-BR' });
      } catch {
        // Ignora
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timerPollingRef.current) clearInterval(timerPollingRef.current);
    };
  }, []);

  // --- FLUXO PIX ---
  async function gerarPagamentoPix() {
    setGerandoPix(true);
    setErroPix('');
    setPixAprovado(false);
    setPixExpirado(false);

    try {
      const res = await fetch('/api/loja/pagamentos/pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itens,
          comprador_id: usuario.id,
        }),
      });

      const dados = await res.json();

      if (!res.ok || !dados.sucesso) {
        setErroPix(dados.erro || 'Falha ao gerar QR Code Pix da loja.');
        setGerandoPix(false);
        return;
      }

      setDadosPix({
        order_id: dados.order_id,
        payment_id: dados.payment_id,
        qr_code: dados.qr_code,
        qr_code_base64: dados.qr_code_base64,
        date_of_expiration: dados.date_of_expiration,
      });

      setGerandoPix(false);
      iniciarPollingStatus(dados.order_id, dados.payment_id);
    } catch {
      setErroPix('Erro de rede ao conectar com o banco para gerar o Pix.');
      setGerandoPix(false);
    }
  }

  const iniciarPollingStatus = useCallback((orderId: string, paymentId?: string) => {
    if (timerPollingRef.current) clearInterval(timerPollingRef.current);

    const verificar = async () => {
      try {
        const params = new URLSearchParams();
        if (orderId) params.set('order_id', orderId);
        if (paymentId) params.set('payment_id', paymentId);

        const res = await fetch(`/api/loja/consultar-status-pedido?${params.toString()}`);
        if (!res.ok) return;

        const data = await res.json();
        if (data.status_pedido === 'paid') {
          if (timerPollingRef.current) clearInterval(timerPollingRef.current);
          setPixAprovado(true);
          await limparCarrinho();

          setTimeout(() => {
            router.push(`/loja/meus-pedidos?order_id=${orderId}&status=aprovado`);
          }, 1800);
        } else if (['cancelled', 'failed', 'stock_unavailable'].includes(data.status_pedido)) {
          if (timerPollingRef.current) clearInterval(timerPollingRef.current);
          setErroPix(data.mensagem || 'O pagamento Pix foi cancelado ou expirou.');
        }
      } catch {
        // Ignora erros transitórios
      }
    };

    verificar();
    timerPollingRef.current = setInterval(verificar, 2500);
  }, [router, limparCarrinho]);

  function copiarCodigoPix() {
    if (!dadosPix?.qr_code) return;
    navigator.clipboard.writeText(dadosPix.qr_code);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 3000);
  }

  // --- FLUXO CARTÃO ---
  const processarSubmissaoCard = useCallback(async (param: any) => {
    setProcessandoCard(true);
    setErroCard('');

    const nestedData = (param?.formData || param) as Record<string, any>;
    const token = param?.token || nestedData?.token;
    const payment_method_id =
      param?.payment_method_id ||
      param?.paymentMethodId ||
      nestedData?.payment_method_id ||
      nestedData?.paymentMethodId ||
      'visa';
    const installments = param?.installments || nestedData?.installments || 1;
    const issuer_id = param?.issuer_id || param?.issuerId || nestedData?.issuer_id || nestedData?.issuerId;
    const payer = param?.payer || nestedData?.payer;

    try {
      const res = await fetch('/api/loja/pagamentos/card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          payment_method_id,
          installments,
          issuer_id,
          payer,
          itens,
          comprador_id: usuario.id,
        }),
      });

      const dados = await res.json();

      if (!res.ok || !dados.sucesso) {
        setErroCard(dados.erro || 'Não foi possível autorizar o cartão de crédito.');
        setProcessandoCard(false);
        return;
      }

      if (dados.status === 'approved') {
        setCardAprovado(true);
        await limparCarrinho();
        setTimeout(() => {
          router.push(`/loja/meus-pedidos?order_id=${dados.order_id}&status=aprovado`);
        }, 1800);
      } else {
        router.push(`/loja/meus-pedidos?order_id=${dados.order_id}&status=analise`);
      }
    } catch {
      setErroCard('Erro de comunicação ao enviar dados do pagamento.');
      setProcessandoCard(false);
    }
  }, [itens, usuario.id, router, limparCarrinho]);

  const cardInitialization = useMemo(() => {
    const docLimpo = (usuario.cpf || '').replace(/\D/g, '');
    return {
      amount: Number(totalReais.toFixed(2)),
      payer: {
        email: (usuario.email && usuario.email.includes('@')) ? usuario.email : 'comprador@meuingrss.com.br',
        identification: (docLimpo.length === 11 || docLimpo.length === 14) ? {
          type: docLimpo.length === 14 ? 'CNPJ' : 'CPF',
          number: docLimpo,
        } : undefined,
      },
    };
  }, [totalReais, usuario.email, usuario.cpf]);

  const cardCustomization = useMemo(() => ({
    visual: {
      style: {
        theme: 'dark' as const,
        customVariables: {
          formBackgroundColor: 'transparent',
          baseColor: '#00e5ff',
        },
      },
    },
    paymentMethods: {
      minInstallments: 1,
      maxInstallments: 12,
    },
  }), []);

  const handleCardReady = useCallback(async () => {
    setBrickCarregando(false);
  }, []);

  const handleCardError = useCallback(async (error: any) => {
    console.error('Erro no Payment Brick da loja:', error);
    setBrickCarregando(false);
    setErroCard('Não foi possível carregar os campos do cartão. Verifique sua conexão e tente novamente.');
  }, []);

  return (
    <div className="w-full space-y-4 sm:space-y-6">
      {/* Seletor de Métodos de Pagamento */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 p-1.5 rounded-2xl bg-[#0b101d] border border-white/10">
        <button
          type="button"
          onClick={() => setMetodo('pix')}
          className={`flex items-center justify-center gap-1.5 sm:gap-2 py-3 px-3 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all duration-200 cursor-pointer ${
            metodo === 'pix'
              ? 'bg-gradient-to-r from-[#00e5ff] to-[#026cdf] text-slate-950 shadow-lg'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <QrCode size={16} className="shrink-0" />
          <span>Pix</span>
        </button>

        <button
          type="button"
          onClick={() => setMetodo('cartao')}
          className={`flex items-center justify-center gap-1.5 sm:gap-2 py-3 px-3 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all duration-200 cursor-pointer ${
            metodo === 'cartao'
              ? 'bg-gradient-to-r from-[#ff007a] to-[#8b5cf6] text-white shadow-lg'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <CreditCard size={16} className="shrink-0" />
          <span>Cartão de Crédito</span>
        </button>
      </div>

      {/* PAINEL PIX */}
      <div className={metodo === 'pix' ? 'block' : 'hidden'}>
        <div className="p-4 sm:p-6 rounded-2xl bg-[#0e1626] border border-white/10 space-y-4 sm:space-y-6">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm sm:text-base font-bold font-titulo text-white flex items-center gap-2">
              <QrCode className="text-[#00e5ff] shrink-0" size={18} />
              Pagamento via Pix Oficial
            </h4>
          </div>

          {erroPix && (
            <div className="p-3 sm:p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs sm:text-sm text-red-400 flex items-start gap-2.5">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{erroPix}</span>
            </div>
          )}

          {!dadosPix && !gerandoPix && (
            <div className="text-center py-4 space-y-4">
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Clique no botão abaixo para gerar o código Pix e o QR Code de pagamento para o valor total de{' '}
                <strong className="text-[#00e5ff] text-base">{formatarMoeda(totalReais)}</strong>.
              </p>

              <Botao
                larguraTotal
                tamanho="lg"
                onClick={gerarPagamentoPix}
                icone={<QrCode size={18} />}
                className="bg-gradient-to-r from-[#00e5ff] to-[#026cdf] text-slate-950 font-black"
              >
                Gerar QR Code Pix
              </Botao>
            </div>
          )}

          {gerandoPix && (
            <div className="py-6 sm:py-8 flex flex-col items-center justify-center gap-3 text-center">
              <Carregando tamanho="lg" texto="Gerando chave Pix com Mercado Pago..." />
            </div>
          )}

          {dadosPix && (
            <div className="space-y-4 sm:space-y-6">
              {pixAprovado ? (
                <div className="py-6 sm:py-8 flex flex-col items-center justify-center gap-3 text-center bg-emerald-500/10 rounded-2xl border border-emerald-500/30 p-4 sm:p-6">
                  <CheckCircle2 size={40} className="text-emerald-400 animate-bounce" />
                  <h4 className="text-lg sm:text-xl font-bold text-white">Pagamento Confirmado!</h4>
                  <p className="text-xs text-slate-400">
                    Seu pedido foi registrado com sucesso. Redirecionando...
                  </p>
                </div>
              ) : (
                <>
                  <ContadorPix
                    dataExpiracaoIso={dadosPix.date_of_expiration}
                    onExpirar={() => setPixExpirado(true)}
                  />

                  {pixExpirado ? (
                    <div className="text-center py-4 space-y-3">
                      <p className="text-xs text-red-400">
                        O tempo de validade do QR Code expirou. Por favor, gere um novo código.
                      </p>
                      <Botao
                        variante="contorno"
                        larguraTotal
                        onClick={gerarPagamentoPix}
                        icone={<RefreshCw size={16} />}
                      >
                        Gerar Novo QR Code Pix
                      </Botao>
                    </div>
                  ) : (
                    <>
                      {dadosPix.qr_code_base64 && (
                        <div className="flex flex-col items-center justify-center gap-2">
                          <div className="p-3 bg-white rounded-2xl shadow-xl inline-block">
                            <img
                              src={`data:image/jpeg;base64,${dadosPix.qr_code_base64}`}
                              alt="QR Code Pix"
                              className="w-40 h-40 sm:w-48 sm:h-48 object-contain"
                            />
                          </div>
                          <span className="text-[11px] text-slate-400 text-center">
                            Abra o app do seu banco e escaneie o código
                          </span>
                        </div>
                      )}

                      <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                          Ou pague usando o Pix Copia e Cola:
                        </label>
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                          <input
                            type="text"
                            readOnly
                            value={dadosPix.qr_code}
                            className="flex-1 w-full bg-[#111a2e] border border-white/10 rounded-xl px-3 py-2.5 text-xs font-mono text-white truncate outline-none"
                          />
                          <Botao
                            variante={copiado ? 'sucesso' : 'primario'}
                            tamanho="sm"
                            onClick={copiarCodigoPix}
                            className="w-full sm:w-auto shrink-0 justify-center py-2.5"
                            icone={copiado ? <Check size={14} /> : <Copy size={14} />}
                          >
                            {copiado ? 'Copiado!' : 'Copiar'}
                          </Botao>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-[#00e5ff]/10 border border-[#00e5ff]/20 text-xs text-[#00e5ff] flex items-center gap-2 leading-relaxed">
                        <ShieldCheck size={16} className="shrink-0" />
                        <span>Aguardando a confirmação do pagamento... Não feche esta tela.</span>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* PAINEL CARTÃO DE CRÉDITO */}
      <div className={metodo === 'cartao' ? 'block' : 'hidden'}>
        <div className="p-4 sm:p-6 rounded-2xl bg-[#0e1626] border border-white/10 space-y-4 sm:space-y-6">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm sm:text-base font-bold font-titulo text-white flex items-center gap-2">
              <CreditCard className="text-[#ff007a] shrink-0" size={18} />
              Criptografado via Mercado Pago
            </h4>
          </div>

          {!process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY ? (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs sm:text-sm text-red-400">
              A chave pública do Mercado Pago (`NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY`) não está configurada no ambiente.
            </div>
          ) : (
            <>
              {erroCard && (
                <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs sm:text-sm text-red-400 flex items-start gap-2.5">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{erroCard}</span>
                </div>
              )}

              {cardAprovado ? (
                <div className="py-6 sm:py-8 flex flex-col items-center justify-center gap-3 text-center bg-emerald-500/10 rounded-2xl border border-emerald-500/30 p-4 sm:p-6">
                  <CheckCircle2 size={40} className="text-emerald-400 animate-bounce" />
                  <h4 className="text-lg sm:text-xl font-bold text-white">Pagamento Aprovado!</h4>
                  <p className="text-xs text-slate-400">
                    Seu pedido foi confirmado com sucesso. Redirecionando...
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="mercado-pago-card-container relative w-full min-h-[320px] overflow-x-hidden [&_.mp-payment-form]:!w-full [&_iframe]:!max-w-full [&_iframe]:!w-full">
                    {processandoCard && (
                      <div className="py-6 flex flex-col items-center justify-center gap-2">
                        <Carregando tamanho="md" texto="Processando autorização do cartão..." />
                      </div>
                    )}

                    {brickCarregando && !processandoCard && (
                      <div className="py-12 flex flex-col items-center justify-center gap-3 text-center">
                        <Carregando tamanho="md" texto="Carregando formulário de pagamento seguro..." />
                      </div>
                    )}

                    <div className={brickCarregando ? 'opacity-0 h-0 overflow-hidden' : 'opacity-100 transition-opacity duration-300'}>
                      <CardPayment
                        initialization={cardInitialization}
                        customization={cardCustomization}
                        onSubmit={processarSubmissaoCard}
                        onReady={handleCardReady}
                        onError={handleCardError}
                      />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          <p className="text-[11px] text-slate-400 text-center leading-relaxed">
            Seus dados financeiros são criptografados com segurança de ponta a ponta pelo Mercado Pago.
          </p>
        </div>
      </div>
    </div>
  );
}
