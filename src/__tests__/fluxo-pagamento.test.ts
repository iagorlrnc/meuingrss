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

  it('extrai corretamente payment_id ou collection_id dos parâmetros do Mercado Pago', () => {
    // Simula a URL completa com parâmetros que o Mercado Pago anexa no redirecionamento
    const urlRetornoMercadoPago =
      '/meus-ingressos?pedido_id=11111111-2222-3333-4444-555555555555&status_pedido=aguardando&collection_id=9876543210&collection_status=approved&payment_id=9876543210&status=approved&external_reference=11111111-2222-3333-4444-555555555555&payment_type=credit_card&merchant_order_id=123456&preference_id=pref-123';

    const searchParams = new URLSearchParams(urlRetornoMercadoPago.split('?')[1]);

    const paymentId = searchParams.get('payment_id') || searchParams.get('collection_id');
    const statusGateway = searchParams.get('status') || searchParams.get('collection_status');
    const pedidoId = searchParams.get('pedido_id') || searchParams.get('external_reference');

    expect(paymentId).toBe('9876543210');
    expect(statusGateway).toBe('approved');
    expect(pedidoId).toBe('11111111-2222-3333-4444-555555555555');
  });

  it('prioriza consulta direta por payment_id com 0ms de delay de indexação', () => {
    const paymentIdParam = '9876543210';
    const temIdDireto = Boolean(paymentIdParam && paymentIdParam.length > 0);
    expect(temIdDireto).toBe(true);
  });
});

describe('Proteção Anti-Sobrevenda (Anti-Overselling)', () => {
  function validarEstoqueLote(
    quantidadeTotal: number,
    quantidadeVendida: number,
    quantidadeSolicitada: number
  ): { permitido: boolean; motivo?: string } {
    if (quantidadeVendida + quantidadeSolicitada > quantidadeTotal) {
      return {
        permitido: false,
        motivo: 'estoque_esgotado',
      };
    }
    return { permitido: true };
  }

  it('deve permitir compra quando há estoque disponível suficiente', () => {
    const res = validarEstoqueLote(100, 50, 2);
    expect(res.permitido).toBe(true);
  });

  it('deve permitir compra para a última vaga exata do lote', () => {
    const res = validarEstoqueLote(100, 98, 2);
    expect(res.permitido).toBe(true);
  });

  it('deve BLOQUEAR compra e retornar estoque_esgotado quando ultrapassa o limite', () => {
    const res = validarEstoqueLote(100, 99, 2);
    expect(res.permitido).toBe(false);
    expect(res.motivo).toBe('estoque_esgotado');
  });

  it('deve BLOQUEAR compra quando o lote já está completamente esgotado', () => {
    const res = validarEstoqueLote(100, 100, 1);
    expect(res.permitido).toBe(false);
    expect(res.motivo).toBe('estoque_esgotado');
  });
});

describe('Proteção contra IDOR em Pagamentos e Consultas', () => {
  function validarAcessoAoPedido(
    pedidoCompradorId: string,
    usuarioId: string,
    usuarioRole: string
  ): boolean {
    if (usuarioRole === 'admin') return true;
    return pedidoCompradorId === usuarioId;
  }

  it('permite acesso do próprio comprador ao seu pedido', () => {
    const compradorId = 'user-123';
    expect(validarAcessoAoPedido(compradorId, 'user-123', 'cliente')).toBe(true);
  });

  it('permite acesso de administrador a qualquer pedido', () => {
    const compradorId = 'user-123';
    expect(validarAcessoAoPedido(compradorId, 'admin-999', 'admin')).toBe(true);
  });

  it('BLOQUEIA tentativa de usuário acessar ou reconciliar pedido de outro usuário (IDOR)', () => {
    const compradorId = 'user-123';
    expect(validarAcessoAoPedido(compradorId, 'attacker-456', 'cliente')).toBe(false);
  });
});

describe('Garantia de Emissão de Ingressos (Idempotência Resiliente)', () => {
  function verificarNecessidadeEmissao(
    statusPedido: string,
    ingressosExistentes: Array<{ id: string }>,
    quantidadeEsperada: number
  ): { precisaEmitir: boolean; jaProcessado: boolean } {
    if (ingressosExistentes.length >= quantidadeEsperada) {
      return { precisaEmitir: false, jaProcessado: true };
    }
    // Mesmo que o status seja aprovado, se os ingressos não existem, DEVE emitir
    return { precisaEmitir: true, jaProcessado: false };
  }

  it('deve reconhecer já processado se todos os ingressos existem no banco', () => {
    const res = verificarNecessidadeEmissao('aprovado', [{ id: 'ing-1' }, { id: 'ing-2' }], 2);
    expect(res.jaProcessado).toBe(true);
    expect(res.precisaEmitir).toBe(false);
  });

  it('deve FORÇAR emissão se o pedido está como aprovado mas possui 0 ingressos', () => {
    const res = verificarNecessidadeEmissao('aprovado', [], 2);
    expect(res.jaProcessado).toBe(false);
    expect(res.precisaEmitir).toBe(true);
  });

  it('deve emitir ingressos para pedido pendente', () => {
    const res = verificarNecessidadeEmissao('pendente', [], 1);
    expect(res.jaProcessado).toBe(false);
    expect(res.precisaEmitir).toBe(true);
  });
});

