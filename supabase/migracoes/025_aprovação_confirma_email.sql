-- 025_aprovação_confirma_email.sql
-- Garante que quando o Administrador aprova uma solicitação de Diretor,
-- o e-mail seja marcado como confirmado em auth.users e o perfil ativado como 'diretor'.

CREATE OR REPLACE FUNCTION public.aprovar_diretor_e_atletica(
  p_perfil_id UUID,
  p_atletica_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
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
    SELECT COALESCE(
      NULLIF(TRIM(u.raw_user_meta_data->>'atletica_nome'), ''),
      NULLIF(TRIM(u.raw_user_meta_data->>'atleticaNome'), '')
    ) INTO v_nome_atl
    FROM auth.users u
    WHERE u.id = p_perfil_id;

    IF v_nome_atl IS NOT NULL THEN
      SELECT id INTO v_atl_id
      FROM public.atleticas
      WHERE status = 'pendente' AND (LOWER(nome) = LOWER(v_nome_atl) OR LOWER(faculdade) LIKE '%' || LOWER(v_nome_atl) || '%')
      ORDER BY criado_em DESC
      LIMIT 1;
    END IF;

    IF v_atl_id IS NULL THEN
      SELECT id INTO v_atl_id
      FROM public.atleticas
      WHERE status = 'pendente'
      ORDER BY criado_em DESC
      LIMIT 1;
    END IF;
  END IF;

  -- 3. Se achou ou já tinha a atlética, atualiza a EXISTENTE para 'ativa'
  IF v_atl_id IS NOT NULL THEN
    UPDATE public.atleticas
    SET status = 'ativa'
    WHERE id = v_atl_id;
  ELSE
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

  -- 5. Garante que o e-mail do usuário seja marcado como confirmado em auth.users para permitir o login direto
  UPDATE auth.users
  SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
  WHERE id = p_perfil_id;

  -- 6. Limpa qualquer outra atlética pendente duplicada com o mesmo nome que tenha sobrado
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
    'mensagem', 'Solicitação aprovada e e-mail confirmado com sucesso.'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'sucesso', false,
    'erro', SQLERRM
  );
END;
$$;

-- 7. Reparo retroativo: Confirma o e-mail de todos os diretores com status 'ativo' no auth.users
UPDATE auth.users u
SET email_confirmed_at = COALESCE(u.email_confirmed_at, NOW())
FROM public.profiles p
WHERE p.id = u.id
  AND p.status = 'ativo'
  AND (p.role = 'diretor' OR p.atletica_id IS NOT NULL);
