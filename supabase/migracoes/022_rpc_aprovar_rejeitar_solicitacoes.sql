-- 022_rpc_aprovar_rejeitar_solicitacoes.sql
-- Funções SECURITY DEFINER para Aprovação e Rejeição de Diretores e Atléticas no Painel de Administração sem duplicar registros

-- 1. Função para Aprovação de Solicitação (Reutiliza a Atlética Pendente Existente)
CREATE OR REPLACE FUNCTION public.aprovar_diretor_e_atletica(
  p_perfil_id UUID,
  p_atletica_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_atl_id UUID := p_atletica_id;
  v_nome_diretor TEXT;
  v_nome_atl TEXT;
BEGIN
  -- 1. Tenta resgatar a atletica_id do perfil se não tiver sido informada
  IF v_atl_id IS NULL THEN
    SELECT atletica_id, nome INTO v_atl_id, v_nome_diretor
    FROM public.profiles
    WHERE id = p_perfil_id;
  END IF;

  -- 2. Se a atletica_id ainda for NULL, procura por uma atlética pendente no banco (evita criar duplicatas)
  IF v_atl_id IS NULL THEN
    -- Busca nos metadados do usuário auth
    SELECT COALESCE(
      NULLIF(TRIM(u.raw_user_meta_data->>'atletica_nome'), ''),
      NULLIF(TRIM(u.raw_user_meta_data->>'atleticaNome'), '')
    ) INTO v_nome_atl
    FROM auth.users u
    WHERE u.id = p_perfil_id;

    -- Tenta encontrar a atlética pendente com esse nome
    IF v_nome_atl IS NOT NULL THEN
      SELECT id INTO v_atl_id
      FROM public.atleticas
      WHERE status = 'pendente' AND (LOWER(nome) = LOWER(v_nome_atl) OR LOWER(faculdade) LIKE '%' || LOWER(v_nome_atl) || '%')
      ORDER BY id DESC
      LIMIT 1;
    END IF;

    -- Se não achou por nome, resgata a atlética pendente mais recente não ativada
    IF v_atl_id IS NULL THEN
      SELECT id INTO v_atl_id
      FROM public.atleticas
      WHERE status = 'pendente'
      ORDER BY id DESC
      LIMIT 1;
    END IF;
  END IF;

  -- 3. Se achou ou já tinha a atlética, atualiza a EXISTENTE para 'ativa'
  IF v_atl_id IS NOT NULL THEN
    UPDATE public.atleticas
    SET status = 'ativa'
    WHERE id = v_atl_id;
  ELSE
    -- Apenas se NÃO existir nenhuma atlética pendente no banco, cria uma nova
    SELECT nome INTO v_nome_diretor FROM public.profiles WHERE id = p_perfil_id;
    v_nome_atl := COALESCE('Atlética de ' || v_nome_diretor, 'Nova Atlética');
    
    INSERT INTO public.atleticas (nome, faculdade, cidade, estado, status)
    VALUES (v_nome_atl, v_nome_atl, 'Palmas', 'TO', 'ativa')
    RETURNING id INTO v_atl_id;
  END IF;

  -- 4. Atualiza o perfil do Diretor para status 'ativo' e role 'diretor' vinculando a atlética
  UPDATE public.profiles
  SET 
    status = 'ativo',
    role = 'diretor',
    atletica_id = v_atl_id,
    atualizado_em = NOW()
  WHERE id = p_perfil_id;

  -- 5. Limpa qualquer outra atlética pendente duplicada com o mesmo nome que tenha sobrado
  DELETE FROM public.atleticas a1
  WHERE a1.status = 'pendente'
    AND EXISTS (
      SELECT 1 FROM public.atleticas a2
      WHERE a2.id = v_atl_id
        AND LOWER(a2.nome) = LOWER(a1.nome)
        AND a2.id <> a1.id
    );

  RETURN jsonb_build_object(
    'sucesso', true,
    'atletica_id', v_atl_id,
    'mensagem', 'Solicitação aprovada com sucesso.'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'sucesso', false,
    'erro', SQLERRM
  );
END;
$$;

-- 2. Função para Rejeição / Recusa de Solicitação
CREATE OR REPLACE FUNCTION public.rejeitar_diretor_e_atletica(
  p_perfil_id UUID,
  p_atletica_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_atl_id UUID := p_atletica_id;
BEGIN
  IF v_atl_id IS NULL THEN
    SELECT atletica_id INTO v_atl_id
    FROM public.profiles
    WHERE id = p_perfil_id;
  END IF;

  -- Se a atlética existir, desativa
  IF v_atl_id IS NOT NULL THEN
    UPDATE public.atleticas
    SET status = 'inativa'
    WHERE id = v_atl_id;
  END IF;

  -- Bloqueia o perfil do Diretor
  UPDATE public.profiles
  SET 
    status = 'bloqueado',
    atualizado_em = NOW()
  WHERE id = p_perfil_id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'mensagem', 'Solicitação recusada com sucesso.'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'sucesso', false,
    'erro', SQLERRM
  );
END;
$$;

-- 3. Limpeza retroativa de atléticas pendentes duplicadas que possuem versão ativa correspondente
DELETE FROM public.atleticas a1
WHERE a1.status = 'pendente'
  AND EXISTS (
    SELECT 1 FROM public.atleticas a2
    WHERE a2.status = 'ativa'
      AND LOWER(a2.nome) = LOWER(a1.nome)
      AND a2.id <> a1.id
  );
