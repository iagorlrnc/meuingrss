-- 018_corrigir_solicitacoes_diretor.sql
-- CORREÇÃO: Permite que diretores se cadastrem e fiquem com status 'pendente' aguardando aprovação do Admin

-- 1. Atualizar a função do trigger para autorizar requisição de cadastro de Diretor (role='diretor', status='pendente')
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

  -- NENHUM usuário comum pode alterar seu próprio status para 'ativo' se a role for ou estiver mudando para 'diretor'
  IF NEW.role = 'diretor' AND NEW.status = 'ativo' AND OLD.status <> 'ativo' THEN
    NEW.status := OLD.status;
  END IF;

  -- PERMITE que um usuário solicite acesso de diretor (role = 'diretor' com status = 'pendente' e vincule sua atletica_id)
  IF NEW.role = 'diretor' AND NEW.status = 'pendente' THEN
    RETURN NEW;
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

-- 2. Atualizar a função de criação de perfil no auth.users para definir status 'pendente' quando role='diretor'
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
  v_atletica_id UUID;
  v_meta_role TEXT;
  v_meta_atletica TEXT;
BEGIN
  v_nome := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'nome'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    split_part(NEW.email, '@', 1)
  );

  v_meta_role := LOWER(TRIM(COALESCE(NEW.raw_user_meta_data->>'role', 'cliente')));
  IF v_meta_role IN ('diretor', 'admin', 'cliente') THEN
    v_role := v_meta_role::public.perfil_usuario;
  ELSE
    v_role := 'cliente'::public.perfil_usuario;
  END IF;

  IF v_role = 'diretor' THEN
    v_status := 'pendente'::public.status_usuario;
  ELSE
    v_status := 'ativo'::public.status_usuario;
  END IF;

  v_meta_atletica := TRIM(COALESCE(NEW.raw_user_meta_data->>'atletica_id', ''));
  IF v_meta_atletica ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_atletica_id := v_meta_atletica::UUID;
  ELSE
    v_atletica_id := NULL;
  END IF;

  INSERT INTO public.profiles (
    id,
    nome,
    email,
    role,
    atletica_id,
    status
  )
  VALUES (
    NEW.id,
    v_nome,
    NEW.email,
    v_role,
    v_atletica_id,
    v_status
  )
  ON CONFLICT (id) DO UPDATE SET
    nome = EXCLUDED.nome,
    email = EXCLUDED.email;

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

-- 3. Corrigir registros retroativos de diretores que criaram atléticas mas ficaram com role 'cliente' ou status 'ativo' sem aprovação
UPDATE public.profiles p
SET role = 'diretor',
    status = 'pendente'
FROM public.atleticas a
WHERE p.atletica_id = a.id
  AND a.status = 'pendente'
  AND (p.role <> 'diretor' OR p.status <> 'pendente');
