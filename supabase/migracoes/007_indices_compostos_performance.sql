-- Migration 007: Índices Compostos de Performance para Eventos e Perfis
-- 
-- 1. Índice composto para a vitrine de eventos: status + ordenação por data do evento
-- Cobre consultas: WHERE status = 'publicado' ORDER BY data_evento ASC
CREATE INDEX IF NOT EXISTS idx_eventos_status_data
  ON eventos(status, data_evento ASC);

-- 2. Índice para ordenação de eventos mais recentes no dashboard do diretor e admin
-- Cobre consultas: ORDER BY criado_em DESC
CREATE INDEX IF NOT EXISTS idx_eventos_criado_em
  ON eventos(criado_em DESC);

-- 3. Índice para ordenação da lista global de usuários no painel de administração
-- Cobre consultas: ORDER BY criado_em DESC com paginação backend
CREATE INDEX IF NOT EXISTS idx_profiles_criado_em
  ON profiles(criado_em DESC);
