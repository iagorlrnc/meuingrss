import type { Evento, LoteIngresso, Atletica } from '@/tipos';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface EventoCompleto extends Evento {
  atletica: Atletica;
  lotes_ingresso: LoteIngresso[];
}

const cacheDetalhesEvento = new Map<string, EventoCompleto>();
let cacheCidades: string[] | null = null;
let promessaCidadesEmAndamento: Promise<string[]> | null = null;

export function obterEventoCache(id: string): EventoCompleto | undefined {
  return cacheDetalhesEvento.get(id);
}

export function salvarEventoCache(evento: EventoCompleto): void {
  if (evento && evento.id) {
    cacheDetalhesEvento.set(evento.id, evento);
    if (evento.cidade && evento.cidade.trim()) {
      adicionarCidadeAoCache(evento.cidade.trim());
    }
  }
}

export function salvarVariosEventosCache(eventos: (EventoCompleto | Partial<Evento>)[]): void {
  if (!Array.isArray(eventos)) return;
  for (const item of eventos) {
    if (item && item.id && 'lotes_ingresso' in item && 'atletica' in item) {
      cacheDetalhesEvento.set(item.id, item as EventoCompleto);
    }
    if (item && item.cidade && typeof item.cidade === 'string' && item.cidade.trim()) {
      adicionarCidadeAoCache(item.cidade.trim());
    }
  }
}

function adicionarCidadeAoCache(cidade: string) {
  if (!cidade || !cidade.trim()) return;
  const cFormatada = cidade.trim();
  const setAtual = new Set(cacheCidades || []);
  const jaExiste = Array.from(setAtual).some((c) => c.toLowerCase() === cFormatada.toLowerCase());
  if (!jaExiste) {
    setAtual.add(cFormatada);
    cacheCidades = Array.from(setAtual).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }
}

export function obterCidadesCache(): string[] | null {
  return cacheCidades;
}

export function salvarCidadesCache(cidades: string[]): void {
  cacheCidades = cidades;
}

export async function obterOuBuscarCidades(supabaseClient: SupabaseClient): Promise<string[]> {
  if (cacheCidades && cacheCidades.length > 0) return cacheCidades;

  if (promessaCidadesEmAndamento) {
    return promessaCidadesEmAndamento;
  }

  promessaCidadesEmAndamento = (async () => {
    try {
      const [resEventos, resAtleticas] = await Promise.all([
        supabaseClient
          .from('eventos')
          .select('cidade')
          .eq('apagado_pelo_diretor', false)
          .in('status', ['publicado', 'encerrado', 'cancelado']),
        supabaseClient
          .from('atleticas')
          .select('cidade')
          .eq('status', 'ativa'),
      ]);

      const cidadesEventos = resEventos.data ? resEventos.data.map((e: { cidade?: string }) => e.cidade) : [];
      const cidadesAtleticas = resAtleticas.data ? resAtleticas.data.map((a: { cidade?: string }) => a.cidade) : [];

      const listaBruta = [...cidadesEventos, ...cidadesAtleticas]
        .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
        .map((c) => c.trim());

      const mapaCidades = new Map<string, string>();
      for (const item of listaBruta) {
        const chave = item.toLowerCase();
        if (!mapaCidades.has(chave)) {
          mapaCidades.set(chave, item);
        }
      }

      const unicas = Array.from(mapaCidades.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'));

      if (unicas.length > 0) {
        salvarCidadesCache(unicas);
      }
      return unicas;
    } catch {
      return cacheCidades || [];
    } finally {
      promessaCidadesEmAndamento = null;
    }
  })();

  return promessaCidadesEmAndamento;
}
