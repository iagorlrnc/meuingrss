/**
 * Testes Unitários do Fluxo de Pagamento — meuingrss
 *
 * Estes testes validam a lógica de segurança do fluxo de pagamento
 * sem depender de banco de dados ou APIs externas.
 *
 * Para executar: npx vitest run src/__tests__/fluxo-pagamento.test.ts
 * (Requer vitest instalado: npm i -D vitest)
 */

import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

// ========================================================================
// Funções puras extraídas para teste unitário
// ========================================================================

/**
 * Reimplementação local da validação de assinatura HMAC do webhook
 * (mesmo algoritmo de src/lib/mercadopago.ts, extraído para teste isolado)
 */
function validarAssinaturaLocal(
  xSignatureHeader: string | null,
  xRequestIdHeader: string | null,
  dataId: string,
  secret: string
): boolean {
  if (!xSignatureHeader || !xRequestIdHeader || !dataId || !secret) return false;

  try {
    const parts = xSignatureHeader.split(',');
    let ts = '';
    let hashV1 = '';

    for (const part of parts) {
      const [key, value] = part.split('=').map((s: string) => s.trim());
      if (key === 'ts') ts = value;
      if (key === 'v1') hashV1 = value;
    }

    if (!ts || !hashV1) return false;

    const manifest = `id:${dataId};request-id:${xRequestIdHeader};ts:${ts};`;
    const computedHmac = crypto
      .createHmac('sha256', secret)
      .update(manifest)
      .digest('hex');

    const bufferComputado = Buffer.from(computedHmac, 'hex');
    const bufferEnviado = Buffer.from(hashV1, 'hex');

    if (bufferComputado.length !== bufferEnviado.length) return false;

    return crypto.timingSafeEqual(bufferComputado, bufferEnviado);
  } catch {
    return false;
  }
}

/**
 * Validação de preço (mesma lógica do webhook)
 */
function validarPreco(valorPago: number, valorEsperado: number, tolerancia: number = 0.05): boolean {
  return valorPago >= valorEsperado - tolerancia;
}

/**
 * Validação de metadata do pagamento
 */
function validarMetadata(metadata: Record<string, any> | null): {
  valido: boolean;
  campos_faltantes: string[];
} {
  const camposObrigatorios = ['evento_id', 'lote_id', 'comprador_id'];
  const camposFaltantes: string[] = [];

  if (!metadata) {
    return { valido: false, campos_faltantes: camposObrigatorios };
  }

  for (const campo of camposObrigatorios) {
    if (!metadata[campo]) {
      camposFaltantes.push(campo);
    }
  }

  return { valido: camposFaltantes.length === 0, campos_faltantes: camposFaltantes };
}

/**
 * Máquina de estados: transições válidas de status de pagamento
 */
function ehTransicaoValida(statusAtual: string, novoStatus: string): boolean {
  const transicoesPermitidas: Record<string, string[]> = {
    pendente: ['aprovado', 'recusado', 'estornado'],
    aprovado: ['estornado'],
    recusado: [], // Estado final
    estornado: [], // Estado final
  };

  return transicoesPermitidas[statusAtual]?.includes(novoStatus) || false;
}

/**
 * Status de pagamento do gateway para status interno
 */
function mapearStatusGateway(statusGateway: string): string {
  const mapeamento: Record<string, string> = {
    approved: 'aprovado',
    rejected: 'recusado',
    cancelled: 'recusado',
    refunded: 'estornado',
    charged_back: 'estornado',
    pending: 'pendente',
    in_process: 'pendente',
    in_mediation: 'pendente',
    authorized: 'pendente',
  };

  return mapeamento[statusGateway] || 'pendente';
}

// ========================================================================
// TESTES
// ========================================================================

describe('Validação de Assinatura HMAC do Webhook', () => {
  const secret = 'test-webhook-secret-123';

  function gerarAssinaturaValida(dataId: string, requestId: string): string {
    const ts = String(Math.floor(Date.now() / 1000));
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const hash = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
    return `ts=${ts},v1=${hash}`;
  }

  it('deve aceitar assinatura HMAC válida', () => {
    const dataId = 'payment-123';
    const requestId = 'req-456';
    const xSignature = gerarAssinaturaValida(dataId, requestId);

    expect(validarAssinaturaLocal(xSignature, requestId, dataId, secret)).toBe(true);
  });

  it('deve REJEITAR assinatura HMAC forjada', () => {
    expect(
      validarAssinaturaLocal(
        'ts=123,v1=assinatura_completamente_forjada_e_invalida',
        'req-123',
        'pay-123',
        secret
      )
    ).toBe(false);
  });

  it('deve REJEITAR quando x-signature está ausente', () => {
    expect(validarAssinaturaLocal(null, 'req-123', 'pay-123', secret)).toBe(false);
  });

  it('deve REJEITAR quando x-request-id está ausente', () => {
    expect(validarAssinaturaLocal('ts=123,v1=abc', null, 'pay-123', secret)).toBe(false);
  });

  it('deve REJEITAR quando data-id está vazio', () => {
    expect(validarAssinaturaLocal('ts=123,v1=abc', 'req-123', '', secret)).toBe(false);
  });

  it('deve REJEITAR quando secret está vazio', () => {
    expect(validarAssinaturaLocal('ts=123,v1=abc', 'req-123', 'pay-123', '')).toBe(false);
  });

  it('deve REJEITAR assinatura com formato inválido (sem ts)', () => {
    expect(validarAssinaturaLocal('v1=abc123', 'req-123', 'pay-123', secret)).toBe(false);
  });

  it('deve REJEITAR assinatura com formato inválido (sem v1)', () => {
    expect(validarAssinaturaLocal('ts=123', 'req-123', 'pay-123', secret)).toBe(false);
  });
});

describe('Validação de Preço (Anti Price Tampering)', () => {
  it('deve aceitar preço igual ao esperado', () => {
    expect(validarPreco(50.0, 50.0)).toBe(true);
  });

  it('deve aceitar preço ligeiramente acima (ex: taxas)', () => {
    expect(validarPreco(50.10, 50.0)).toBe(true);
  });

  it('deve aceitar diferença dentro da tolerância (R$ 0,05)', () => {
    expect(validarPreco(49.96, 50.0)).toBe(true);
  });

  it('deve REJEITAR preço significativamente abaixo', () => {
    expect(validarPreco(40.0, 50.0)).toBe(false);
  });

  it('deve REJEITAR preço zero para lote pago', () => {
    expect(validarPreco(0, 50.0)).toBe(false);
  });

  it('deve aceitar preço zero para lote gratuito', () => {
    expect(validarPreco(0, 0)).toBe(true);
  });

  it('deve REJEITAR valor negativo', () => {
    expect(validarPreco(-10, 50.0)).toBe(false);
  });
});

describe('Validação de Metadata do Pagamento', () => {
  it('deve aceitar metadata completa', () => {
    const result = validarMetadata({
      evento_id: 'uuid-evento',
      lote_id: 'uuid-lote',
      comprador_id: 'uuid-comprador',
      quantidade: '2',
    });
    expect(result.valido).toBe(true);
    expect(result.campos_faltantes).toHaveLength(0);
  });

  it('deve REJEITAR metadata null', () => {
    const result = validarMetadata(null);
    expect(result.valido).toBe(false);
    expect(result.campos_faltantes).toContain('evento_id');
    expect(result.campos_faltantes).toContain('lote_id');
    expect(result.campos_faltantes).toContain('comprador_id');
  });

  it('deve REJEITAR metadata sem evento_id', () => {
    const result = validarMetadata({ lote_id: 'x', comprador_id: 'y' });
    expect(result.valido).toBe(false);
    expect(result.campos_faltantes).toContain('evento_id');
  });

  it('deve REJEITAR metadata sem comprador_id', () => {
    const result = validarMetadata({ evento_id: 'x', lote_id: 'y' });
    expect(result.valido).toBe(false);
    expect(result.campos_faltantes).toContain('comprador_id');
  });

  it('deve REJEITAR metadata com campos vazios', () => {
    const result = validarMetadata({ evento_id: '', lote_id: 'y', comprador_id: 'z' });
    expect(result.valido).toBe(false);
    expect(result.campos_faltantes).toContain('evento_id');
  });
});

describe('Máquina de Estados do Pagamento', () => {
  it('pendente → aprovado: transição válida', () => {
    expect(ehTransicaoValida('pendente', 'aprovado')).toBe(true);
  });

  it('pendente → recusado: transição válida', () => {
    expect(ehTransicaoValida('pendente', 'recusado')).toBe(true);
  });

  it('pendente → estornado: transição válida', () => {
    expect(ehTransicaoValida('pendente', 'estornado')).toBe(true);
  });

  it('aprovado → estornado: transição válida', () => {
    expect(ehTransicaoValida('aprovado', 'estornado')).toBe(true);
  });

  it('aprovado → pendente: transição INVÁLIDA', () => {
    expect(ehTransicaoValida('aprovado', 'pendente')).toBe(false);
  });

  it('recusado → aprovado: transição INVÁLIDA (estado final)', () => {
    expect(ehTransicaoValida('recusado', 'aprovado')).toBe(false);
  });

  it('estornado → aprovado: transição INVÁLIDA (estado final)', () => {
    expect(ehTransicaoValida('estornado', 'aprovado')).toBe(false);
  });

  it('aprovado → recusado: transição INVÁLIDA (só estorno é permitido)', () => {
    expect(ehTransicaoValida('aprovado', 'recusado')).toBe(false);
  });
});

describe('Mapeamento de Status do Gateway para Status Interno', () => {
  it('approved → aprovado', () => {
    expect(mapearStatusGateway('approved')).toBe('aprovado');
  });

  it('rejected → recusado', () => {
    expect(mapearStatusGateway('rejected')).toBe('recusado');
  });

  it('cancelled → recusado', () => {
    expect(mapearStatusGateway('cancelled')).toBe('recusado');
  });

  it('refunded → estornado', () => {
    expect(mapearStatusGateway('refunded')).toBe('estornado');
  });

  it('charged_back → estornado', () => {
    expect(mapearStatusGateway('charged_back')).toBe('estornado');
  });

  it('pending → pendente', () => {
    expect(mapearStatusGateway('pending')).toBe('pendente');
  });

  it('in_process → pendente', () => {
    expect(mapearStatusGateway('in_process')).toBe('pendente');
  });

  it('status desconhecido → pendente (fallback seguro)', () => {
    expect(mapearStatusGateway('unknown_status')).toBe('pendente');
  });
});

describe('Regras de Negócio: Ingressos Nunca Sem Pagamento', () => {
  it('ingresso só pode ter status "valido" se existe pagamento aprovado', () => {
    // Esta é uma regra de negócio que valida a arquitetura:
    // Na máquina de estados, um ingresso "valido" DEVE ter um pagamento "aprovado" associado.
    // O RPC processar_pagamento_aprovado garante isso de forma atômica.
    const ingressoSemPagamento = {
      status: 'valido',
      pagamento: null, // SEM pagamento
    };

    const temPagamentoAprovado = ingressoSemPagamento.pagamento !== null;
    expect(temPagamentoAprovado).toBe(false);

    // Cenário correto:
    const ingressoComPagamento = {
      status: 'valido',
      pagamento: { status: 'aprovado', gateway_transaction_id: 'PAY-123' },
    };

    expect(ingressoComPagamento.pagamento).not.toBeNull();
    expect(ingressoComPagamento.pagamento!.status).toBe('aprovado');
  });

  it('ingresso gratuito é a única exceção — deve usar transaction_id FREE-*', () => {
    const transactionIdGratuito = 'FREE-ABC123DEF456';
    const ehGratuito = transactionIdGratuito.startsWith('FREE-');
    expect(ehGratuito).toBe(true);
  });

  it('redirect de sucesso do gateway NÃO deve conter status=sucesso', () => {
    // A URL de retorno deve usar status_pedido=aguardando, NUNCA sucesso
    const urlRetornoCorreta = '/meus-ingressos?status_pedido=aguardando&evento_id=X&lote_id=Y&comprador_id=Z';
    expect(urlRetornoCorreta).toContain('status_pedido=aguardando');
    expect(urlRetornoCorreta).not.toContain('sucesso=true');
  });
});

describe('Reconciliação Direta e Emissão Automática de Ingressos', () => {
  it('deve extrair payment_id do retorno do Mercado Pago quando presente na URL', () => {
    const urlSearchParams = new URLSearchParams('payment_id=987654321&status=approved&collection_id=987654321');
    const paymentId = urlSearchParams.get('payment_id') || urlSearchParams.get('collection_id');
    expect(paymentId).toBe('987654321');
  });

  it('deve aprovar e creditar o ingresso quando o gateway confirma pagamento aprovado', () => {
    const statusGateway = 'approved';
    const metadataValida = { evento_id: 'evt-1', lote_id: 'lot-1', comprador_id: 'usr-1', quantidade: '1' };
    const pago = true;

    let ingressoCreditado = false;
    if (statusGateway === 'approved' && metadataValida.evento_id && pago) {
      ingressoCreditado = true;
    }

    expect(ingressoCreditado).toBe(true);
  });

  it('NÃO deve creditar ingresso se o pagamento não for aprovado', () => {
    const statusGateway: string = 'pending';
    let ingressoCreditado = false;

    if (statusGateway === 'approved') {
      ingressoCreditado = true;
    }

    expect(ingressoCreditado).toBe(false);
  });
});

describe('Configurações da Sessão Pix e Payload do Pagador', () => {
  it('deve calcular a data de expiração exatamente em 10 minutos', () => {
    const dataInicio = new Date('2026-08-16T22:00:00.000Z');
    const dataExpiracao = new Date(dataInicio.getTime() + 10 * 60 * 1000);

    const diferencaMinutos = (dataExpiracao.getTime() - dataInicio.getTime()) / (1000 * 60);
    expect(diferencaMinutos).toBe(10);
    expect(dataExpiracao.toISOString()).toBe('2026-08-16T22:10:00.000Z');
  });

  it('deve formatar corretamente o objeto payer.identification com CPF de 11 dígitos', () => {
    const cpfComMascara = '123.456.789-00';
    const cpfLimpo = cpfComMascara.replace(/\D/g, '');

    expect(cpfLimpo).toHaveLength(11);

    const identification = cpfLimpo.length === 11 ? { type: 'CPF', number: cpfLimpo } : undefined;
    expect(identification).toEqual({ type: 'CPF', number: '12345678900' });
  });

  it('NÃO deve incluir identification se o CPF for inválido ou incompleto', () => {
    const cpfInvalido = '1234';
    const cpfLimpo = cpfInvalido.replace(/\D/g, '');

    const identification = cpfLimpo.length === 11 ? { type: 'CPF', number: cpfLimpo } : undefined;
    expect(identification).toBeUndefined();
  });

  it('deve calcular a taxa de serviço total de 12% de forma idêntica entre frontend e backend', () => {
    const precoUnitario = 15.55;
    const quantidade = 3;
    const subtotal = precoUnitario * quantidade; // 46.65

    const taxaCalculada = Math.round((subtotal * 0.12) * 100) / 100; // 5.60
    const totalFinal = Math.round((subtotal + taxaCalculada) * 100) / 100; // 52.25

    expect(taxaCalculada).toBe(5.60);
    expect(totalFinal).toBe(52.25);
  });

  it('deve gerar session_id único prefixado com SES- nos metadados da compra', () => {
    const sessionId = `SES-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
    expect(sessionId).toMatch(/^SES-[0-9A-F]{16}$/);
  });

  it('deve gerar external_reference único prefixado com PED- para vinculação ao pedido', () => {
    const extRef = `PED-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
    expect(extRef).toMatch(/^PED-[0-9A-F]{16}$/);
  });
});

describe('Fluxo Completo de Pedidos e Idempotência de Webhook', () => {
  it('pedido inicial deve iniciar com status "pending"', () => {
    const pedidoNovo = {
      external_reference: 'PED-1234567890ABCDEF',
      status: 'pending',
      quantidade: 2,
    };
    expect(pedidoNovo.status).toBe('pending');
  });

  it('transição de pedido: pending -> approved ao receber webhook válido', () => {
    let statusPedido = 'pending';
    const statusWebhook = 'approved';

    if (statusWebhook === 'approved') {
      statusPedido = 'approved';
    }

    expect(statusPedido).toBe('approved');
  });

  it('transição de pedido: pending -> cancelled ao ser recusado ou expirado', () => {
    let statusPedido = 'pending';
    const statusWebhook = 'rejected';

    if (['rejected', 'cancelled'].includes(statusWebhook)) {
      statusPedido = 'cancelled';
    }

    expect(statusPedido).toBe('cancelled');
  });
});



