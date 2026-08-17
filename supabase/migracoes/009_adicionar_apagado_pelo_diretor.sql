-- 009_adicionar_apagado_pelo_diretor.sql
-- Adiciona a coluna 'apagado_pelo_diretor' para permitir exclusão lógica pelo diretor sem remover o histórico do admin.

ALTER TABLE eventos ADD COLUMN IF NOT EXISTS apagado_pelo_diretor BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_eventos_apagado_pelo_diretor ON eventos(apagado_pelo_diretor);
