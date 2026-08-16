import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const dominioPrincipal = (process.env.NEXT_PUBLIC_DOMINIO_PRINCIPAL || 'meuingrss.com.br').replace(/\/+$/, '');
  const protocolo = process.env.NEXT_PUBLIC_PROTOCOLO || 'https';
  const baseUrl = `${protocolo}://${dominioPrincipal}`;

  const rotasPrivadas = [
    '/meus-ingressos',
    '/checkout',
    '/autenticacao/',
    '/diretor/',
    '/admin/',
    '/api/',
  ];

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: rotasPrivadas,
      },
      {
        userAgent: 'GPTBot',
        allow: '/',
        disallow: rotasPrivadas,
      },
      {
        userAgent: 'Google-Extended',
        allow: '/',
        disallow: rotasPrivadas,
      },
      {
        userAgent: 'PerplexityBot',
        allow: '/',
        disallow: rotasPrivadas,
      },
      {
        userAgent: 'ClaudeBot',
        allow: '/',
        disallow: rotasPrivadas,
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
