'use client';

import { useState, useEffect, useRef } from 'react';
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
  Lock,
  Calendar,
  User,
  Hash,
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

function detectarBandeira(numero: string): string {
  const num = numero.replace(/\D/g, '');
  if (!num) return 'visa';

  // Elo deve ser testado ANTES de Visa e Mastercard
  if (/^(4011|438935|451416|4576|504175|5067|5090|627780|636297|636368|650|651|655)/.test(num)) return 'elo';
  if (/^3[47]/.test(num)) return 'amex';
  if (/^(606282|3841|60)/.test(num)) return 'hipercard';
  if (/^(5[1-5]|2[2-7])/.test(num)) return 'master';
  if (/^4/.test(num)) return 'visa';
  return 'visa';
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
  const [segundosRestantes, setSegundosRestantes] = useState<number | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [pixAprovado, setPixAprovado] = useState(false);
  const [erroPix, setErroPix] = useState('');

  // Estados Cartão
  const [processandoCard, setProcessandoCard] = useState(false);
  const [erroCard, setErroCard] = useState('');
  const [cardAprovado, setCardAprovado] = useState(false);
  const [usarFormCustomizado, setUsarFormCustomizado] = useState(false);

  // Formulário Customizado de Cartão (SDK.js Tokenization)
  const [numeroCartao, setNumeroCartao] = useState('');
  const [nomeCartao, setNomeCartao] = useState(usuario.nome || '');
  const [validadeCartao, setValidadeCartao] = useState('');
  const [cvvCartao, setCvvCartao] = useState('');
  const [cpfCartao, setCpfCartao] = useState(usuario.cpf || '');
  const [parcelas, setParcelas] = useState('1');

  const timerCountdownRef = useRef<NodeJS.Timeout | null>(null);
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

  // Limpeza de timers ao desmontar componente
  useEffect(() => {
    return () => {
      if (timerCountdownRef.current) clearInterval(timerCountdownRef.current);
      if (timerPollingRef.current) clearInterval(timerPollingRef.current);
    };
  }, []);

  // --- LÓGICA DO FLUXO PIX ---
  async function gerarPagamentoPix() {
    setGerandoPix(true);
    setErroPix('');
    setPixAprovado(false);

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
      iniciarTimerExpiracao(dados.date_of_expiration);
      iniciarPollingStatus(dados.pedido_id);
    } catch {
      setErroPix('Erro de rede ao conectar com o gateway Pix.');
      setGerandoPix(false);
    }
  }

  function iniciarTimerExpiracao(dataExpiracaoIso: string) {
    if (timerCountdownRef.current) clearInterval(timerCountdownRef.current);

    const calcularDiferenca = () => {
      const expiraEm = new Date(dataExpiracaoIso).getTime();
      const agora = Date.now();
      const diffSegundos = Math.max(0, Math.floor((expiraEm - agora) / 1000));
      setSegundosRestantes(diffSegundos);

      if (diffSegundos <= 0) {
        if (timerCountdownRef.current) clearInterval(timerCountdownRef.current);
        if (timerPollingRef.current) clearInterval(timerPollingRef.current);
      }
    };

    calcularDiferenca();
    timerCountdownRef.current = setInterval(calcularDiferenca, 1000);
  }

  function iniciarPollingStatus(pedidoId: string) {
    if (timerPollingRef.current) clearInterval(timerPollingRef.current);

    timerPollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/consultar-status-pedido?pedido_id=${pedidoId}`);
        if (!res.ok) return;

        const data = await res.json();
        if (data.status_pedido === 'aprovado') {
          if (timerPollingRef.current) clearInterval(timerPollingRef.current);
          if (timerCountdownRef.current) clearInterval(timerCountdownRef.current);
          setPixAprovado(true);

          setTimeout(() => {
            router.push(`/meus-ingressos?pedido_id=${pedidoId}&status_pedido=aprovado`);
          }, 1800);
        }
      } catch {
        // Ignora erros transitórios
      }
    }, 4000);
  }

  function copiarCodigoPix() {
    if (!dadosPix?.qr_code) return;
    navigator.clipboard.writeText(dadosPix.qr_code);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 3000);
  }

  function formatarTempo(segundos: number): string {
    const min = Math.floor(segundos / 60);
    const seg = segundos % 60;
    return `${String(min).padStart(2, '0')}:${String(seg).padStart(2, '0')}`;
  }

  // --- LÓGICA DO FLUXO CARTÃO (BRICK) ---
  async function processarSubmissaoCard(param: any) {

    setProcessandoCard(true);
    setErroCard('');

    const nestedData = (param?.formData || param) as Record<string, any>;
    const token = param?.token || nestedData?.token;
    const payment_method_id = param?.payment_method_id || param?.paymentMethodId || nestedData?.payment_method_id || nestedData?.paymentMethodId || 'visa';
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
          router.push(`/meus-ingressos?pedido_id=${dados.pedido_id}&status_pedido=aprovado`);
        }, 1800);
      } else {
        router.push(`/meus-ingressos?pedido_id=${dados.pedido_id}&status_pedido=aguardando`);
      }
    } catch {
      setErroCard('Erro de comunicação ao enviar dados do pagamento.');
      setProcessandoCard(false);
    }
  }

  // --- LÓGICA DO FLUXO CARTÃO (CUSTOM FORM VIA MERCADOPAGO.JS TOKENIZATION) ---
  async function submeterCartaoCustomizado(e: React.FormEvent) {
    e.preventDefault();
    setProcessandoCard(true);
    setErroCard('');

    const pk = process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY;
    // @ts-ignore
    if (!pk || typeof window === 'undefined' || !window.MercadoPago) {
      setErroCard('Mercado Pago SDK não inicializado no navegador. Verifique sua chave pública no .env.local.');
      setProcessandoCard(false);
      return;
    }

    try {
      // @ts-ignore
      const mp = new window.MercadoPago(pk, { locale: 'pt-BR' });
      const numLimpo = numeroCartao.replace(/\D/g, '');
      const [mesStr, anoStr] = validadeCartao.split('/');
      const mes = (mesStr || '').trim();
      let ano = (anoStr || '').trim();
      if (ano.length === 2) ano = `20${ano}`;
      const cvv = cvvCartao.replace(/\D/g, '');
      const cpfLimpo = cpfCartao.replace(/\D/g, '');

      if (numLimpo.length < 13 || !nomeCartao || !mes || !ano || cvv.length < 3 || cpfLimpo.length !== 11) {
        setErroCard('Por favor, preencha todos os campos do cartão e CPF corretamente.');
        setProcessandoCard(false);
        return;
      }

      const tokenRes = await mp.createCardToken({
        cardNumber: numLimpo,
        cardholderName: nomeCartao,
        cardExpirationMonth: mes,
        cardExpirationYear: ano,
        securityCode: cvv,
        identificationType: 'CPF',
        identificationNumber: cpfLimpo,
      });

      if (!tokenRes || !tokenRes.id) {
        setErroCard('Não foi possível gerar o token do cartão. Verifique os dados digitados.');
        setProcessandoCard(false);
        return;
      }

      let bandeira = detectarBandeira(numLimpo);
      try {
        const pmRes = await mp.getPaymentMethods({ bin: numLimpo.substring(0, 6) });
        if (pmRes && pmRes.results && pmRes.results.length > 0 && pmRes.results[0].id) {
          bandeira = pmRes.results[0].id;
        }
      } catch {
        // Usa o fallback da regex local
      }


      const res = await fetch('/api/payments/card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: tokenRes.id,
          payment_method_id: bandeira,
          installments: parseInt(parcelas, 10),
          payer: {
            email: (usuario.email && usuario.email.includes('@')) ? usuario.email : 'comprador@meuingrss.com.br',
            first_name: nomeCartao.split(' ')[0],
            last_name: nomeCartao.split(' ').slice(1).join(' ') || 'Cliente',
            identification: { type: 'CPF', number: cpfLimpo },
          },
          evento_id: evento.id,
          lote_id: lote.id,
          quantidade,
          comprador_id: usuario.id,
        }),
      });

      const dados = await res.json();

      if (!res.ok || !dados.sucesso) {
        setErroCard(dados.erro || 'Cartão recusado ou inválido.');
        setProcessandoCard(false);
        return;
      }

      if (dados.status === 'approved') {
        setCardAprovado(true);
        setTimeout(() => {
          router.push(`/meus-ingressos?pedido_id=${dados.pedido_id}&status_pedido=aprovado`);
        }, 1800);
      } else {
        router.push(`/meus-ingressos?pedido_id=${dados.pedido_id}&status_pedido=aguardando`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao tokenizar cartão';
      setErroCard(msg);
      setProcessandoCard(false);
    }
  }

  // Formatadores de Input
  function handleNumeroCartaoChange(val: string) {
    const limpo = val.replace(/\D/g, '').slice(0, 16);
    const formatado = limpo.replace(/(\d{4})(?=\d)/g, '$1 ');
    setNumeroCartao(formatado);
  }

  function handleValidadeChange(val: string) {
    const limpo = val.replace(/\D/g, '').slice(0, 4);
    if (limpo.length >= 3) {
      setValidadeCartao(`${limpo.slice(0, 2)}/${limpo.slice(2)}`);
    } else {
      setValidadeCartao(limpo);
    }
  }

  function handleCpfChange(val: string) {
    const limpo = val.replace(/\D/g, '').slice(0, 11);
    const formatado = limpo
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    setCpfCartao(formatado);
  }

  return (
    <div className="w-full space-y-6">
      {/* Seletor de Métodos de Pagamento */}
      <div className="grid grid-cols-2 gap-3 p-1.5 rounded-2xl bg-fundo-card/80 border border-borda-sutil backdrop-blur-md">
        <button
          type="button"
          onClick={() => setMetodo('pix')}
          className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold transition-all duration-200 ${
            metodo === 'pix'
              ? 'bg-gradient-to-r from-primaria-600 to-primaria-500 text-white shadow-lg shadow-primaria-500/20'
              : 'text-texto-secundario hover:text-texto-principal hover:bg-white/5'
          }`}
        >
          <QrCode size={18} />
          Pix (Instantâneo)
        </button>

        <button
          type="button"
          onClick={() => setMetodo('cartao')}
          className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold transition-all duration-200 ${
            metodo === 'cartao'
              ? 'bg-gradient-to-r from-primaria-600 to-primaria-500 text-white shadow-lg shadow-primaria-500/20'
              : 'text-texto-secundario hover:text-texto-principal hover:bg-white/5'
          }`}
        >
          <CreditCard size={18} />
          Cartão de Crédito
        </button>
      </div>

      {/* PAINEL PIX */}
      {metodo === 'pix' && (
        <div className="p-6 rounded-2xl bg-fundo-card border border-borda-sutil space-y-6 transition-all">
          <div className="flex items-center justify-between">
            <h4 className="text-base font-bold font-titulo text-texto-principal flex items-center gap-2">
              <QrCode className="text-primaria-400" size={20} />
              Pagamento via Pix
            </h4>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-sucesso/15 text-sucesso border border-sucesso/20">
              Aprovação Imediata
            </span>
          </div>

          {erroPix && (
            <div className="p-3.5 rounded-xl bg-erro/10 border border-erro/20 text-sm text-erro flex items-start gap-2.5">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <span>{erroPix}</span>
            </div>
          )}

          {!dadosPix && !gerandoPix && (
            <div className="text-center py-4 space-y-4">
              <p className="text-xs sm:text-sm text-texto-secundario leading-relaxed">
                Clique no botão abaixo para gerar o código Pix e o QR Code de pagamento para valor de{' '}
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
            <div className="py-8 flex flex-col items-center justify-center gap-3 text-center">
              <Carregando tamanho="lg" texto="Gerando chave Pix com Mercado Pago..." />
            </div>
          )}

          {dadosPix && (
            <div className="space-y-6 animate-fadeIn">
              {pixAprovado ? (
                <div className="py-8 flex flex-col items-center justify-center gap-3 text-center bg-sucesso/10 rounded-2xl border border-sucesso/30 p-6">
                  <CheckCircle2 size={48} className="text-sucesso animate-bounce" />
                  <h4 className="text-xl font-bold text-texto-principal">Pagamento Confirmado!</h4>
                  <p className="text-xs text-texto-secundario">
                    Redirecionando você para seus ingressos em instantes...
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-fundo-input border border-borda-sutil">
                    <div className="flex items-center gap-2 text-xs text-texto-secundario">
                      <Clock size={16} className="text-secundaria-400" />
                      Expira em:
                    </div>
                    {segundosRestantes !== null && segundosRestantes > 0 ? (
                      <span className="font-mono text-sm font-bold text-secundaria-400">
                        {formatarTempo(segundosRestantes)}
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-erro flex items-center gap-1">
                        QR Code Expirado
                      </span>
                    )}
                  </div>

                  {segundosRestantes !== null && segundosRestantes <= 0 ? (
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
                          <div className="p-3 bg-white rounded-2xl shadow-xl border border-white/20">
                            <img
                              src={`data:image/jpeg;base64,${dadosPix.qr_code_base64}`}
                              alt="QR Code Pix"
                              className="w-48 h-48 object-contain"
                            />
                          </div>
                          <span className="text-[11px] text-texto-terciario">
                            Abra o app do seu banco e escaneie o código
                          </span>
                        </div>
                      )}

                      <div className="space-y-2">
                        <label className="block text-xs font-medium text-texto-secundario">
                          Ou pague usando o Pix Copia e Cola:
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            readOnly
                            value={dadosPix.qr_code}
                            className="flex-1 bg-fundo-input border border-borda-sutil rounded-xl px-3 py-2 text-xs font-mono text-texto-principal truncate focus:outline-none"
                          />
                          <Botao
                            variante={copiado ? 'sucesso' : 'primario'}
                            tamanho="sm"
                            onClick={copiarCodigoPix}
                            icone={copiado ? <Check size={14} /> : <Copy size={14} />}
                          >
                            {copiado ? 'Copiado!' : 'Copiar'}
                          </Botao>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-primaria-500/10 border border-primaria-500/20 text-xs text-primaria-300 flex items-center gap-2">
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
      )}

      {/* PAINEL CARTÃO DE CRÉDITO */}
      {metodo === 'cartao' && (
        <div className="p-6 rounded-2xl bg-fundo-card border border-borda-sutil space-y-6">
          <div className="flex items-center justify-between">
            <h4 className="text-base font-bold font-titulo text-texto-principal flex items-center gap-2">
              <CreditCard className="text-primaria-400" size={20} />
              Dados do Cartão de Crédito
            </h4>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primaria-500/15 text-primaria-400 border border-primaria-500/20">
              Criptografado via Mercado Pago
            </span>
          </div>

          {!process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY ? (
            <div className="p-4 rounded-xl bg-erro/10 border border-erro/20 text-sm text-erro">
              A chave pública do Mercado Pago (`NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY`) não está configurada no ambiente.
            </div>
          ) : (
            <>
              {erroCard && (
                <div className="p-3.5 rounded-xl bg-erro/10 border border-erro/20 text-sm text-erro flex items-start gap-2.5">
                  <AlertCircle size={18} className="shrink-0 mt-0.5" />
                  <span>{erroCard}</span>
                </div>
              )}

              {cardAprovado ? (
                <div className="py-8 flex flex-col items-center justify-center gap-3 text-center bg-sucesso/10 rounded-2xl border border-sucesso/30 p-6">
                  <CheckCircle2 size={48} className="text-sucesso animate-bounce" />
                  <h4 className="text-xl font-bold text-texto-principal">Pagamento Aprovado!</h4>
                  <p className="text-xs text-texto-secundario">
                    Seus ingressos foram emitidos com sucesso. Redirecionando...
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Seletor de Modo (Brick vs Form Customizado Seguro) */}
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => setUsarFormCustomizado(!usarFormCustomizado)}
                      className="text-xs text-primaria-400 hover:underline font-medium"
                    >
                      {usarFormCustomizado ? 'Usar formulário padrão (Brick)' : 'Usar formulário direto'}
                    </button>
                  </div>

                  {!usarFormCustomizado ? (
                    <div className="mercado-pago-card-container min-h-[340px]">
                      {processandoCard && (
                        <div className="py-6 flex flex-col items-center justify-center gap-2">
                          <Carregando tamanho="md" texto="Processando autorização do cartão..." />
                        </div>
                      )}

                      <CardPayment
                        key="mp-card-payment-brick"
                        initialization={{
                          amount: Number(totalFinal.toFixed(2)),
                          payer: {
                            email: (usuario.email && usuario.email.includes('@')) ? usuario.email : 'comprador@meuingrss.com.br',
                          },
                        }}
                        customization={{
                          visual: {
                            style: {
                              theme: 'dark',
                            },
                          },
                        }}
                        onSubmit={async (param) => {
                          await processarSubmissaoCard(param);
                        }}
                        onError={(error) => {
                          console.warn('Brick CardPayment teve erro de inicialização, alternando para formulário direto:', error);
                          setUsarFormCustomizado(true);
                        }}
                      />
                    </div>
                  ) : (
                    /* FORMULÁRIO CUSTOMIZADO 100% PCI COMPLIANT (CLIENT TOKENIZATION VIA SDK.JS) */
                    <form onSubmit={submeterCartaoCustomizado} className="space-y-4 animate-fadeIn">
                      <div>
                        <label className="block text-xs font-medium text-texto-secundario mb-1">
                          Número do Cartão
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            required
                            placeholder="0000 0000 0000 0000"
                            value={numeroCartao}
                            onChange={(e) => handleNumeroCartaoChange(e.target.value)}
                            className="w-full bg-fundo-input border border-borda-sutil rounded-xl px-3.5 py-2.5 text-sm text-texto-principal placeholder:text-texto-terciario focus:outline-none focus:border-primaria-500 transition-colors pl-10"
                          />
                          <CreditCard size={18} className="absolute left-3 top-3 text-texto-terciario" />
                          <span className="absolute right-3 top-2.5 text-xs font-bold text-primaria-400 uppercase">
                            {numeroCartao.length >= 4 ? detectarBandeira(numeroCartao) : ''}
                          </span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-texto-secundario mb-1">
                          Nome impresso no Cartão
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            required
                            placeholder="NOME COMO ESTÁ NO CARTÃO"
                            value={nomeCartao}
                            onChange={(e) => setNomeCartao(e.target.value.toUpperCase())}
                            className="w-full bg-fundo-input border border-borda-sutil rounded-xl px-3.5 py-2.5 text-sm text-texto-principal placeholder:text-texto-terciario focus:outline-none focus:border-primaria-500 transition-colors pl-10 uppercase"
                          />
                          <User size={18} className="absolute left-3 top-3 text-texto-terciario" />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-texto-secundario mb-1">
                            Validade (MM/AA)
                          </label>
                          <div className="relative">
                            <input
                              type="text"
                              required
                              placeholder="MM/AA"
                              value={validadeCartao}
                              onChange={(e) => handleValidadeChange(e.target.value)}
                              className="w-full bg-fundo-input border border-borda-sutil rounded-xl px-3.5 py-2.5 text-sm text-texto-principal placeholder:text-texto-terciario focus:outline-none focus:border-primaria-500 transition-colors pl-10"
                            />
                            <Calendar size={18} className="absolute left-3 top-3 text-texto-terciario" />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-texto-secundario mb-1">
                            CVV
                          </label>
                          <div className="relative">
                            <input
                              type="text"
                              required
                              placeholder="123"
                              maxLength={4}
                              value={cvvCartao}
                              onChange={(e) => setCvvCartao(e.target.value.replace(/\D/g, ''))}
                              className="w-full bg-fundo-input border border-borda-sutil rounded-xl px-3.5 py-2.5 text-sm text-texto-principal placeholder:text-texto-terciario focus:outline-none focus:border-primaria-500 transition-colors pl-10 font-mono"
                            />
                            <Lock size={18} className="absolute left-3 top-3 text-texto-terciario" />
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-texto-secundario mb-1">
                            CPF do Titular
                          </label>
                          <div className="relative">
                            <input
                              type="text"
                              required
                              placeholder="000.000.000-00"
                              value={cpfCartao}
                              onChange={(e) => handleCpfChange(e.target.value)}
                              className="w-full bg-fundo-input border border-borda-sutil rounded-xl px-3.5 py-2.5 text-sm text-texto-principal placeholder:text-texto-terciario focus:outline-none focus:border-primaria-500 transition-colors pl-10"
                            />
                            <Hash size={18} className="absolute left-3 top-3 text-texto-terciario" />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-texto-secundario mb-1">
                            Parcelas
                          </label>
                          <select
                            value={parcelas}
                            onChange={(e) => setParcelas(e.target.value)}
                            className="w-full bg-fundo-input border border-borda-sutil rounded-xl px-3 py-2.5 text-sm text-texto-principal focus:outline-none focus:border-primaria-500 transition-colors"
                          >
                            <option value="1">1x de {formatarMoeda(totalFinal)} (À vista)</option>
                            {[2, 3, 4, 5, 6, 12].map((p) => (
                              <option key={p} value={p}>
                                {p}x de {formatarMoeda(totalFinal / p)}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <Botao
                        larguraTotal
                        tamanho="lg"
                        carregando={processandoCard}
                        disabled={processandoCard}
                        icone={<CreditCard size={18} />}
                      >
                        Pagar {formatarMoeda(totalFinal)}
                      </Botao>
                    </form>
                  )}
                </div>
              )}
            </>
          )}

          <p className="text-[11px] text-texto-terciario text-center leading-relaxed">
            Seus dados financeiros são tokenizados no navegador pelo Mercado Pago. O meuingrss não tem acesso às informações do seu cartão.
          </p>
        </div>
      )}
    </div>
  );
}
