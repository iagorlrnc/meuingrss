-- 016_correcoes_seguranca_auditoria.sql
-- CORREÇÕES DE SEGURANÇA CRÍTICAS identificadas na auditoria pré-deploy
--
-- CRIT-02: Bloqueia atribuição de role 'admin' via signup (trigger)
-- CRIT-03: Restringe SELECT em profiles para evitar vazamento de PII
-- CRIT-03: Restringe INSERT em profiles e atleticas
-- HIGH-05: Restringe UPDATE em pagamentos (impede fraude)

-- =============================================
-- CRIT-02: CORRIGIR TRIGGER DE CRIAÇÃO DE PERFIL
-- O trigger anterior aceitava role='admin' via raw_user_meta_data,
-- permitindo que qualquer pessoa se auto-promovesse a admin no signup.
-- =============================================

CREATE OR REPLACE FUNCTION public.criar_perfil_novo_usuario()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_nome TEXT;
  v_role public.perfil_usuario;
  v_atletica_id UUID;
  v_meta_role TEXT;
  v_meta_atletica TEXT;
BEGIN
  
  v_nome := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'nome'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    split_part(NEW.email, '@', 1)
  );

  -- CORREÇÃO DE SEGURANÇA: Aceitar APENAS 'cliente' ou 'diretor' via signup.
  -- O role 'admin' NUNCA pode ser atribuído via auto-cadastro.
  v_meta_role := LOWER(TRIM(COALESCE(NEW.raw_user_meta_data->>'role', 'cliente')));
  IF v_meta_role IN ('diretor', 'cliente') THEN
    v_role := v_meta_role::public.perfil_usuario;
  ELSE
    v_role := 'cliente'::public.perfil_usuario;
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
    'ativo'::public.status_usuario
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

-- =============================================
-- CRIT-03: CORRIGIR POLICIES DE PROFILES (SELECT + INSERT)
-- A policy anterior tinha USING(true) que expunha PII de todos os usuários.
-- =============================================

-- Remover policies anteriores inseguras
DROP POLICY IF EXISTS "profiles_select_geral" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_geral" ON profiles;

-- SELECT: Usuário vê o próprio perfil
CREATE POLICY "profiles_select_proprio"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- SELECT: Admin vê todos os perfis
CREATE POLICY "profiles_select_admin"
  ON profiles FOR SELECT
  USING (public.obter_role_usuario(auth.uid()) = 'admin');

-- SELECT: Diretor vê perfis de compradores dos eventos da sua atlética
CREATE POLICY "profiles_select_diretor_compradores"
  ON profiles FOR SELECT
  USING (
    public.obter_role_usuario(auth.uid()) = 'diretor'
    AND EXISTS (
      SELECT 1 FROM ingressos i
      JOIN eventos e ON e.id = i.evento_id
      WHERE i.comprador_id = profiles.id
      AND e.atletica_id = public.obter_atletica_usuario(auth.uid())
    )
  );

-- INSERT: Apenas o próprio usuário pode inserir seu perfil (signup) ou via service_role
CREATE POLICY "profiles_insert_seguro"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- =============================================
-- CRIT-03: CORRIGIR POLICY DE INSERT EM ATLETICAS
-- A policy anterior tinha WITH CHECK(true) sem restrição.
-- =============================================

DROP POLICY IF EXISTS "atleticas_insert" ON atleticas;

-- INSERT: Apenas usuários autenticados podem criar atléticas
CREATE POLICY "atleticas_insert_autenticado"
  ON atleticas FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- =============================================
-- HIGH-05: CORRIGIR POLICY DE UPDATE EM PAGAMENTOS
-- A policy anterior tinha USING(true) permitindo qualquer usuário
-- alterar status de pagamentos (fraude potencial).
-- =============================================

DROP POLICY IF EXISTS "pagamentos_update_service" ON pagamentos;

-- UPDATE: Apenas admin pode atualizar pagamentos via RLS.
-- Webhooks usam service_role que bypassa RLS automaticamente.
CREATE POLICY "pagamentos_update_admin"
  ON pagamentos FOR UPDATE
  USING (public.obter_role_usuario(auth.uid()) = 'admin');
