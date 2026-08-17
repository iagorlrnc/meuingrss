-- Migration 005: Índices de Performance para a página "Meus Ingressos"
-- 
-- Problema: A consulta de ingressos do cliente é lenta porque os índices
-- existentes não cobrem os padrões de acesso mais comuns:
-- - Filtro por comprador_id + status (filtros de "Meus Ingressos")
-- - Ordenação por data_compra DESC (listagem cronológica)
-- - Filtro por status isolado (contagem de ingressos por status)
--
-- Índices existentes que já ajudam:
-- - idx_ingressos_comprador ON ingressos(comprador_id) — filtro simples
-- - idx_ingressos_evento ON ingressos(evento_id) — filtro por evento
-- - idx_pagamentos_ingresso ON pagamentos(ingresso_id) — join com pagamentos
--
-- Novos índices para otimizar os padrões de acesso:

-- 1. Índice composto para "Meus Ingressos" com filtro de status
-- Cobre: WHERE comprador_id = X AND status IN ('valido', 'utilizado')
CREATE INDEX IF NOT EXISTS idx_ingressos_comprador_status
  ON ingressos(comprador_id, status);

-- 2. Índice para ordenação por data de compra (DESC) filtrado por comprador
-- Cobre: WHERE comprador_id = X ORDER BY data_compra DESC LIMIT N
CREATE INDEX IF NOT EXISTS idx_ingressos_comprador_data
  ON ingressos(comprador_id, data_compra DESC);

-- 3. Índice para filtro isolado de status de ingressos
-- Cobre: WHERE status = 'valido' (usado pelo cron de expiração)
CREATE INDEX IF NOT EXISTS idx_ingressos_status
  ON ingressos(status);

-- 4. Índice para consulta de pagamentos por gateway_transaction_id
-- Já existe idx_pagamentos_ingresso, mas precisamos buscar por transaction_id
-- para idempotência do webhook
CREATE INDEX IF NOT EXISTS idx_pagamentos_gateway_tx
  ON pagamentos(gateway_transaction_id);

-- 5. Índice para pagamentos pendentes (usado pelo cron de expiração)
CREATE INDEX IF NOT EXISTS idx_pagamentos_status_criado
  ON pagamentos(status, criado_em)
  WHERE status = 'pendente';

-- 6. Índice para notificações do cliente (leitura rápida)
CREATE INDEX IF NOT EXISTS idx_notificacoes_usuario_lida
  ON notificacoes_cliente(usuario_id, lida)
  WHERE lida = false;
