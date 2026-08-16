import type { MetadataRoute } from 'next';
import { criarClienteAdmin } from '@/lib/supabase/admin';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const dominioPrincipal = (process.env.NEXT_PUBLIC_DOMINIO_PRINCIPAL || 'meuingrss.com.br').replace(/\/+$/, '');
  const protocolo = process.env.NEXT_PUBLIC_PROTOCOLO || 'https';
  const baseUrl = `${protocolo}://${dominioPrincipal}`;

  // 1. Rotas estáticas da aplicação
  const rotasEstaticas: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/eventos`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/atleticas`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/sobre`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/termos-e-privacidade`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ];

  // 2. Busca eventos ativos do banco para sitemap dinâmico
  try {
    const supabase = criarClienteAdmin();
    const { data: eventos } = await supabase
      .from('eventos')
      .select('id, slug, updated_at, created_at, status')
      .eq('apagado_pelo_diretor', false)
      .in('status', ['publicado', 'encerrado'])
      .order('created_at', { ascending: false });

    if (!eventos || eventos.length === 0) {
      return rotasEstaticas;
    }

    const rotasEventos: MetadataRoute.Sitemap = eventos.map((evento) => {
      const slugOuId = evento.slug || evento.id;
      const dataModificacao = evento.updated_at || evento.created_at || new Date().toISOString();
      const ehEncerrado = evento.status === 'encerrado';

      return {
        url: `${baseUrl}/eventos/${slugOuId}`,
        lastModified: new Date(dataModificacao),
        changeFrequency: ehEncerrado ? 'monthly' : 'hourly',
        priority: ehEncerrado ? 0.5 : 0.9,
      };
    });

    return [...rotasEstaticas, ...rotasEventos];
  } catch (erro) {
    console.error('Erro ao gerar sitemap dinâmico:', erro);
    return rotasEstaticas;
  }
}
