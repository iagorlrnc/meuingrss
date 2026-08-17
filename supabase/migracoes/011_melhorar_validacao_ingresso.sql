-- Migration 011: Melhorar função de validação de ingresso com UPDATE atômico
-- Substitui SELECT...FOR UPDATE + UPDATE separados por UPDATE...WHERE...RETURNING atômico
-- para eliminar race conditions em leituras concorrentes do mesmo QR code.

CREATE OR REPLACE FUNCTION public.validar_ingresso(
  p_qr_hash TEXT,
  p_evento_id UUID,
  p_validado_por UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ingresso RECORD;
  v_comprador_nome TEXT;
  v_lote_nome TEXT;
  v_role public.perfil_usuario;
  v_atletica_diretor UUID;
  v_atletica_evento UUID;
BEGIN
  -- 1. Verificar permissão do validador
  SELECT role, atletica_id INTO v_role, v_atletica_diretor
  FROM profiles
  WHERE id = p_validado_por;

  IF v_role IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Validador não encontrado.');
  END IF;

  SELECT atletica_id INTO v_atletica_evento
  FROM eventos
  WHERE id = p_evento_id;

  IF v_role = 'diretor' AND (v_atletica_diretor IS NULL OR v_atletica_diretor <> v_atletica_evento) THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Sem permissão para validar ingressos deste evento.');
  END IF;

  -- 2. UPDATE ATÔMICO condicional: só marca como utilizado se status = 'valido'
  --    Isso garante que em caso de duas leituras simultâneas, apenas uma consegue o UPDATE.
  UPDATE ingressos
  SET status = 'utilizado',
      data_validacao = now(),
      validado_por = p_validado_por
  WHERE qr_code_hash = p_qr_hash
    AND evento_id = p_evento_id
    AND status = 'valido'
  RETURNING * INTO v_ingresso;

  IF FOUND THEN
    -- Buscar nome do comprador e lote
    SELECT p.nome INTO v_comprador_nome FROM profiles p WHERE p.id = v_ingresso.comprador_id;
    SELECT l.nome_lote INTO v_lote_nome FROM lotes_ingresso l WHERE l.id = v_ingresso.lote_id;

    RETURN jsonb_build_object(
      'sucesso', true,
      'mensagem', 'Entrada validada com sucesso!',
      'nomeComprador', v_comprador_nome,
      'nomeLote', v_lote_nome,
      'dataValidacao', v_ingresso.data_validacao
    );
  END IF;

  -- 3. Se UPDATE não encontrou linhas, verificar o motivo
  SELECT i.*, p.nome as nome_comprador, l.nome_lote as nome_lote
  INTO v_ingresso
  FROM ingressos i
  JOIN profiles p ON p.id = i.comprador_id
  JOIN lotes_ingresso l ON l.id = i.lote_id
  WHERE i.qr_code_hash = p_qr_hash
    AND i.evento_id = p_evento_id;

  IF v_ingresso.id IS NULL THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'mensagem', 'QR Code inválido ou não pertence a este evento.'
    );
  END IF;

  IF v_ingresso.status = 'utilizado' THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'mensagem', 'Ingresso já utilizado!',
      'nomeComprador', v_ingresso.nome_comprador,
      'nomeLote', v_ingresso.nome_lote,
      'dataValidacao', v_ingresso.data_validacao
    );
  END IF;

  IF v_ingresso.status = 'cancelado' THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'mensagem', 'Ingresso cancelado.'
    );
  END IF;

  -- Fallback para status inesperado
  RETURN jsonb_build_object(
    'sucesso', false,
    'mensagem', 'Ingresso em status inválido para validação.'
  );
END;
$$;
