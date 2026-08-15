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
  }
}

export function salvarVariosEventosCache(eventos: EventoCompleto[]): void {
  if (!Array.isArray(eventos)) return;
  for (const item of eventos) {
    if (item && item.id && item.lotes_ingresso && item.atletica) {
      cacheDetalhesEvento.set(item.id, item);
    }
  }
}

export function obterCidadesCache(): string[] | null {
  return cacheCidades;
}

export function salvarCidadesCache(cidades: string[]): void {
  cacheCidades = cidades;
}

export async function obterOuBuscarCidades(supabaseClient: SupabaseClient): Promise<string[]> {
  if (cacheCidades) return cacheCidades;

  if (promessaCidadesEmAndamento) {
    return promessaCidadesEmAndamento;
  }

  promessaCidadesEmAndamento = (async () => {
    try {
      const { data } = await supabaseClient.from('eventos').select('cidade').eq('status', 'publicado');
      if (data) {
        const unicas = Array.from(new Set(data.map((e: { cidade?: string }) => e.cidade).filter(Boolean))) as string[];
        salvarCidadesCache(unicas);
        return unicas;
      }
      salvarCidadesCache([]);
      return [];
    } catch {
      return [];
    } finally {
      promessaCidadesEmAndamento = null;
    }
  })();

  return promessaCidadesEmAndamento;
}

