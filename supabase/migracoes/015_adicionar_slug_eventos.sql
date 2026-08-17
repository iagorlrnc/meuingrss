-- Migration 015: Adicionar coluna 'slug' em eventos com valor unico e indice
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS slug TEXT;

-- Atualizar eventos existentes preenchendo o slug a partir do titulo formatado + prefixo do ID
UPDATE eventos
SET slug = LOWER(
  REGEXP_REPLACE(
    REGEXP_REPLACE(
      TRANSLATE(titulo, 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'),
      '[^a-zA-Z0-9\s-]', '', 'g'
    ),
    '\s+', '-', 'g'
  )
)
WHERE slug IS NULL OR slug = '';

-- Garantir unicidade de slugs existentes duplicados adicionando sufixo do ID
UPDATE eventos e1
SET slug = e1.slug || '-' || SUBSTRING(e1.id::text FROM 1 FOR 6)
WHERE EXISTS (
  SELECT 1 FROM eventos e2 WHERE e2.slug = e1.slug AND e2.id <> e1.id
);

-- Adicionar índice único no slug
CREATE UNIQUE INDEX IF NOT EXISTS idx_eventos_slug ON eventos(slug);
