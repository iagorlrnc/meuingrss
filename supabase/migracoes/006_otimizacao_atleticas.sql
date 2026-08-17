-- Migration 006: Otimização de Performance e Índices para Atléticas
-- 
-- Copie e cole todo este script no SQL Editor do Supabase para acelerar 
-- instantaneamente o carregamento da aba de Atléticas!

-- 1. Criar índice no status das atléticas para busca direta instantânea
CREATE INDEX IF NOT EXISTS idx_atleticas_status 
  ON atleticas(status);

-- 2. Criar índice na ordenação por nome
CREATE INDEX IF NOT EXISTS idx_atleticas_nome 
  ON atleticas(nome);

-- 3. Criar índice composto em eventos por atletica_id e status para contagem rápida
CREATE INDEX IF NOT EXISTS idx_eventos_atletica_status 
  ON eventos(atletica_id, status);

-- 4. Otimizar a política RLS (Row Level Security) da tabela de atléticas
-- Evita subqueries desnecessárias na tabela de profiles para usuários não autenticados/visitantes
DROP POLICY IF EXISTS "Atléticas ativas visíveis" ON atleticas;

CREATE POLICY "Atléticas ativas visíveis"
  ON atleticas FOR SELECT
  USING (
    status = 'ativa' 
    OR (
      auth.uid() IS NOT NULL 
      AND EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() AND role = 'admin'
      )
    )
  );

-- 5. Otimizar a política RLS da tabela de eventos para consulta de contagem
DROP POLICY IF EXISTS "Eventos publicados visíveis" ON eventos;

CREATE POLICY "Eventos publicados visíveis"
  ON eventos FOR SELECT
  USING (
    status = 'publicado'
    OR (
      auth.uid() IS NOT NULL AND (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE id = auth.uid()
          AND (
            role = 'admin' 
            OR (role = 'diretor' AND atletica_id = eventos.atletica_id)
          )
        )
      )
    )
  );
