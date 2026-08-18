/**
 * Utilitário de sanitização segura para serialização de Schema.org JSON-LD.
 *
 * Previne ataques XSS (Cross-Site Scripting) ao injetar metadados em tags
 * <script type="application/ld+json">, escapando caracteres especiais de HTML
 * (<, >, &, \u2028, \u2029) para suas representações seguras em Unicode.
 */
export function serializarJsonLdSeguro(dados: unknown): string {
  return JSON.stringify(dados)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
