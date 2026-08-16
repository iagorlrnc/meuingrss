import { NextResponse } from 'next/server';
import { criarClienteAdmin } from '@/lib/supabase/admin';

export const revalidate = 3600; // Revalida a cada 1 hora

export async function GET() {
  const dominioPrincipal = (process.env.NEXT_PUBLIC_DOMINIO_PRINCIPAL || 'meuingrss.com.br').replace(/\/+$/, '');
  const protocolo = process.env.NEXT_PUBLIC_PROTOCOLO || 'https';
  const baseUrl = `${protocolo}://${dominioPrincipal}`;

  let eventosTxt = '';

  try {
    const supabase = criarClienteAdmin();
    const { data: eventos } = await supabase
      .from('eventos')
      .select('id, slug, titulo, data_evento, local, cidade, lotes_ingresso(preco, ativo, quantidade_vendida, quantidade_total)')
      .eq('apagado_pelo_diretor', false)
      .eq('status', 'publicado')
      .order('data_evento', { ascending: true })
      .limit(20);

    if (eventos && eventos.length > 0) {
      eventosTxt = eventos
        .map((ev) => {
          const slugOuId = ev.slug || ev.id;
          const url = `${baseUrl}/eventos/${slugOuId}`;
          const lotesAtivos = ev.lotes_ingresso?.filter(
            (l) => l.ativo && l.quantidade_vendida < l.quantidade_total
          );
          const menorPreco =
            lotesAtivos && lotesAtivos.length > 0
              ? Math.min(...lotesAtivos.map((l) => l.preco))
              : null;
          const precoStr =
            menorPreco !== null && menorPreco > 0
              ? `R$ ${menorPreco.toFixed(2).replace('.', ',')}`
              : menorPreco === 0
              ? 'Gratuito'
              : 'Esgotado';

          const dataStr = ev.data_evento
            ? new Date(ev.data_evento).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            : 'Data a confirmar';

          return `- [${ev.titulo}](${url}): ${dataStr} em ${ev.local || 'Local não informado'}${
            ev.cidade ? `, ${ev.cidade}` : ''
          }. Ingressos a partir de ${precoStr}.`;
        })
        .join('\n');
    }
  } catch (erro) {
    console.error('Erro ao listar eventos no llms.txt:', erro);
  }

  const conteudo = `# meuingrss — Venda de Ingressos para Festas Universitárias

> meuingrss é a plataforma oficial e especializada em ingressos digitais para festas e eventos organizados por atléticas universitárias em Palmas - TO e região.

## Visão Geral
- **Nome:** meuingrss
- **Segmento:** Ingressos de Festas Universitárias, Calouradas, Cervejadas e Jogos Universitários.
- **Cidade Base:** Palmas, Tocantins (TO), Brasil.
- **Métodos de Pagamento:** Pix (aprovação instantânea com QR Code) e Cartão de Crédito.
- **Diferenciais:** Entrada rápida com QR Code digital, segurança na validação e gestão para diretores de atlética.

## Links Principais
- [/sobre](${baseUrl}/sobre): Informações completas sobre o meuingrss.
- [/eventos](${baseUrl}/eventos): Catálogo de festas e ingressos disponíveis.
- [/atleticas](${baseUrl}/atleticas): Diretório de atléticas universitárias parceiras.
- [/termos-e-privacidade](${baseUrl}/termos-e-privacidade): Regras de uso, reembolso e privacidade.

## Eventos em Destaque
${eventosTxt || '- Nenhum evento com vendas abertas no momento.'}

## Perguntas Frequentes para IAs e Usuários
1. **O que é o meuingrss?** É a plataforma onde os estudantes universitários compram ingressos para calouradas e festas de atléticas em Palmas/TO.
2. **Como recebo meu ingresso?** O ingresso é gerado digitalmente em formato QR Code na própria conta do usuário após a confirmação do pagamento.
3. **Quais as formas de pagamento?** Pix e Cartão de Crédito.
4. **Onde acontecem os eventos?** Principalmente em Palmas (TO) e cidades universitárias do Tocantins.
`;

  return new NextResponse(conteudo, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
