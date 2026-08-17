-- ==============================================================================
-- Migração 027: Limpeza de Ingressos Duplicados e Blindagem de Unicidade
-- ==============================================================================

-- 1. Remove eventuais pagamentos e ingressos duplicados gerados por concorrência
DO $$
DECLARE
  v_dup RECORD;
BEGIN
  -- Mantém o ingresso original mais antigo por transação e exclui duplicatas
  FOR v_dup IN 
    SELECT p.id as pagamento_id, p.ingresso_id
    FROM public.pagamentos p
    WHERE p.gateway_transaction_id IS NOT NULL 
      AND p.gateway_transaction_id <> ''
      AND p.id NOT IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY gateway_transaction_id ORDER BY criado_em ASC, id ASC) as rn
          FROM public.pagamentos
          WHERE gateway_transaction_id IS NOT NULL AND gateway_transaction_id <> ''
        ) sub WHERE rn = 1
      )
  LOOP
    DELETE FROM public.pagamentos WHERE id = v_dup.pagamento_id;
    DELETE FROM public.ingressos WHERE id = v_dup.ingresso_id;
  END LOOP;
END $$;

-- 2. Criação de Índice Único em Pagamentos para impedir duplicações futuras
CREATE UNIQUE INDEX IF NOT EXISTS idx_pagamentos_gateway_ingresso_unique 
  ON public.pagamentos(gateway_transaction_id, ingresso_id) 
  WHERE gateway_transaction_id IS NOT NULL;
