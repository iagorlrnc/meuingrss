import { NextRequest } from 'next/server';

interface RegRateLimit {
  tentativasConsecutivas: number;
  bloqueadoAte: number | null;
}

interface RegRateLimitOpcoes {
  contagem: number;
  resetEm: number;
}

// Global stores em memória
const g = globalThis as unknown as {
  _rateLimitStore?: Map<string, RegRateLimit>;
  _rateLimitOpcoesStore?: Map<string, RegRateLimitOpcoes>;
  _rateLimitCleanupInterval?: NodeJS.Timeout;
};

if (!g._rateLimitStore) {
  g._rateLimitStore = new Map<string, RegRateLimit>();
}
if (!g._rateLimitOpcoesStore) {
  g._rateLimitOpcoesStore = new Map<string, RegRateLimitOpcoes>();
}

const rateLimitStore = g._rateLimitStore;
const rateLimitOpcoesStore = g._rateLimitOpcoesStore;

// Limpeza periódica (a cada 10 minutos)
if (!g._rateLimitCleanupInterval) {
  g._rateLimitCleanupInterval = setInterval(() => {
    const agora = Date.now();
    rateLimitStore.forEach((dado, ip) => {
      if (dado.bloqueadoAte && agora > dado.bloqueadoAte + 3600000) {
        rateLimitStore.delete(ip);
      } else if (!dado.bloqueadoAte && dado.tentativasConsecutivas === 0) {
        rateLimitStore.delete(ip);
      }
    });
    rateLimitOpcoesStore.forEach((dado, chave) => {
      if (agora > dado.resetEm) {
        rateLimitOpcoesStore.delete(chave);
      }
    });
  }, 10 * 60 * 1000);
}

export function obterIPCliente(req: Request | NextRequest): string {
  const headers = req.headers;

  // Prioridade 1: Headers confiáveis da plataforma (não falsificáveis pelo cliente)
  const cfConnectingIp = headers.get('cf-connecting-ip');
  if (cfConnectingIp) return cfConnectingIp.trim();

  // Prioridade 2: Header de IP real (Vercel, Nginx)
  const xRealIp = headers.get('x-real-ip');
  if (xRealIp && xRealIp !== '::1' && xRealIp !== '127.0.0.1') return xRealIp.trim();

  // Prioridade 3: X-Forwarded-For (pode ser spoofado, mas é útil como fallback)
  const xForwardedFor = headers.get('x-forwarded-for');
  if (xForwardedFor) {
    const ip = xForwardedFor.split(',')[0].trim();
    if (ip && ip !== '::1' && ip !== '127.0.0.1') return ip;
  }

  return '127.0.0.1';
}

export interface ResultadoRateLimit {
  bloqueado: boolean;
  permitido: boolean;
  segundosRestantes: number;
  tentativasConsecutivas: number;
  mensagem?: string;
}

export function formatarTempoRestante(segundos: number): string {
  if (segundos <= 60) {
    return `${segundos} segundo(s)`;
  }
  if (segundos < 3600) {
    const minutos = Math.ceil(segundos / 60);
    return `${minutos} minuto(s)`;
  }
  const horas = Math.ceil(segundos / 3600);
  return `${horas} hora(s)`;
}

export function verificarRateLimit(
  chaveOuIp: string,
  opcoes?: { janelaMs?: number; maxRequisicoes?: number }
): ResultadoRateLimit {
  // Suporte a rate limit por janela / requisições (usado nos endpoints de checkout / webhook / consulta)
  if (opcoes && typeof opcoes === 'object') {
    const janelaMs = opcoes.janelaMs || 60000;
    const maxRequisicoes = opcoes.maxRequisicoes || 20;
    const agora = Date.now();

    let reg = rateLimitOpcoesStore.get(chaveOuIp);
    if (!reg || agora > reg.resetEm) {
      reg = { contagem: 1, resetEm: agora + janelaMs };
      rateLimitOpcoesStore.set(chaveOuIp, reg);
      return {
        permitido: true,
        bloqueado: false,
        segundosRestantes: 0,
        tentativasConsecutivas: 1,
      };
    }

    reg.contagem += 1;
    if (reg.contagem > maxRequisicoes) {
      const segundosRestantes = Math.ceil((reg.resetEm - agora) / 1000);
      return {
        permitido: false,
        bloqueado: true,
        segundosRestantes,
        tentativasConsecutivas: reg.contagem,
        mensagem: `Muitas solicitações em curto intervalo. Aguarde ${segundosRestantes} segundo(s).`,
      };
    }

    return {
      permitido: true,
      bloqueado: false,
      segundosRestantes: 0,
      tentativasConsecutivas: reg.contagem,
    };
  }

  // Suporte a rate limit por IP para Autenticação
  const dado = rateLimitStore.get(chaveOuIp);
  if (!dado) {
    return {
      permitido: true,
      bloqueado: false,
      segundosRestantes: 0,
      tentativasConsecutivas: 0,
    };
  }

  const agora = Date.now();

  if (dado.bloqueadoAte) {
    if (agora < dado.bloqueadoAte) {
      const segundosRestantes = Math.ceil((dado.bloqueadoAte - agora) / 1000);
      const tempoStr = formatarTempoRestante(segundosRestantes);

      return {
        permitido: false,
        bloqueado: true,
        segundosRestantes,
        tentativasConsecutivas: dado.tentativasConsecutivas,
        mensagem: `Muitas tentativas erradas em sequência. Você está temporariamente bloqueado. Aguarde ${tempoStr} para tentar novamente.`,
      };
    } else {
      dado.bloqueadoAte = null;
    }
  }

  return {
    permitido: true,
    bloqueado: false,
    segundosRestantes: 0,
    tentativasConsecutivas: dado.tentativasConsecutivas,
  };
}

export function registrarErroRateLimit(ip: string, ehAdmin: boolean = false): ResultadoRateLimit {
  let dado = rateLimitStore.get(ip);
  if (!dado) {
    dado = { tentativasConsecutivas: 0, bloqueadoAte: null };
    rateLimitStore.set(ip, dado);
  }

  const agora = Date.now();
  if (dado.bloqueadoAte && agora < dado.bloqueadoAte) {
    const segundosRestantes = Math.ceil((dado.bloqueadoAte - agora) / 1000);
    return {
      permitido: false,
      bloqueado: true,
      segundosRestantes,
      tentativasConsecutivas: dado.tentativasConsecutivas,
      mensagem: `Muitas tentativas erradas. Você está bloqueado por mais ${formatarTempoRestante(segundosRestantes)}.`,
    };
  }

  dado.tentativasConsecutivas += 1;

  // Regra Exclusiva para o Administrador: 5 erros -> 1 hora (3600s) de bloqueio por IP
  if (ehAdmin) {
    if (dado.tentativasConsecutivas % 5 === 0) {
      dado.bloqueadoAte = agora + 3600 * 1000; // 1 hora
    }

    if (dado.bloqueadoAte && agora < dado.bloqueadoAte) {
      const segundosRestantes = Math.ceil((dado.bloqueadoAte - agora) / 1000);
      const tempoStr = formatarTempoRestante(segundosRestantes);

      return {
        permitido: false,
        bloqueado: true,
        segundosRestantes,
        tentativasConsecutivas: dado.tentativasConsecutivas,
        mensagem: `Limite de 5 tentativas erradas de administrador atingido. Seu IP foi bloqueado por ${tempoStr}.`,
      };
    }

    const cicloFaltam = 5 - (dado.tentativasConsecutivas % 5);
    return {
      permitido: true,
      bloqueado: false,
      segundosRestantes: 0,
      tentativasConsecutivas: dado.tentativasConsecutivas,
      mensagem: `Tentativa incorreta de admin (${dado.tentativasConsecutivas % 5}/5). Faltam ${cicloFaltam} tentativa(s) para o bloqueio.`,
    };
  }

  // Regra padrão (Cliente / Diretor):
  // 5 erros -> 60s
  // 10 erros -> 5m (300s)
  // 15+ erros -> 1h (3600s)
  if (dado.tentativasConsecutivas >= 15) {
    dado.bloqueadoAte = agora + 3600 * 1000;
  } else if (dado.tentativasConsecutivas === 10) {
    dado.bloqueadoAte = agora + 300 * 1000;
  } else if (dado.tentativasConsecutivas === 5) {
    dado.bloqueadoAte = agora + 60 * 1000;
  }

  if (dado.bloqueadoAte && agora < dado.bloqueadoAte) {
    const segundosRestantes = Math.ceil((dado.bloqueadoAte - agora) / 1000);
    const tempoStr = formatarTempoRestante(segundosRestantes);

    return {
      permitido: false,
      bloqueado: true,
      segundosRestantes,
      tentativasConsecutivas: dado.tentativasConsecutivas,
      mensagem: `Limite de ${dado.tentativasConsecutivas} tentativas erradas em sequência atingido. Você foi bloqueado por ${tempoStr}.`,
    };
  }

  const proximosLimites = [5, 10, 15];
  const proximoLimite = proximosLimites.find((l) => l > dado!.tentativasConsecutivas) || 15;
  const restantes = proximoLimite - dado.tentativasConsecutivas;

  return {
    permitido: true,
    bloqueado: false,
    segundosRestantes: 0,
    tentativasConsecutivas: dado.tentativasConsecutivas,
    mensagem: `Tentativa incorreta (${dado.tentativasConsecutivas}/${proximoLimite}). Faltam ${restantes} tentativa(s) para o bloqueio.`,
  };
}

export function registrarSucessoRateLimit(ip: string): void {
  rateLimitStore.delete(ip);
}
