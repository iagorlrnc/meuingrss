-- Migration 004: Transação Atômica de Pagamento e Idempotência Estrita

-- 1. Tabela para rastreamento de idempotência das transações de pagamento do gateway
CREATE TABLE IF NOT EXISTS transacoes_processadas (
  gateway_transaction_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  evento_id UUID NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  lote_id UUID NOT NULL REFERENCES lotes_ingresso(id) ON DELETE CASCADE,
  comprador_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  quantidade INTEGER NOT NULL DEFAULT 1,
  valor_total DECIMAL(10, 2) NOT NULL DEFAULT 0,
  metodo_pagamento TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transacoes_processadas_gateway ON transacoes_processadas(gateway_transaction_id);

-- 2. Tabela de Notificações do Sistema para os Clientes
CREATE TABLE IF NOT EXISTS notificacoes_cliente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'ingresso_liberado',
  lida BOOLEAN NOT NULL DEFAULT false,
  dados JSONB DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notificacoes_usuario ON notificacoes_cliente(usuario_id);

-- RLS para Notificações
ALTER TABLE notificacoes_cliente ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário lê próprias notificações"
  ON notificacoes_cliente FOR SELECT
  USING (usuario_id = auth.uid());

CREATE POLICY "Inserir notificacao via service"
  ON notificacoes_cliente FOR INSERT
  WITH CHECK (true);

-- 3. Função PostgreSQL Atômica para Processar Pagamento Aprovado
CREATE OR REPLACE FUNCTION public.processar_pagamento_aprovado(
  p_gateway_transaction_id TEXT,
  p_evento_id UUID,
  p_lote_id UUID,
  p_comprador_id UUID,
  p_quantidade INT,
  p_valor_unitario NUMERIC,
  p_metodo_pagamento TEXT,
  p_qr_hashes TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lote RECORD;
  v_existente RECORD;
  v_restantes INT;
  v_i INT;
  v_ingresso_id UUID;
  v_ingressos_ids UUID[] := ARRAY[]::UUID[];
  v_valor_total NUMERIC;
BEGIN
  -- 3.1 Checagem de Idempotência
  SELECT * INTO v_existente
  FROM transacoes_processadas
  WHERE gateway_transaction_id = p_gateway_transaction_id
  FOR UPDATE;

  IF v_existente.gateway_transaction_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'sucesso', true,
      'ja_processado', true,
      'mensagem', 'Transação já foi processada anteriormente'
    );
  END IF;

  -- 3.2 Lock e Validação do Lote de Ingressos
  SELECT * INTO v_lote
  FROM lotes_ingresso
  WHERE id = p_lote_id
  FOR UPDATE;

  IF v_lote.id IS NULL THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'erro', 'Lote de ingressos não encontrado'
    );
  END IF;

  v_restantes := v_lote.quantidade_total - v_lote.quantidade_vendida;
  IF v_restantes < p_quantidade THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'erro', 'Quantidade de ingressos insuficiente no lote'
    );
  END IF;

  v_valor_total := p_valor_unitario * p_quantidade;

  -- 3.3 Registrar transação processada
  INSERT INTO transacoes_processadas (
    gateway_transaction_id,
    status,
    evento_id,
    lote_id,
    comprador_id,
    quantidade,
    valor_total,
    metodo_pagamento
  ) VALUES (
    p_gateway_transaction_id,
    'approved',
    p_evento_id,
    p_lote_id,
    p_comprador_id,
    p_quantidade,
    v_valor_total,
    p_metodo_pagamento
  );

  -- 3.4 Inserção dos Ingressos e Pagamentos (Garantindo atamicidade total)
  FOR v_i IN 1..p_quantidade LOOP
    INSERT INTO ingressos (
      evento_id,
      lote_id,
      comprador_id,
      qr_code_hash,
      status
    ) VALUES (
      p_evento_id,
      p_lote_id,
      p_comprador_id,
      p_qr_hashes[v_i],
      'valido'
    ) RETURNING id INTO v_ingresso_id;

    v_ingressos_ids := array_append(v_ingressos_ids, v_ingresso_id);

    INSERT INTO pagamentos (
      ingresso_id,
      valor,
      status,
      gateway_transaction_id,
      metodo_pagamento
    ) VALUES (
      v_ingresso_id,
      p_valor_unitario,
      'aprovado',
      p_gateway_transaction_id,
      p_metodo_pagamento
    );
  END LOOP;

  -- 3.5 Registrar Notificação in-app para o comprador
  INSERT INTO notificacoes_cliente (
    usuario_id,
    titulo,
    mensagem,
    tipo,
    dados
  ) VALUES (
    p_comprador_id,
    'Ingresso(s) Liberado(s)!',
    p_quantidade || ' ingresso(s) confirmado(s) com sucesso.',
    'ingresso_liberado',
    jsonb_build_object(
      'evento_id', p_evento_id,
      'lote_id', p_lote_id,
      'quantidade', p_quantidade,
      'gateway_transaction_id', p_gateway_transaction_id
    )
  );

  RETURN jsonb_build_object(
    'sucesso', true,
    'ja_processado', false,
    'quantidade', p_quantidade,
    'ingressos_ids', to_jsonb(v_ingressos_ids),
    'mensagem', 'Ingressos e pagamentos processados com sucesso'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'sucesso', false,
    'erro', SQLERRM
  );
END;
$$;

-- 4. Função PostgreSQL para Processar Estornos e Cancelamentos
CREATE OR REPLACE FUNCTION public.processar_estorno_pagamento(
  p_gateway_transaction_id TEXT,
  p_novo_status TEXT DEFAULT 'refunded'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pagamento RECORD;
  v_qtd_cancelada INT := 0;
BEGIN
  -- Atualiza o status dos pagamentos correspondentes
  UPDATE pagamentos
  SET status = 'estornado'
  WHERE gateway_transaction_id = p_gateway_transaction_id;

  -- Atualiza o status dos ingressos de 'valido' para 'cancelado'
  -- O trigger 'ao_cancelar_ingresso' decrementa automaticamente a quantidade_vendida no lote
  FOR v_pagamento IN 
    SELECT ingresso_id FROM pagamentos WHERE gateway_transaction_id = p_gateway_transaction_id
  LOOP
    UPDATE ingressos
    SET status = 'cancelado'
    WHERE id = v_pagamento.ingresso_id AND status = 'valido';
    
    v_qtd_cancelada := v_qtd_cancelada + 1;
  END LOOP;

  -- Atualiza a transação processada
  UPDATE transacoes_processadas
  SET status = p_novo_status,
      atualizado_em = now()
  WHERE gateway_transaction_id = p_gateway_transaction_id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'ingressos_cancelados', v_qtd_cancelada,
    'gateway_transaction_id', p_gateway_transaction_id
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'sucesso', false,
    'erro', SQLERRM
  );
END;
$$;
