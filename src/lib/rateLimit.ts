// Rate limiter em memória baseado em Janela Deslizante (Sliding Window)

interface OpcoesRateLimit {
  janelaMs: number; // Janela de tempo em milissegundos
  maxRequisicoes: number; // Máximo de requisições permitidas na janela
}

interface RegistroIp {
  timestamps: number[];
}

const memoriaRateLimit = new Map<string, RegistroIp>();

// Limpeza periódica para não acumular memória
setInterval(() => {
  const agora = Date.now();
  for (const [chave, registro] of memoriaRateLimit.entries()) {
    registro.timestamps = registro.timestamps.filter((ts) => agora - ts < 3600000); // 1 hora
    if (registro.timestamps.length === 0) {
      memoriaRateLimit.delete(chave);
    }
  }
}, 600000);

export function verificarRateLimit(
  identificador: string,
  opcoes: OpcoesRateLimit = { janelaMs: 60000, maxRequisicoes: 15 }
): { permitido: boolean; restantes: number; tempoEsperaMs: number } {
  const agora = Date.now();
  let registro = memoriaRateLimit.get(identificador);

  if (!registro) {
    registro = { timestamps: [] };
    memoriaRateLimit.set(identificador, registro);
  }

  // Filtra apenas timestamps dentro da janela
  registro.timestamps = registro.timestamps.filter((ts) => agora - ts < opcoes.janelaMs);

  if (registro.timestamps.length >= opcoes.maxRequisicoes) {
    const tsMaisAntigo = registro.timestamps[0];
    const tempoEsperaMs = opcoes.janelaMs - (agora - tsMaisAntigo);
    return {
      permitido: false,
      restantes: 0,
      tempoEsperaMs: Math.max(0, tempoEsperaMs),
    };
  }

  registro.timestamps.push(agora);
  return {
    permitido: true,
    restantes: opcoes.maxRequisicoes - registro.timestamps.length,
    tempoEsperaMs: 0,
  };
}
