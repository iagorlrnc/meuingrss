export function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valor);
}

export function mascararMoeda(valor: string | number): string {
  if (typeof valor === 'number') {
    valor = valor.toFixed(2);
  }
  const apenasNumeros = String(valor).replace(/\D/g, '');
  if (!apenasNumeros) return 'R$ 0,00';
  const valorNumerico = parseFloat(apenasNumeros) / 100;
  return valorNumerico.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function desmascararMoeda(valorMascarado: string | number): number {
  if (typeof valorMascarado === 'number') return valorMascarado;
  const apenasNumeros = String(valorMascarado).replace(/\D/g, '');
  if (!apenasNumeros) return 0;
  return parseFloat(apenasNumeros) / 100;
}

export function formatarData(dataISO?: string | null): string {
  if (!dataISO) return 'Data a definir';
  const data = new Date(dataISO);
  if (isNaN(data.getTime())) return 'Data a definir';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(data);
}

export function formatarDataHora(dataISO?: string | null): string {
  if (!dataISO) return 'Data a definir';
  const data = new Date(dataISO);
  if (isNaN(data.getTime())) return 'Data a definir';
  const dataFormatada = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(data);
  const horaFormatada = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(data);
  return `${dataFormatada}, às ${horaFormatada}`;
}

export function formatarDataCurta(dataISO?: string | null): string {
  if (!dataISO) return 'Data a definir';
  const data = new Date(dataISO);
  if (isNaN(data.getTime())) return 'Data a definir';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(data);
}

export function obterIniciais(nome: string): string {
  return nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0].toUpperCase())
    .join('');
}

export function truncarTexto(texto: string, maxCaracteres: number): string {
  if (texto.length <= maxCaracteres) return texto;
  return texto.slice(0, maxCaracteres).trimEnd() + '…';
}

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatarTelefone(valor: string): string {
  const apenasNumeros = valor.replace(/\D/g, '').slice(0, 11);
  if (apenasNumeros.length <= 2) {
    return apenasNumeros ? `(${apenasNumeros}` : '';
  }
  if (apenasNumeros.length <= 6) {
    return `(${apenasNumeros.slice(0, 2)}) ${apenasNumeros.slice(2)}`;
  }
  if (apenasNumeros.length <= 10) {
    return `(${apenasNumeros.slice(0, 2)}) ${apenasNumeros.slice(2, 6)}-${apenasNumeros.slice(6)}`;
  }
  return `(${apenasNumeros.slice(0, 2)}) ${apenasNumeros.slice(2, 7)}-${apenasNumeros.slice(7)}`;
}

export function formatarCPF(valor: string): string {
  const apenasNumeros = valor.replace(/\D/g, '').slice(0, 11);
  if (apenasNumeros.length <= 3) {
    return apenasNumeros;
  }
  if (apenasNumeros.length <= 6) {
    return `${apenasNumeros.slice(0, 3)}.${apenasNumeros.slice(3)}`;
  }
  if (apenasNumeros.length <= 9) {
    return `${apenasNumeros.slice(0, 3)}.${apenasNumeros.slice(3, 6)}.${apenasNumeros.slice(6)}`;
  }
  return `${apenasNumeros.slice(0, 3)}.${apenasNumeros.slice(3, 6)}.${apenasNumeros.slice(6, 9)}-${apenasNumeros.slice(9)}`;
}

export function obterInfoStatus(status: string): { cor: string; label: string } {
  const mapa: Record<string, { cor: string; label: string }> = {
    valido: { cor: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20', label: 'Válido' },
    utilizado: { cor: 'text-blue-400 bg-blue-400/10 border-blue-400/20', label: 'Utilizado' },
    cancelado: { cor: 'text-red-400 bg-red-400/10 border-red-400/20', label: 'Cancelado' },
    pendente: { cor: 'text-amber-400 bg-amber-400/10 border-amber-400/20', label: 'Pendente' },
    aprovado: { cor: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20', label: 'Aprovado' },
    recusado: { cor: 'text-red-400 bg-red-400/10 border-red-400/20', label: 'Recusado' },
    publicado: { cor: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20', label: 'Publicado' },
    rascunho: { cor: 'text-zinc-400 bg-zinc-400/10 border-zinc-400/20', label: 'Rascunho' },
    encerrado: { cor: 'text-zinc-400 bg-zinc-400/10 border-zinc-400/20', label: 'Encerrado' },
    ativo: { cor: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20', label: 'Ativo' },
    bloqueado: { cor: 'text-red-400 bg-red-400/10 border-red-400/20', label: 'Bloqueado' },
    ativa: { cor: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20', label: 'Ativa' },
    inativa: { cor: 'text-zinc-400 bg-zinc-400/10 border-zinc-400/20', label: 'Inativa' },
  };

  return mapa[status] || { cor: 'text-zinc-400 bg-zinc-400/10', label: status };
}
