-- ==============================================================================
-- Migração 026: Reconstrução Definitiva da Arquitetura de Pagamentos e Pedidos
--
-- Objetivos:
-- 1. Criação/Atualização segura da tabela canônica 'pedidos' (orders)
-- 2. Criação da tabela 'webhook_logs' para auditoria detalhada de notificações
-- 3. Resolução definitiva do conflito de sobrecarga RPC (PGRST203)
-- 4. Função atômica 'processar_pagamento_aprovado' (ACID)
-- 5. Função dedicada 'reconciliar_pagamento_orfao' para pagamentos históricos
-- 6. Blindagem rigorosa de RLS (zero INSERT/UPDATE client-side em pedidos/ingressos)
-- ==============================================================================

-- 1. TABELA CANÔNICA DE PEDIDOS
CREATE TABLE IF NOT EXISTS public.pedidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comprador_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  evento_id UUID NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
  lote_id UUID NOT NULL REFERENCES public.lotes_ingresso(id) ON DELETE CASCADE,
  quantidade INTEGER NOT NULL DEFAULT 1 CHECK (quantidade > 0 AND quantidade <= 10),
  valor_unitario DECIMAL(10, 2) NOT NULL DEFAULT 0,
  taxa_servico DECIMAL(10, 2) NOT NULL DEFAULT 0,
  valor_total DECIMAL(10, 2) NOT NULL DEFAULT 0,
  status public.status_pagamento NOT NULL DEFAULT 'pendente',
  gateway_payment_id TEXT,
  gateway_transaction_id TEXT,
  metodo_pagamento TEXT,
  preference_id TEXT,
  external_reference TEXT,
  expira_em TIMESTAMPTZ,
  pago_em TIMESTAMPTZ,
  metadados JSONB,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.1 Garante que todas as colunas existam caso a tabela 'pedidos' já existisse com esquema anterior
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS valor_unitario DECIMAL(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS taxa_servico DECIMAL(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS valor_total DECIMAL(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS gateway_payment_id TEXT;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS gateway_transaction_id TEXT;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS metodo_pagamento TEXT;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS preference_id TEXT;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS external_reference TEXT;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS expira_em TIMESTAMPTZ;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS pago_em TIMESTAMPTZ;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS metadados JSONB;

-- 2. TABELA DE AUDITORIA DE WEBHOOKS
CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway TEXT NOT NULL DEFAULT 'mercadopago',
  tipo_evento TEXT,
  acao TEXT,
  data_id TEXT,
  request_id TEXT,
  assinatura TEXT,
  payload JSONB,
  status_resposta INTEGER,
  resultado TEXT,
  erro TEXT,
  ip TEXT,
  duracao_ms INTEGER,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. ÍNDICES DE PERFORMANCE E CONSULTA
CREATE INDEX IF NOT EXISTS idx_pedidos_comprador ON public.pedidos(comprador_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_evento ON public.pedidos(evento_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_lote ON public.pedidos(lote_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_status ON public.pedidos(status);
CREATE INDEX IF NOT EXISTS idx_pedidos_gateway_payment ON public.pedidos(gateway_payment_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_gateway_transaction ON public.pedidos(gateway_transaction_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_preference ON public.pedidos(preference_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_criado_em ON public.pedidos(criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_data_id ON public.webhook_logs(data_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_tipo_evento ON public.webhook_logs(tipo_evento);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_criado_em ON public.webhook_logs(criado_em DESC);

-- Trigger de atualização de timestamp para pedidos
DROP TRIGGER IF EXISTS ao_atualizar_pedido ON public.pedidos;
CREATE TRIGGER ao_atualizar_pedido
  BEFORE UPDATE ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.atualizar_timestamp();

-- 4. ELIMINAÇÃO DE TODAS AS FUNÇÕES SOBRECARREGADAS LEGADAS (Correção PGRST203)
DO $$
BEGIN
  DROP FUNCTION IF EXISTS public.processar_pagamento_aprovado(TEXT, UUID, UUID, UUID, INT, NUMERIC, TEXT, TEXT[]);
  DROP FUNCTION IF EXISTS public.processar_pagamento_aprovado(TEXT, UUID, UUID, UUID, INT, NUMERIC, TEXT, TEXT[], TEXT);
  DROP FUNCTION IF EXISTS public.processar_pagamento_aprovado(UUID, TEXT, TEXT, TEXT[]);
  DROP FUNCTION IF EXISTS public.processar_estorno_pagamento(TEXT, TEXT);
  DROP FUNCTION IF EXISTS public.reconciliar_pagamento_orfao(TEXT, UUID, UUID, UUID, INT, NUMERIC, TEXT, TEXT[]);
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 5. FUNÇÃO ATÔMICA CANÔNICA: PROCESSAR PAGAMENTO APROVADO
CREATE OR REPLACE FUNCTION public.processar_pagamento_aprovado(
  p_pedido_id UUID,
  p_gateway_payment_id TEXT,
  p_metodo_pagamento TEXT,
  p_qr_hashes TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pedido RECORD;
  v_lote RECORD;
  v_i INT;
  v_ingresso_id UUID;
  v_ingressos_ids UUID[] := ARRAY[]::UUID[];
  v_qtd_hashes INT;
BEGIN
  -- 5.1 Bloqueio e Consulta do Pedido
  SELECT * INTO v_pedido
  FROM public.pedidos
  WHERE id = p_pedido_id
  FOR UPDATE;

  IF v_pedido.id IS NULL THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'erro', 'Pedido não encontrado no sistema'
    );
  END IF;

  -- Checagem de Idempotência: Se já aprovado E os ingressos existem no banco
  IF v_pedido.status = 'aprovado' THEN
    SELECT array_agg(i.id) INTO v_ingressos_ids
    FROM public.ingressos i
    JOIN public.pagamentos pag ON pag.ingresso_id = i.id
    WHERE pag.gateway_transaction_id = p_gateway_payment_id
       OR (i.comprador_id = v_pedido.comprador_id AND i.lote_id = v_pedido.lote_id AND i.evento_id = v_pedido.evento_id);

    IF v_ingressos_ids IS NOT NULL AND array_length(v_ingressos_ids, 1) >= v_pedido.quantidade THEN
      RETURN jsonb_build_object(
        'sucesso', true,
        'ja_processado', true,
        'pedido_id', v_pedido.id,
        'ingressos_ids', to_jsonb(v_ingressos_ids),
        'mensagem', 'Pagamento já processado e aprovado anteriormente'
      );
    END IF;
    -- Caso os ingressos ainda não tenham sido inseridos, prossegue para gerá-los abaixo
  END IF;

  -- 5.2 Validação da quantidade de Hashes
  v_qtd_hashes := array_length(p_qr_hashes, 1);
  IF v_qtd_hashes IS NULL OR v_qtd_hashes < v_pedido.quantidade THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'erro', 'Quantidade insuficiente de hashes de QR code fornecida'
    );
  END IF;

  -- 5.3 Bloqueio e Validação do Lote de Ingressos + Proteção Anti-Sobrevenda
  SELECT * INTO v_lote
  FROM public.lotes_ingresso
  WHERE id = v_pedido.lote_id
  FOR UPDATE;

  IF v_lote.id IS NULL THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'erro', 'Lote de ingressos não encontrado'
    );
  END IF;

  -- Trava Anti-Sobrevenda (Anti-Overselling)
  IF (v_lote.quantidade_vendida + v_pedido.quantidade) > v_lote.quantidade_total THEN
    UPDATE public.pedidos
    SET status = 'estoque_esgotado',
        gateway_payment_id = p_gateway_payment_id,
        gateway_transaction_id = p_gateway_payment_id,
        metodo_pagamento = p_metodo_pagamento,
        atualizado_em = now()
    WHERE id = v_pedido.id;

    RETURN jsonb_build_object(
      'sucesso', false,
      'erro', 'estoque_esgotado',
      'motivo', 'A quantidade total de ingressos deste lote foi esgotada durante o processamento'
    );
  END IF;

  -- 5.4 Atualiza o status do Pedido para 'aprovado'
  UPDATE public.pedidos
  SET status = 'aprovado',
      gateway_payment_id = p_gateway_payment_id,
      gateway_transaction_id = p_gateway_payment_id,
      metodo_pagamento = p_metodo_pagamento,
      pago_em = now(),
      atualizado_em = now()
  WHERE id = v_pedido.id;

  -- 5.5 Inserção dos Ingressos e Pagamentos Vinculados
  FOR v_i IN 1..v_pedido.quantidade LOOP
    INSERT INTO public.ingressos (
      evento_id,
      lote_id,
      comprador_id,
      qr_code_hash,
      status,
      data_compra
    ) VALUES (
      v_pedido.evento_id,
      v_pedido.lote_id,
      v_pedido.comprador_id,
      p_qr_hashes[v_i],
      'valido',
      now()
    ) RETURNING id INTO v_ingresso_id;

    v_ingressos_ids := array_append(v_ingressos_ids, v_ingresso_id);

    INSERT INTO public.pagamentos (
      ingresso_id,
      valor,
      status,
      gateway_transaction_id,
      metodo_pagamento,
      criado_em
    ) VALUES (
      v_ingresso_id,
      v_pedido.valor_unitario,
      'aprovado',
      p_gateway_payment_id,
      p_metodo_pagamento,
      now()
    );
  END LOOP;

  -- 5.6 Registrar Notificação In-App ao Comprador
  INSERT INTO public.notificacoes_cliente (
    usuario_id,
    titulo,
    mensagem,
    tipo,
    dados
  ) VALUES (
    v_pedido.comprador_id,
    'Ingresso(s) Liberado(s)!',
    v_pedido.quantidade || ' ingresso(s) confirmado(s) com sucesso.',
    'ingresso_liberado',
    jsonb_build_object(
      'pedido_id', v_pedido.id,
      'evento_id', v_pedido.evento_id,
      'lote_id', v_pedido.lote_id,
      'quantidade', v_pedido.quantidade,
      'gateway_payment_id', p_gateway_payment_id
    )
  );

  RETURN jsonb_build_object(
    'sucesso', true,
    'ja_processado', false,
    'pedido_id', v_pedido.id,
    'quantidade', v_pedido.quantidade,
    'ingressos_ids', to_jsonb(v_ingressos_ids),
    'mensagem', 'Pagamento aprovado e ingressos liberados com sucesso'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'sucesso', false,
    'erro', SQLERRM
  );
END;
$$;

-- 6. FUNÇÃO DE RECONCILIAÇÃO PARA PAGAMENTOS ÓRFÃOS (Sem ambiguidade)
CREATE OR REPLACE FUNCTION public.reconciliar_pagamento_orfao(
  p_gateway_payment_id TEXT,
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
  v_pedido_existente RECORD;
  v_novo_pedido_id UUID;
  v_i INT;
  v_ingresso_id UUID;
  v_ingressos_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  -- 6.1 Verifica se já existe pagamento com este gateway_payment_id
  SELECT id INTO v_pedido_existente
  FROM public.pedidos
  WHERE gateway_payment_id = p_gateway_payment_id
     OR gateway_transaction_id = p_gateway_payment_id;

  IF v_pedido_existente.id IS NOT NULL THEN
    SELECT array_agg(i.id) INTO v_ingressos_ids
    FROM public.ingressos i
    JOIN public.pagamentos pag ON pag.ingresso_id = i.id
    WHERE pag.gateway_transaction_id = p_gateway_payment_id;

    IF v_ingressos_ids IS NOT NULL AND array_length(v_ingressos_ids, 1) >= p_quantidade THEN
      RETURN jsonb_build_object(
        'sucesso', true,
        'ja_processado', true,
        'pedido_id', v_pedido_existente.id,
        'ingressos_ids', to_jsonb(v_ingressos_ids),
        'mensagem', 'Pagamento já havia sido reconciliado anteriormente'
      );
    END IF;
  END IF;

  -- 6.2 Cria o pedido diretamente como 'aprovado'
  INSERT INTO public.pedidos (
    comprador_id,
    evento_id,
    lote_id,
    quantidade,
    valor_unitario,
    taxa_servico,
    valor_total,
    status,
    gateway_payment_id,
    gateway_transaction_id,
    metodo_pagamento,
    pago_em
  ) VALUES (
    p_comprador_id,
    p_evento_id,
    p_lote_id,
    p_quantidade,
    p_valor_unitario,
    0,
    p_valor_unitario * p_quantidade,
    'aprovado',
    p_gateway_payment_id,
    p_gateway_payment_id,
    p_metodo_pagamento,
    now()
  ) RETURNING id INTO v_novo_pedido_id;

  -- 6.3 Insere Ingressos e Pagamentos
  FOR v_i IN 1..p_quantidade LOOP
    INSERT INTO public.ingressos (
      evento_id,
      lote_id,
      comprador_id,
      qr_code_hash,
      status,
      data_compra
    ) VALUES (
      p_evento_id,
      p_lote_id,
      p_comprador_id,
      p_qr_hashes[v_i],
      'valido',
      now()
    ) RETURNING id INTO v_ingresso_id;

    v_ingressos_ids := array_append(v_ingressos_ids, v_ingresso_id);

    INSERT INTO public.pagamentos (
      ingresso_id,
      valor,
      status,
      gateway_transaction_id,
      metodo_pagamento,
      criado_em
    ) VALUES (
      v_ingresso_id,
      p_valor_unitario,
      'aprovado',
      p_gateway_payment_id,
      p_metodo_pagamento,
      now()
    );
  END LOOP;

  RETURN jsonb_build_object(
    'sucesso', true,
    'ja_processado', false,
    'pedido_id', v_novo_pedido_id,
    'ingressos_ids', to_jsonb(v_ingressos_ids),
    'mensagem', 'Pagamento órfão recuperado com sucesso'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'sucesso', false,
    'erro', SQLERRM
  );
END;
$$;

-- 7. FUNÇÃO DE PROCESSAMENTO DE ESTORNO / CANCELAMENTO
CREATE OR REPLACE FUNCTION public.processar_estorno_pagamento(
  p_gateway_payment_id TEXT,
  p_novo_status TEXT DEFAULT 'estornado'
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
  -- Atualiza o pedido
  UPDATE public.pedidos
  SET status = 'estornado',
      atualizado_em = now()
  WHERE gateway_payment_id = p_gateway_payment_id
     OR gateway_transaction_id = p_gateway_payment_id;

  -- Atualiza os pagamentos correspondentes
  UPDATE public.pagamentos
  SET status = 'estornado'
  WHERE gateway_transaction_id = p_gateway_payment_id;

  -- Atualiza o status dos ingressos de 'valido' para 'cancelado'
  FOR v_pagamento IN 
    SELECT ingresso_id FROM public.pagamentos WHERE gateway_transaction_id = p_gateway_payment_id
  LOOP
    UPDATE public.ingressos
    SET status = 'cancelado'
    WHERE id = v_pagamento.ingresso_id AND status = 'valido';
    
    v_qtd_cancelada := v_qtd_cancelada + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'sucesso', true,
    'ingressos_cancelados', v_qtd_cancelada,
    'gateway_payment_id', p_gateway_payment_id
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'sucesso', false,
    'erro', SQLERRM
  );
END;
$$;

-- 8. POLÍTICAS DE RLS SEGURAS E RESTRITAS

-- Habilita RLS nas tabelas
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

-- Limpa policies antigas
DROP POLICY IF EXISTS "pedidos_select_proprio" ON public.pedidos;
DROP POLICY IF EXISTS "pedidos_select_admin" ON public.pedidos;
DROP POLICY IF EXISTS "pedidos_select_diretor" ON public.pedidos;
DROP POLICY IF EXISTS "webhook_logs_select_admin" ON public.webhook_logs;

-- SELECT em pedidos: Cliente vê apenas seus próprios pedidos
CREATE POLICY "pedidos_select_proprio"
  ON public.pedidos FOR SELECT
  USING (comprador_id = auth.uid());

-- SELECT em pedidos: Admin vê todos
CREATE POLICY "pedidos_select_admin"
  ON public.pedidos FOR SELECT
  USING (public.obter_role_usuario(auth.uid()) = 'admin');

-- SELECT em pedidos: Diretor vê pedidos dos eventos da sua atlética
CREATE POLICY "pedidos_select_diretor"
  ON public.pedidos FOR SELECT
  USING (
    public.obter_role_usuario(auth.uid()) = 'diretor'
    AND EXISTS (
      SELECT 1 FROM public.eventos e
      WHERE e.id = pedidos.evento_id
      AND e.atletica_id = public.obter_atletica_usuario(auth.uid())
    )
  );

-- Webhook logs: Somente admin visualiza
CREATE POLICY "webhook_logs_select_admin"
  ON public.webhook_logs FOR SELECT
  USING (public.obter_role_usuario(auth.uid()) = 'admin');

-- Blindagem de INGRESSOS: Remove qualquer policy permissiva de INSERT client-side
DROP POLICY IF EXISTS "Inserir ingresso via service" ON public.ingressos;
DROP POLICY IF EXISTS "ingressos_insert_service" ON public.ingressos;

-- Blindagem de PAGAMENTOS: Remove qualquer policy permissiva de INSERT/UPDATE client-side
DROP POLICY IF EXISTS "Inserir pagamento via service" ON public.pagamentos;
DROP POLICY IF EXISTS "pagamentos_insert_service" ON public.pagamentos;
DROP POLICY IF EXISTS "Atualizar pagamento via service" ON public.pagamentos;
DROP POLICY IF EXISTS "pagamentos_update_service" ON public.pagamentos;
