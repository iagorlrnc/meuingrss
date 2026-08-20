'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { initMercadoPago, CardPayment } from '@mercadopago/sdk-react';
import Botao from '@/componentes/ui/Botao';
import Carregando from '@/componentes/ui/Carregando';
import { formatarMoeda } from '@/lib/utilitarios';
import type { Evento, LoteIngresso } from '@/tipos';
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

interface PropsCheckoutTransparente {
  evento: Evento;
  lote: LoteIngresso;
  quantidade: number;
  usuario: {
    id: string;
    nome?: string;
    email?: string;
    cpf?: string;
    telefone?: string;
  };
  totalFinal: number;
}

interface DadosPix {
  pedido_id: string;
  payment_id: string;
  qr_code: string;
  qr_code_base64: string;
  date_of_expiration: string;
}

// Inicializa o Mercado Pago SDK no lado do cliente uma única vez
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

/**
 * Subcomponente isolado para o temporizador do Pix.
 * Isolar o estado do contador garante que a atualização a cada 1 segundo (1000ms)
 * re-renderize EXCLUSIVAMENTE este bloco, sem propagar re-renders para o componente
 * pai ou para o formulário de Cartão de Crédito do Mercado Pago.
 */
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
    <div className="flex items-center justify-between p-3 sm:p-3.5 rounded-xl bg-fundo-input border border-borda-sutil">
      <div className="flex items-center gap-2 text-xs text-texto-secundario">
        <Clock size={16} className="text-secundaria-400 shrink-0" />
        Expira em:
      </div>
      {segundosRestantes !== null && segundosRestantes > 0 ? (
        <span className="font-mono text-xs sm:text-sm font-bold text-secundaria-400">
          {formatarTempo(segundosRestantes)}
        </span>
      ) : (
        <span className="text-xs font-bold text-erro flex items-center gap-1">
          QR Code Expirado
        </span>
      )}
    </div>
  );
}

export default function CheckoutTransparente({
  evento,
  lote,
  quantidade,
  usuario,
  totalFinal,
}: PropsCheckoutTransparente) {
  const router = useRouter();
  const [metodo, setMetodo] = useState<'pix' | 'cartao'>('pix');

  // Estados Pix
  const [gerandoPix, setGerandoPix] = useState(false);
  const [dadosPix, setDadosPix] = useState<DadosPix | null>(null);
  const [pixExpirado, setPixExpirado] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [pixAprovado, setPixAprovado] = useState(false);
  const [erroPix, setErroPix] = useState('');

  // Estados Cartão (Payment Brick)
  const [processandoCard, setProcessandoCard] = useState(false);
  const [brickCarregando, setBrickCarregando] = useState(true);
  const [erroCard, setErroCard] = useState('');
  const [cardAprovado, setCardAprovado] = useState(false);

  const timerPollingRef = useRef<NodeJS.Timeout | null>(null);

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

  // Limpeza do polling ao desmontar
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
      const res = await fetch('/api/payments/pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evento_id: evento.id,
          lote_id: lote.id,
          quantidade,
          comprador_id: usuario.id,
        }),
      });

      const dados = await res.json();

      if (!res.ok || !dados.sucesso) {
        setErroPix(dados.erro || 'Falha ao gerar QR Code Pix. Tente novamente.');
        setGerandoPix(false);
        return;
      }

      setDadosPix({
        pedido_id: dados.pedido_id,
        payment_id: dados.payment_id,
        qr_code: dados.qr_code,
        qr_code_base64: dados.qr_code_base64,
        date_of_expiration: dados.date_of_expiration,
      });

      setGerandoPix(false);
      iniciarPollingStatus(dados.pedido_id, dados.payment_id);
    } catch {
      setErroPix('Erro de rede ao conectar com o banco para gerar o Pix.');
      setGerandoPix(false);
    }
  }

  const iniciarPollingStatus = useCallback((pedidoId: string, paymentId?: string) => {
    if (timerPollingRef.current) clearInterval(timerPollingRef.current);

    const verificar = async () => {
      try {
        const params = new URLSearchParams();
        if (pedidoId) params.set('pedido_id', pedidoId);
        if (paymentId) params.set('payment_id', paymentId);
        params.set('evento_id', evento.id);
        params.set('lote_id', lote.id);
        params.set('comprador_id', usuario.id);

        const res = await fetch(`/api/consultar-status-pedido?${params.toString()}`);
        if (!res.ok) return;

        const data = await res.json();
        if (data.status_pedido === 'aprovado') {
          if (timerPollingRef.current) clearInterval(timerPollingRef.current);
          setPixAprovado(true);

          setTimeout(() => {
            router.push(`/meus-ingressos?pedido_id=${pedidoId}&status_pedido=aprovado&payment_id=${paymentId || ''}&evento_id=${evento.id}`);
          }, 1500);
        } else if (data.status_pedido === 'cancelado' || data.status_pedido === 'estoque_esgotado') {
          if (timerPollingRef.current) clearInterval(timerPollingRef.current);
          setErroPix(data.mensagem || 'O pagamento Pix foi cancelado ou expirou.');
        }
      } catch {
        // Ignora erros transitórios
      }
    };

    // Executa verificação inicial e depois a cada 2.5s
    verificar();
    timerPollingRef.current = setInterval(verificar, 2500);
  }, [evento.id, lote.id, usuario.id, router]);

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
      const res = await fetch('/api/payments/card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          payment_method_id,
          installments,
          issuer_id,
          payer,
          evento_id: evento.id,
          lote_id: lote.id,
          quantidade,
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
        setTimeout(() => {
          router.push(`/meus-ingressos?pedido_id=${dados.pedido_id}&status_pedido=aprovado&evento_id=${evento.id}`);
        }, 1800);
      } else {
        router.push(`/meus-ingressos?pedido_id=${dados.pedido_id}&status_pedido=aguardando&payment_id=${dados.payment_id || ''}&evento_id=${evento.id}`);
      }
    } catch {
      setErroCard('Erro de comunicação ao enviar dados do pagamento.');
      setProcessandoCard(false);
    }
  }, [evento.id, lote.id, quantidade, usuario.id, router]);

  // Memoização das props do CardPayment para evitar recriação desnecessária do Brick
  const cardInitialization = useMemo(() => {
    const docLimpo = (usuario.cpf || '').replace(/\D/g, '');
    return {
      amount: Number(totalFinal.toFixed(2)),
      payer: {
        email: (usuario.email && usuario.email.includes('@')) ? usuario.email : 'comprador@meuingrss.com.br',
        identification: (docLimpo.length === 11 || docLimpo.length === 14) ? {
          type: docLimpo.length === 14 ? 'CNPJ' : 'CPF',
          number: docLimpo,
        } : undefined,
      },
    };
  }, [totalFinal, usuario.email, usuario.cpf]);

  const cardCustomization = useMemo(() => ({
    visual: {
      style: {
        theme: 'dark' as const,
        customVariables: {
          formBackgroundColor: 'transparent',
          baseColor: '#7C3AED',
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
    console.error('Erro na inicialização do Payment Brick:', error);
    setBrickCarregando(false);
    setErroCard('Não foi possível carregar os campos do cartão. Verifique sua conexão e tente novamente.');
  }, []);

  return (
    <div className="w-full space-y-4 sm:space-y-6">
      {/* Seletor de Métodos de Pagamento (Responsivo) */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 p-1 sm:p-1.5 rounded-xl sm:rounded-2xl bg-fundo-card/80 border border-borda-sutil backdrop-blur-md">
        <button
          type="button"
          onClick={() => setMetodo('pix')}
          className={`flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 sm:py-3 px-2 sm:px-4 rounded-lg sm:rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 ${
            metodo === 'pix'
              ? 'bg-gradient-to-r from-primaria-600 to-primaria-500 text-white shadow-lg shadow-primaria-500/20'
              : 'text-texto-secundario hover:text-texto-principal hover:bg-white/5'
          }`}
        >
          <QrCode size={16} className="shrink-0 sm:w-[18px] sm:h-[18px]" />
          <span>Pix</span>
        </button>

        <button
          type="button"
          onClick={() => setMetodo('cartao')}
          className={`flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 sm:py-3 px-2 sm:px-4 rounded-lg sm:rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 ${
            metodo === 'cartao'
              ? 'bg-gradient-to-r from-primaria-600 to-primaria-500 text-white shadow-lg shadow-primaria-500/20'
              : 'text-texto-secundario hover:text-texto-principal hover:bg-white/5'
          }`}
        >
          <CreditCard size={16} className="shrink-0 sm:w-[18px] sm:h-[18px]" />
          <span>Cartão de Crédito</span>
        </button>
      </div>

      {/* PAINEL PIX */}
      <div className={metodo === 'pix' ? 'block' : 'hidden'}>
        <div className="p-4 sm:p-6 rounded-2xl bg-fundo-card border border-borda-sutil space-y-4 sm:space-y-6 transition-all">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm sm:text-base font-bold font-titulo text-texto-principal flex items-center gap-2">
              <QrCode className="text-primaria-400 shrink-0" size={18} />
              Pagamento via Pix
            </h4>
          </div>

          {erroPix && (
            <div className="p-3 sm:p-3.5 rounded-xl bg-erro/10 border border-erro/20 text-xs sm:text-sm text-erro flex items-start gap-2.5">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{erroPix}</span>
            </div>
          )}

          {!dadosPix && !gerandoPix && (
            <div className="text-center py-3 sm:py-4 space-y-4">
              <p className="text-xs sm:text-sm text-texto-secundario leading-relaxed">
                Clique no botão abaixo para gerar o código Pix e o QR Code de pagamento para o valor de{' '}
                <strong className="text-texto-principal">{formatarMoeda(totalFinal)}</strong>.
              </p>

              <Botao
                larguraTotal
                tamanho="lg"
                onClick={gerarPagamentoPix}
                icone={<QrCode size={18} />}
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
            <div className="space-y-4 sm:space-y-6 animate-fadeIn">
              {pixAprovado ? (
                <div className="py-6 sm:py-8 flex flex-col items-center justify-center gap-3 text-center bg-sucesso/10 rounded-2xl border border-sucesso/30 p-4 sm:p-6">
                  <CheckCircle2 size={40} className="text-sucesso animate-bounce sm:w-12 sm:h-12" />
                  <h4 className="text-lg sm:text-xl font-bold text-texto-principal">Pagamento Confirmado!</h4>
                  <p className="text-xs text-texto-secundario">
                    Redirecionando você para seus ingressos em instantes...
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
                      <p className="text-xs text-erro">
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
                          <div className="p-2.5 sm:p-3 bg-white rounded-xl sm:rounded-2xl shadow-xl border border-white/20 inline-block">
                            <img
                              src={`data:image/jpeg;base64,${dadosPix.qr_code_base64}`}
                              alt="QR Code Pix"
                              className="w-40 h-40 sm:w-48 sm:h-48 object-contain"
                            />
                          </div>
                          <span className="text-[10px] sm:text-[11px] text-texto-terciario text-center">
                            Abra o app do seu banco e escaneie o código
                          </span>
                        </div>
                      )}

                      <div className="space-y-2">
                        <label className="block text-xs font-medium text-texto-secundario">
                          Ou pague usando o Pix Copia e Cola:
                        </label>
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                          <input
                            type="text"
                            readOnly
                            value={dadosPix.qr_code}
                            className="flex-1 w-full bg-fundo-input border border-borda-sutil rounded-xl px-3 py-2.5 text-xs font-mono text-texto-principal truncate focus:outline-none"
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

                      <div className="p-3 rounded-xl bg-primaria-500/10 border border-primaria-500/20 text-xs text-primaria-300 flex items-start sm:items-center gap-2 leading-relaxed">
                        <ShieldCheck size={16} className="shrink-0 mt-0.5 sm:mt-0" />
                        <span>Aguardando a confirmação do pagamento... <br/>Não feche esta tela.</span>
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
        <div className="p-4 sm:p-6 rounded-2xl bg-fundo-card border border-borda-sutil space-y-4 sm:space-y-6">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm sm:text-base font-bold font-titulo text-texto-principal flex items-center gap-2">
              <CreditCard className="text-primaria-400 shrink-0" size={18} />
              Criptografado via Mercado Pago
            </h4>
          </div>

          {!process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY ? (
            <div className="p-3.5 sm:p-4 rounded-xl bg-erro/10 border border-erro/20 text-xs sm:text-sm text-erro">
              A chave pública do Mercado Pago (`NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY`) não está configurada no ambiente.
            </div>
          ) : (
            <>
              {erroCard && (
                <div className="p-3.5 rounded-xl bg-erro/10 border border-erro/20 text-xs sm:text-sm text-erro flex items-start gap-2.5">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{erroCard}</span>
                </div>
              )}

              {cardAprovado ? (
                <div className="py-6 sm:py-8 flex flex-col items-center justify-center gap-3 text-center bg-sucesso/10 rounded-2xl border border-sucesso/30 p-4 sm:p-6">
                  <CheckCircle2 size={40} className="text-sucesso animate-bounce sm:w-12 sm:h-12" />
                  <h4 className="text-lg sm:text-xl font-bold text-texto-principal">Pagamento Aprovado!</h4>
                  <p className="text-xs text-texto-secundario">
                    Seus ingressos foram emitidos com sucesso. Redirecionando...
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

          <p className="text-[10px] sm:text-[11px] text-texto-terciario text-center leading-relaxed">
            Seus dados financeiros são criptografados com segurança de ponta a ponta pelo Mercado Pago. O Meuingrss não tem acesso às informações do seu cartão.
          </p>
        </div>
      </div>
    </div>
  );
}
