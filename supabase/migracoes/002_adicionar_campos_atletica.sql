-- Migration: Adicionar novos campos para personalização e contatos da Atlética

ALTER TABLE atleticas
  ADD COLUMN IF NOT EXISTS capa_url TEXT,
  ADD COLUMN IF NOT EXISTS descricao TEXT,
  ADD COLUMN IF NOT EXISTS instagram TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp TEXT,
  ADD COLUMN IF NOT EXISTS email_contato TEXT,
  ADD COLUMN IF NOT EXISTS chave_pix TEXT;
