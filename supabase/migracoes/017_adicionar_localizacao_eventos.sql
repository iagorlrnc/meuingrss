-- Migration 017: Adicionar colunas de localização (latitude, longitude, endereco_formatado, local_definido) à tabela eventos
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS endereco_formatado TEXT;
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS local_definido BOOLEAN DEFAULT TRUE NOT NULL;
