import type { Evento, LoteIngresso, Atletica } from '@/tipos';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizarListaCidades } from '@/lib/utilitarios';

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
  const lista = normalizarListaCidades([...(cacheCidades || []), cidade]);
  cacheCidades = lista;
}

export function obterCidadesCache(): string[] | null {
  return cacheCidades;
}

export function salvarCidadesCache(cidades: string[]): void {
  cacheCidades = normalizarListaCidades(cidades);
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
          .select('cidade, estado')
          .eq('status', 'ativa'),
      ]);

      const cidadesEventos = resEventos.data ? resEventos.data.map((e: { cidade?: string }) => e.cidade) : [];
      const atleticasData = resAtleticas.data || [];

      const unicas = normalizarListaCidades([
        ...cidadesEventos,
        ...atleticasData.map((a: { cidade?: string; estado?: string }) => ({
          cidade: a.cidade,
          estado: a.estado,
        })),
      ]);

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
