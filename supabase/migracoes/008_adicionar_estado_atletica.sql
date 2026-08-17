-- Migration: Adicionar coluna estado (UF) na tabela atleticas
ALTER TABLE atleticas
  ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'TO';

-- Comentário explicativo na coluna
COMMENT ON COLUMN atleticas.estado IS 'Sigla do estado da Atlética (ex: TO)';
