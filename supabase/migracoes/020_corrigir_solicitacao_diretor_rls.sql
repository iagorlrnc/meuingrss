-- 020_corrigir_solicitacao_diretor_rls.sql
-- CORREÇÃO DEFINITIVA DE SEGURANÇA E FLUXO: Solução para Cadastro de Diretor e Aprovação no Painel de Admin

-- 1. Atualizar o trigger de segurança para permitir que o usuário solicite role 'diretor' com status 'pendente'
CREATE OR REPLACE FUNCTION public.proteger_campos_sensiveis_perfil()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Se a operação for executada pelo service_role ou por um admin, permite qualquer alteração
  IF (current_setting('role', true) = 'service_role') OR (public.obter_role_usuario(auth.uid()) = 'admin') THEN
    RETURN NEW;
  END IF;

  -- NENHUM usuário comum pode se auto-promover a 'admin'
  IF NEW.role = 'admin' AND OLD.role <> 'admin' THEN
    NEW.role := OLD.role;
  END IF;

  -- PERMITE que um usuário solicite transição/cadastro para diretor (role = 'diretor' com status = 'pendente')
  IF NEW.role = 'diretor' AND NEW.status = 'pendente' THEN
    RETURN NEW;
  END IF;

  -- NENHUM usuário comum pode alterar seu próprio status para 'ativo' se a role for ou estiver mudando para 'diretor'
  IF NEW.role = 'diretor' AND NEW.status = 'ativo' AND OLD.status <> 'ativo' THEN
    NEW.status := OLD.status;
  END IF;

  -- Para outras alterações não autorizadas em campos sensíveis, previne a modificação
  IF NEW.role <> OLD.role THEN
    NEW.role := OLD.role;
  END IF;

  IF NEW.status <> OLD.status THEN
    NEW.status := OLD.status;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Atualizar o trigger de criação de perfil no signup auth.users
CREATE OR REPLACE FUNCTION public.criar_perfil_novo_usuario()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_nome TEXT;
  v_role public.perfil_usuario;
  v_status public.status_usuario;
  v_atletica_id UUID := NULL;
  v_meta_role TEXT;
  v_meta_atletica_id TEXT;
  v_meta_atletica_nome TEXT;
  v_meta_atletica_sigla TEXT;
  v_meta_atletica_cidade TEXT;
  v_meta_atletica_estado TEXT;
BEGIN
  v_nome := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'nome'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    split_part(NEW.email, '@', 1)
  );

  v_meta_role := LOWER(TRIM(COALESCE(NEW.raw_user_meta_data->>'role', 'cliente')));
  IF v_meta_role IN ('diretor', 'cliente') THEN
    v_role := v_meta_role::public.perfil_usuario;
  ELSE
    v_role := 'cliente'::public.perfil_usuario;
  END IF;

  IF v_role = 'diretor' THEN
    v_status := 'pendente'::public.status_usuario;
  ELSE
    v_status := 'ativo'::public.status_usuario;
  END IF;

  -- 1. Tenta resgatar atletica_id diretamente caso exista
  v_meta_atletica_id := TRIM(COALESCE(NEW.raw_user_meta_data->>'atletica_id', NEW.raw_user_meta_data->>'atleticaId', ''));
  IF v_meta_atletica_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_atletica_id := v_meta_atletica_id::UUID;
  END IF;

  -- 2. Se for Diretor e NÃO tiver atletica_id, mas tiver nome de atlética nos metadados, cria a atlética pendente automaticamente
  IF v_role = 'diretor' AND v_atletica_id IS NULL THEN
    v_meta_atletica_nome := COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'atletica_nome'), ''),
      NULLIF(TRIM(NEW.raw_user_meta_data->>'atleticaNome'), '')
    );

    v_meta_atletica_sigla := COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'atletica_sigla'), ''),
      NULLIF(TRIM(NEW.raw_user_meta_data->>'atleticaSigla'), '')
    );

    v_meta_atletica_cidade := COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'atletica_cidade'), ''),
      NULLIF(TRIM(NEW.raw_user_meta_data->>'atleticaCidade'), ''),
      'Não informada'
    );

    v_meta_atletica_estado := COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'atletica_estado'), ''),
      NULLIF(TRIM(NEW.raw_user_meta_data->>'atleticaEstado'), ''),
      'TO'
    );

    IF v_meta_atletica_nome IS NOT NULL THEN
      INSERT INTO public.atleticas (
        nome,
        faculdade,
        cidade,
        estado,
        status
      )
      VALUES (
        v_meta_atletica_nome,
        CASE
          WHEN v_meta_atletica_sigla IS NOT NULL 
          THEN v_meta_atletica_nome || ' (' || v_meta_atletica_sigla || ')'
          ELSE v_meta_atletica_nome
        END,
        v_meta_atletica_cidade,
        v_meta_atletica_estado,
        'pendente'
      )
      RETURNING id INTO v_atletica_id;
    END IF;
  END IF;

  -- 3. Insere ou atualiza o perfil no public.profiles
  INSERT INTO public.profiles (
    id,
    nome,
    email,
    role,
    atletica_id,
    status,
    telefone,
    cpf
  )
  VALUES (
    NEW.id,
    v_nome,
    NEW.email,
    v_role,
    v_atletica_id,
    v_status,
    COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'telefone'), ''), NULL),
    COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'cpf'), ''), NULL)
  )
  ON CONFLICT (id) DO UPDATE SET
    nome = EXCLUDED.nome,
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    atletica_id = COALESCE(EXCLUDED.atletica_id, profiles.atletica_id),
    telefone = COALESCE(EXCLUDED.telefone, profiles.telefone),
    cpf = COALESCE(EXCLUDED.cpf, profiles.cpf);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.profiles (id, nome, email, role, status)
  VALUES (
    NEW.id,
    COALESCE(split_part(NEW.email, '@', 1), 'Usuario'),
    NEW.email,
    'cliente'::public.perfil_usuario,
    'ativo'::public.status_usuario
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- 3. Reparo retroativo: Atualiza perfis de usuários que tentaram se cadastrar como diretores ou estão vinculados a atléticas pendentes
DO $$
DECLARE
  r RECORD;
  v_new_atl_id UUID;
  v_nome_atl TEXT;
BEGIN
  -- A) Caso 1: Usuários que estão vinculados a uma atlética pendente mas continuaram como role 'cliente' ou status 'ativo'
  UPDATE public.profiles p
  SET role = 'diretor',
      status = 'pendente'
  FROM public.atleticas a
  WHERE p.atletica_id = a.id
    AND a.status = 'pendente'
    AND (p.role <> 'diretor' OR p.status <> 'pendente');

  -- B) Caso 2: Usuários com metadata de atlética em auth.users mas sem atletica_id no perfil
  FOR r IN 
    SELECT p.id, p.nome, u.raw_user_meta_data
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE (
      (u.raw_user_meta_data->>'role' = 'diretor') OR 
      (u.raw_user_meta_data->>'atletica_nome' IS NOT NULL) OR 
      (u.raw_user_meta_data->>'atleticaNome' IS NOT NULL)
    )
    AND p.atletica_id IS NULL
  LOOP
    v_nome_atl := COALESCE(
      NULLIF(TRIM(r.raw_user_meta_data->>'atletica_nome'), ''),
      NULLIF(TRIM(r.raw_user_meta_data->>'atleticaNome'), ''),
      'Atlética de ' || COALESCE(r.nome, 'Diretor')
    );

    INSERT INTO public.atleticas (nome, faculdade, cidade, estado, status)
    VALUES (
      v_nome_atl,
      v_nome_atl,
      COALESCE(NULLIF(TRIM(r.raw_user_meta_data->>'atletica_cidade'), ''), 'Palmas'),
      COALESCE(NULLIF(TRIM(r.raw_user_meta_data->>'atletica_estado'), ''), 'TO'),
      'pendente'
    )
    RETURNING id INTO v_new_atl_id;

    UPDATE public.profiles
    SET role = 'diretor',
        status = 'pendente',
        atletica_id = v_new_atl_id
    WHERE id = r.id;
  END LOOP;
END;
$$;
