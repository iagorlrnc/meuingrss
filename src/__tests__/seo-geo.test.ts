import { describe, it, expect } from 'vitest';
import { gerarJsonLdEvento } from '../componentes/seo/SeoJsonLd';
import { serializarJsonLdSeguro } from '../lib/jsonLd';
import robots from '../app/robots';
import type { EventoCompleto } from '../lib/cacheEventos';

describe('Testes de SEO Técnico e GEO (Generative Engine Optimization)', () => {
  const eventoMock: EventoCompleto = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    atletica_id: 'atl-1',
    slug: 'calourada-uft-2026',
    titulo: 'Calourada UFT 2026',
    descricao: 'A maior festa universitária do Tocantins com os melhores DJs!',
    data_evento: '2026-10-15T22:00:00.000Z',
    local: 'Espaço Cultural de Palmas',
    cidade: 'Palmas',
    status: 'publicado',
    imagem_url: 'https://exemplo.com/imagem.jpg',
    criado_em: '2026-08-01T10:00:00.000Z',
    atualizado_em: '2026-08-10T12:00:00.000Z',
    atletica: {
      id: 'atl-1',
      nome: 'Atlética Soberana',
      logo_url: 'https://exemplo.com/logo.jpg',
      faculdade: 'UFT',
      cidade: 'Palmas',
      cor_primaria: '#ff007a',
      cor_secundaria: '#00e5ff',
      status: 'ativa',
      criado_em: '2026-01-01T00:00:00.000Z',
    },
    lotes_ingresso: [
      {
        id: 'lote-1',
        evento_id: '123e4567-e89b-12d3-a456-426614174000',
        nome_lote: '1º Lote Promo',
        preco: 40.0,
        quantidade_total: 100,
        quantidade_vendida: 30,
        ativo: true,
        ordem: 1,
      },
      {
        id: 'lote-2',
        evento_id: '123e4567-e89b-12d3-a456-426614174000',
        nome_lote: '2º Lote Geral',
        preco: 60.0,
        quantidade_total: 200,
        quantidade_vendida: 0,
        ativo: true,
        ordem: 2,
      },
    ],
  };

  it('deve gerar os schemas JSON-LD Schema.org válidos para o evento', () => {
    const urlPagina = 'https://meuingrss.com.br/eventos/calourada-uft-2026';
    const imagemUrl = 'https://exemplo.com/imagem.jpg';

    const { schemaEvento, schemaBreadcrumb, schemaFAQ } = gerarJsonLdEvento({
      evento: eventoMock,
      urlPagina,
      imagemUrl,
    });

    // Validar Schema Event
    expect(schemaEvento['@context']).toBe('https://schema.org');
    expect(schemaEvento['@type']).toBe('Event');
    expect(schemaEvento.name).toBe('Calourada UFT 2026');
    expect(schemaEvento.eventAttendanceMode).toBe('https://schema.org/OfflineEventAttendanceMode');
    expect(schemaEvento.eventStatus).toBe('https://schema.org/EventScheduled');
    expect(schemaEvento.location.name).toBe('Espaço Cultural de Palmas');
    expect(schemaEvento.location.address.addressLocality).toBe('Palmas');
    expect(schemaEvento.location.address.addressRegion).toBe('TO');
    expect(schemaEvento.location.address.addressCountry).toBe('BR');
    expect(schemaEvento.organizer.name).toBe('Atlética Soberana');

    // Validar ofertas (array de lotes de ingressos)
    const offersArray = schemaEvento.offers as Array<{ price: string; priceCurrency: string }>;
    expect(Array.isArray(offersArray)).toBe(true);
    expect(offersArray).toHaveLength(2);
    expect(offersArray[0].price).toBe('40.00');
    expect(offersArray[0].priceCurrency).toBe('BRL');

    // Validar Schema BreadcrumbList
    expect(schemaBreadcrumb['@type']).toBe('BreadcrumbList');
    expect(schemaBreadcrumb.itemListElement).toHaveLength(4);
    expect(schemaBreadcrumb.itemListElement[3].name).toBe('Calourada UFT 2026');

    // Validar Schema FAQPage
    expect(schemaFAQ['@type']).toBe('FAQPage');
    expect(schemaFAQ.mainEntity.length).toBeGreaterThan(0);
  });

  it('deve gerar as regras do robots.txt permitindo bots de IA nas rotas públicas e bloqueando privadas', () => {
    const configRobots = robots();

    expect(configRobots.rules).toBeDefined();
    const rules = Array.isArray(configRobots.rules) ? configRobots.rules : [configRobots.rules];

    // Verificar se bots de IA estão configurados
    const userAgents = rules.map((r) => r.userAgent);
    expect(userAgents).toContain('GPTBot');
    expect(userAgents).toContain('Google-Extended');
    expect(userAgents).toContain('PerplexityBot');
    expect(userAgents).toContain('ClaudeBot');
    expect(userAgents).toContain('*');

    // Verificar bloqueio de rotas privadas
    rules.forEach((rule) => {
      expect(rule.allow).toBe('/');
      expect(rule.disallow).toContain('/meus-ingressos');
      expect(rule.disallow).toContain('/checkout');
      expect(rule.disallow).toContain('/autenticacao/');
      expect(rule.disallow).toContain('/admin/');
      expect(rule.disallow).toContain('/diretor/');
    });

    expect(configRobots.sitemap).toContain('/sitemap.xml');
  });

  it('deve sanitizar injeções XSS em serializarJsonLdSeguro escapando caracteres HTML perigosos', () => {
    const payloadMalicioso = {
      titulo: 'Festa <script>alert("XSS")</script>',
      descricao: 'Evento com & e " quebra de tag </script><script src="evil.js">',
    };

    const resultadoSerializado = serializarJsonLdSeguro(payloadMalicioso);

    // Não deve conter tags <script> abertas nem fechadas diretamente em texto puro
    expect(resultadoSerializado).not.toContain('<script>');
    expect(resultadoSerializado).not.toContain('</script>');
    expect(resultadoSerializado).toContain('\\u003cscript\\u003e');
    expect(resultadoSerializado).toContain('\\u003c/script\\u003e');
    expect(resultadoSerializado).toContain('\\u0026');
  });
});
