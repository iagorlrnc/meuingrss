export type NivelLog = 'info' | 'warn' | 'error' | 'security';

interface ContextoLog {
  evento_id?: string;
  lote_id?: string;
  comprador_id?: string;
  gateway_transaction_id?: string;
  status?: string;
  ip?: string;
  path?: string;
  [key: string]: unknown;
}

/**
 * Sanitiza valores para garantir que dados sensíveis não sejam impressos nos logs
 */
function sanitizarContexto(contexto: ContextoLog): ContextoLog {
  const limpo = { ...contexto };
  const chavesSensiveis = ['access_token', 'secret', 'password', 'senha', 'cpf', 'cartao', 'cvv', 'token', 'authorization'];

  for (const chave of Object.keys(limpo)) {
    if (chavesSensiveis.some((s) => chave.toLowerCase().includes(s))) {
      limpo[chave] = '[REDUZIDO]';
    }
  }
  return limpo;
}

export const logger = {
  info(mensagem: string, contexto: ContextoLog = {}) {
    const payload = {
      timestamp: new Date().toISOString(),
      nivel: 'info',
      mensagem,
      ...sanitizarContexto(contexto),
    };
    console.log(JSON.stringify(payload));
  },

  warn(mensagem: string, contexto: ContextoLog = {}) {
    const payload = {
      timestamp: new Date().toISOString(),
      nivel: 'warn',
      mensagem,
      ...sanitizarContexto(contexto),
    };
    console.warn(JSON.stringify(payload));
  },

  error(mensagem: string, erro?: unknown, contexto: ContextoLog = {}) {
    const payload = {
      timestamp: new Date().toISOString(),
      nivel: 'error',
      mensagem,
      detalhes_erro: erro instanceof Error ? erro.message : String(erro || ''),
      stack: erro instanceof Error ? erro.stack : undefined,
      ...sanitizarContexto(contexto),
    };
    console.error(JSON.stringify(payload));
  },

  security(alerta: string, contexto: ContextoLog = {}) {
    const payload = {
      timestamp: new Date().toISOString(),
      nivel: 'SECURITY_ALERT',
      alerta,
      ...sanitizarContexto(contexto),
    };
    console.error(JSON.stringify(payload));
  },
};
