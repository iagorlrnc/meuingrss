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

export function validarCPF(cpf: string): boolean {
  if (!cpf) return false;
  const apenasNumeros = cpf.replace(/\D/g, '');

  if (apenasNumeros.length !== 11) return false;

  // Rejeita CPFs com todos os dígitos iguais (ex: 000.000.000-00, 111.111.111-11, etc.)
  if (/^(\d)\1{10}$/.test(apenasNumeros)) return false;

  // Validação do 1º dígito verificador
  let soma = 0;
  for (let i = 0; i < 9; i++) {
    soma += parseInt(apenasNumeros.charAt(i), 10) * (10 - i);
  }
  let resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(apenasNumeros.charAt(9), 10)) return false;

  // Validação do 2º dígito verificador
  soma = 0;
  for (let i = 0; i < 10; i++) {
    soma += parseInt(apenasNumeros.charAt(i), 10) * (11 - i);
  }
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(apenasNumeros.charAt(10), 10)) return false;

  return true;
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

export function gerarSlug(titulo: string): string {
  if (!titulo) return '';
  const slugBase = titulo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');

  return slugBase || 'evento';
}

export async function gerarSlugUnico(
  supabaseClient: any,
  titulo: string,
  eventoIdAtual?: string
): Promise<string> {
  const slugBase = gerarSlug(titulo);
  let slugCandidato = slugBase;
  let contador = 1;
  let disponivel = false;

  while (!disponivel && contador <= 100) {
    let query = supabaseClient
      .from('eventos')
      .select('id')
      .eq('slug', slugCandidato);

    if (eventoIdAtual) {
      query = query.neq('id', eventoIdAtual);
    }

    const { data } = await query.maybeSingle();

    if (!data) {
      disponivel = true;
    } else {
      contador++;
      slugCandidato = `${slugBase}-${contador}`;
    }
  }

  return slugCandidato;
}

export function ordenarEventosPorPrioridade<T extends { status: string; data_evento: string }>(
  eventos: T[]
): T[] {
  const agora = new Date();

  function obterPrioridade(e: T): number {
    if (e.status === 'cancelado') return 3;
    const ehEncerrado = e.status === 'encerrado' || new Date(e.data_evento) < agora;
    if (ehEncerrado) return 2;
    return 1;
  }

  return [...eventos].sort((a, b) => {
    const pA = obterPrioridade(a);
    const pB = obterPrioridade(b);

    if (pA !== pB) {
      return pA - pB;
    }

    if (pA === 1) {
      return new Date(a.data_evento).getTime() - new Date(b.data_evento).getTime();
    }

    return new Date(b.data_evento).getTime() - new Date(a.data_evento).getTime();
  });
}

export function formatarCidadeEstado(cidadeStr?: string | null, estadoStr?: string | null): string {
  if (!cidadeStr || !cidadeStr.trim()) return '';
  const c = cidadeStr.trim();
  if (!estadoStr || !estadoStr.trim()) return c;
  const uf = estadoStr.trim().toUpperCase();
  const cUpper = c.toUpperCase();
  if (cUpper.endsWith(`- ${uf}`) || cUpper.endsWith(`, ${uf}`) || cUpper.endsWith(`/${uf}`)) {
    return c;
  }
  return `${c} - ${uf}`;
}

export function matchFiltroCidade(cidadeObjeto?: string | null, cidadeFiltro?: string | null): boolean {
  if (!cidadeFiltro || !cidadeFiltro.trim()) return true;
  const f = cidadeFiltro.trim().toLowerCase();
  if (
    f === 'todas' ||
    f === 'todas as cidades' ||
    f === 'todas-as-cidades' ||
    f === 'qualquer' ||
    f === 'all'
  ) {
    return true;
  }
  if (!cidadeObjeto) return false;
  const obj = cidadeObjeto.trim().toLowerCase();
  return obj === f || obj.startsWith(`${f} -`) || obj.startsWith(`${f},`) || obj.startsWith(`${f}/`);
}
