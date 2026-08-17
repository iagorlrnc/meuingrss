-- 023_fix_diretor_auth_duplicacao.sql
-- Solução definitiva para login de diretores ativos e eliminação de duplicata de atléticas

-- 1. Atualizar o gatilho para reutilizar atléticas existentes e definir role = 'diretor'
CREATE OR REPLACE FUNCTION public.criar_perfil_novo_usuario()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_nome TEXT;
  v_role TEXT := 'cliente';
  v_status TEXT := 'ativo';
  v_atletica_id UUID := NULL;
  v_atletica_nome TEXT;
  v_atletica_sigla TEXT;
  v_atletica_cidade TEXT;
  v_atletica_estado TEXT;
BEGIN
  v_nome := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'nome'), ''),
    SPLIT_PART(NEW.email, '@', 1)
  );

  -- Verifica se é cadastro de diretor
  IF (NEW.raw_user_meta_data->>'role' = 'diretor') OR (NEW.raw_user_meta_data->>'atletica_nome' IS NOT NULL) OR (NEW.raw_user_meta_data->>'atleticaNome' IS NOT NULL) THEN
    v_role := 'diretor';
    v_status := 'pendente';

    v_atletica_nome := COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'atletica_nome'), ''),
      NULLIF(TRIM(NEW.raw_user_meta_data->>'atleticaNome'), '')
    );
    v_atletica_sigla := COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'atletica_sigla'), ''),
      NULLIF(TRIM(NEW.raw_user_meta_data->>'atleticaSigla'), '')
    );
    v_atletica_cidade := COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'atletica_cidade'), ''),
      NULLIF(TRIM(NEW.raw_user_meta_data->>'atleticaCidade'), ''),
      'Palmas'
    );
    v_atletica_estado := COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'atletica_estado'), ''),
      NULLIF(TRIM(NEW.raw_user_meta_data->>'atleticaEstado'), ''),
      'TO'
    );

    IF v_atletica_nome IS NOT NULL THEN
      -- 1. Procura se a atlética já existe no banco (para evitar duplicatas)
      SELECT id INTO v_atletica_id
      FROM public.atleticas
      WHERE LOWER(nome) = LOWER(v_atletica_nome)
      ORDER BY criado_em DESC
      LIMIT 1;

      -- 2. Se não existir, cria a nova atlética pendente
      IF v_atletica_id IS NULL THEN
        INSERT INTO public.atleticas (nome, faculdade, cidade, estado, status)
        VALUES (
          v_atletica_nome,
          COALESCE(v_atletica_sigla, v_atletica_nome),
          v_atletica_cidade,
          v_atletica_estado,
          'pendente'
        )
        RETURNING id INTO v_atletica_id;
      END IF;
    END IF;
  END IF;

  -- Insere ou atualiza o perfil do usuário
  INSERT INTO public.profiles (
    id, nome, email, role, status, atletica_id, criado_em, atualizado_em
  )
  VALUES (
    NEW.id, v_nome, NEW.email, v_role, v_status, v_atletica_id, NOW(), NOW()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    nome = EXCLUDED.nome,
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    atletica_id = COALESCE(EXCLUDED.atletica_id, public.profiles.atletica_id),
    atualizado_em = NOW();

  RETURN NEW;
END;
$$;

-- 2. Reparo retroativo: Ativa perfil e atribui role = 'diretor' para usuários ativos vinculados a atléticas
UPDATE public.profiles p
SET 
  role = 'diretor',
  status = 'ativo'
WHERE p.atletica_id IS NOT NULL 
  AND p.role <> 'admin'
  AND p.status <> 'bloqueado';

-- 3. Limpeza de atléticas duplicadas avulsas no banco
DELETE FROM public.atleticas a1
WHERE a1.status = 'pendente'
  AND EXISTS (
    SELECT 1 FROM public.atleticas a2
    WHERE LOWER(a2.nome) = LOWER(a1.nome)
      AND a2.id <> a1.id
  );
