-- 024_fix_database_error_saving_user.sql
-- Solução definitiva para "Database error saving new user" na verificação de e-mail e cadastro Supabase Auth

CREATE OR REPLACE FUNCTION public.criar_perfil_novo_usuario()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_nome TEXT;
  v_role public.perfil_usuario := 'cliente'::public.perfil_usuario;
  v_status public.status_usuario := 'ativo'::public.status_usuario;
  v_atletica_id UUID := NULL;
  v_atletica_nome TEXT;
  v_atletica_sigla TEXT;
  v_atletica_cidade TEXT;
  v_atletica_estado TEXT;
  v_meta_role TEXT;
BEGIN
  -- 1. Resgata o nome do usuário
  v_nome := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'nome'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    SPLIT_PART(NEW.email, '@', 1)
  );

  -- 2. Determina o papel (role) e status
  v_meta_role := LOWER(TRIM(COALESCE(NEW.raw_user_meta_data->>'role', 'cliente')));
  
  IF (v_meta_role = 'diretor') OR (NEW.raw_user_meta_data->>'atletica_nome' IS NOT NULL) OR (NEW.raw_user_meta_data->>'atleticaNome' IS NOT NULL) THEN
    v_role := 'diretor'::public.perfil_usuario;
    v_status := 'pendente'::public.status_usuario;

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
      -- Procura se a atlética já existe no banco
      SELECT id INTO v_atletica_id
      FROM public.atleticas
      WHERE LOWER(nome) = LOWER(v_atletica_nome)
      ORDER BY criado_em DESC
      LIMIT 1;

      -- Se não existir, insere uma nova atlética pendente
      IF v_atletica_id IS NULL THEN
        INSERT INTO public.atleticas (nome, faculdade, cidade, estado, status)
        VALUES (
          v_atletica_nome,
          COALESCE(v_atletica_sigla, v_atletica_nome),
          v_atletica_cidade,
          v_atletica_estado,
          'pendente'::public.status_atletica
        )
        RETURNING id INTO v_atletica_id;
      END IF;
    END IF;
  ELSE
    v_role := 'cliente'::public.perfil_usuario;
    v_status := 'ativo'::public.status_usuario;
  END IF;

  -- 3. Insere ou atualiza o perfil em public.profiles
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
EXCEPTION WHEN OTHERS THEN
  -- Previne que erros colaterais no gatilho impeçam a confirmação do e-mail / salvamento do usuário
  RAISE WARNING 'Erro ao criar perfil automaticamente para usuário %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;
