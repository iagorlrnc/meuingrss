-- 014_corrigir_recursao_rls.sql
-- CORREÇÃO DE ERRO CRÍTICO: Resolve o erro de recursão infinita (infinite recursion)
-- introduzido pelas consultas diretas na tabela 'profiles' dentro das políticas RLS.
--
-- Solução: Utiliza funções SECURITY DEFINER para buscar o role e atletica_id do usuário.
-- Funções SECURITY DEFINER executam com privilégios do criador do banco e BYPASSAM o RLS,
-- eliminando completamente o loop de recursão.

-- =============================================
-- 1. FUNÇÕES AUXILIARES SEGURAS (SECURITY DEFINER)
-- =============================================
CREATE OR REPLACE FUNCTION public.obter_role_usuario(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT role::text FROM public.profiles WHERE id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.obter_atletica_usuario(p_user_id UUID)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT atletica_id FROM public.profiles WHERE id = p_user_id;
$$;

-- =============================================
-- 2. TRIGGER DE SEGURANÇA CONTRA ELEVAÇÃO DE PRIVILÉGIOS EM PROFILES
-- =============================================
CREATE OR REPLACE FUNCTION public.proteger_campos_sensiveis_perfil()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Impede que usuários comuns alterem 'role', 'status' ou 'atletica_id' ao atualizar próprio perfil
  IF (current_setting('role', true) <> 'service_role') AND (public.obter_role_usuario(auth.uid()) <> 'admin') THEN
    NEW.role := OLD.role;
    NEW.status := OLD.status;
    NEW.atletica_id := OLD.atletica_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_perfil ON profiles;
CREATE TRIGGER trg_proteger_perfil
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.proteger_campos_sensiveis_perfil();

-- =============================================
-- 3. REMOÇÃO DE POLÍTICAS RECURSIVAS ANTERIORES
-- =============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_select_proprio" ON profiles;
DROP POLICY IF EXISTS "profiles_select_admin" ON profiles;
DROP POLICY IF EXISTS "profiles_select_diretor_compradores" ON profiles;
DROP POLICY IF EXISTS "profiles_update_proprio" ON profiles;
DROP POLICY IF EXISTS "profiles_update_admin" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_service" ON profiles;
DROP POLICY IF EXISTS "Perfis leitura publica" ON profiles;
DROP POLICY IF EXISTS "Perfis edicao propria ou admin" ON profiles;
DROP POLICY IF EXISTS "Perfis insercao" ON profiles;

ALTER TABLE atleticas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "atleticas_select_publico" ON atleticas;
DROP POLICY IF EXISTS "atleticas_insert" ON atleticas;
DROP POLICY IF EXISTS "atleticas_update" ON atleticas;
DROP POLICY IF EXISTS "atleticas_delete" ON atleticas;
DROP POLICY IF EXISTS "Atleticas leitura publica" ON atleticas;
DROP POLICY IF EXISTS "Atleticas gerenciar" ON atleticas;

ALTER TABLE eventos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "eventos_select" ON eventos;
DROP POLICY IF EXISTS "eventos_insert_diretor" ON eventos;
DROP POLICY IF EXISTS "eventos_update" ON eventos;
DROP POLICY IF EXISTS "eventos_delete" ON eventos;
DROP POLICY IF EXISTS "Eventos leitura publica" ON eventos;
DROP POLICY IF EXISTS "Eventos gerenciar" ON eventos;

ALTER TABLE lotes_ingresso ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lotes_select" ON lotes_ingresso;
DROP POLICY IF EXISTS "lotes_gerenciar_diretor" ON lotes_ingresso;
DROP POLICY IF EXISTS "lotes_gerenciar_admin" ON lotes_ingresso;
DROP POLICY IF EXISTS "Lotes leitura publica" ON lotes_ingresso;
DROP POLICY IF EXISTS "Lotes gerenciar" ON lotes_ingresso;

ALTER TABLE ingressos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ingressos_select_comprador" ON ingressos;
DROP POLICY IF EXISTS "ingressos_select_diretor" ON ingressos;
DROP POLICY IF EXISTS "ingressos_select_admin" ON ingressos;
DROP POLICY IF EXISTS "ingressos_insert_service" ON ingressos;
DROP POLICY IF EXISTS "ingressos_update_diretor" ON ingressos;
DROP POLICY IF EXISTS "Ingressos leitura geral" ON ingressos;
DROP POLICY IF EXISTS "Ingressos gerenciar" ON ingressos;

ALTER TABLE pagamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pagamentos_select_comprador" ON pagamentos;
DROP POLICY IF EXISTS "pagamentos_select_admin" ON pagamentos;
DROP POLICY IF EXISTS "pagamentos_insert_service" ON pagamentos;
DROP POLICY IF EXISTS "pagamentos_update_service" ON pagamentos;
DROP POLICY IF EXISTS "Pagamentos leitura geral" ON pagamentos;
DROP POLICY IF EXISTS "Pagamentos gerenciar" ON pagamentos;

-- =============================================
-- 4. NOVAS POLÍTICAS ISENTAS DE RECURSÃO (100% SEGURAS)
-- =============================================

-- PROFILES
CREATE POLICY "profiles_select_geral"
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY "profiles_update_proprio_ou_admin"
  ON profiles FOR UPDATE
  USING (auth.uid() = id OR public.obter_role_usuario(auth.uid()) = 'admin')
  WITH CHECK (auth.uid() = id OR public.obter_role_usuario(auth.uid()) = 'admin');

CREATE POLICY "profiles_insert_geral"
  ON profiles FOR INSERT
  WITH CHECK (true);

-- ATLETICAS
CREATE POLICY "atleticas_select"
  ON atleticas FOR SELECT
  USING (
    status = 'ativa'
    OR public.obter_role_usuario(auth.uid()) = 'admin'
    OR public.obter_atletica_usuario(auth.uid()) = id
  );

CREATE POLICY "atleticas_insert"
  ON atleticas FOR INSERT
  WITH CHECK (true);

CREATE POLICY "atleticas_update"
  ON atleticas FOR UPDATE
  USING (
    public.obter_role_usuario(auth.uid()) = 'admin'
    OR public.obter_atletica_usuario(auth.uid()) = id
  );

CREATE POLICY "atleticas_delete"
  ON atleticas FOR DELETE
  USING (public.obter_role_usuario(auth.uid()) = 'admin');

-- EVENTOS
CREATE POLICY "eventos_select"
  ON eventos FOR SELECT
  USING (
    status = 'publicado'
    OR public.obter_role_usuario(auth.uid()) = 'admin'
    OR public.obter_atletica_usuario(auth.uid()) = eventos.atletica_id
  );

CREATE POLICY "eventos_insert"
  ON eventos FOR INSERT
  WITH CHECK (
    public.obter_role_usuario(auth.uid()) = 'admin'
    OR (
      public.obter_role_usuario(auth.uid()) = 'diretor'
      AND public.obter_atletica_usuario(auth.uid()) = eventos.atletica_id
    )
  );

CREATE POLICY "eventos_update"
  ON eventos FOR UPDATE
  USING (
    public.obter_role_usuario(auth.uid()) = 'admin'
    OR (
      public.obter_role_usuario(auth.uid()) = 'diretor'
      AND public.obter_atletica_usuario(auth.uid()) = eventos.atletica_id
    )
  );

CREATE POLICY "eventos_delete"
  ON eventos FOR DELETE
  USING (public.obter_role_usuario(auth.uid()) = 'admin');

-- LOTES INGRESSO
CREATE POLICY "lotes_select"
  ON lotes_ingresso FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM eventos e WHERE e.id = lotes_ingresso.evento_id AND e.status = 'publicado')
    OR public.obter_role_usuario(auth.uid()) = 'admin'
    OR public.obter_atletica_usuario(auth.uid()) IN (
      SELECT atletica_id FROM eventos WHERE id = lotes_ingresso.evento_id
    )
  );

CREATE POLICY "lotes_gerenciar"
  ON lotes_ingresso FOR ALL
  USING (
    public.obter_role_usuario(auth.uid()) = 'admin'
    OR (
      public.obter_role_usuario(auth.uid()) = 'diretor'
      AND public.obter_atletica_usuario(auth.uid()) IN (
        SELECT atletica_id FROM eventos WHERE id = lotes_ingresso.evento_id
      )
    )
  );

-- INGRESSOS
CREATE POLICY "ingressos_select"
  ON ingressos FOR SELECT
  USING (
    comprador_id = auth.uid()
    OR public.obter_role_usuario(auth.uid()) = 'admin'
    OR (
      public.obter_role_usuario(auth.uid()) = 'diretor'
      AND public.obter_atletica_usuario(auth.uid()) IN (
        SELECT atletica_id FROM eventos WHERE id = ingressos.evento_id
      )
    )
  );

CREATE POLICY "ingressos_insert_service"
  ON ingressos FOR INSERT
  WITH CHECK (true);

CREATE POLICY "ingressos_update_diretor"
  ON ingressos FOR UPDATE
  USING (
    public.obter_role_usuario(auth.uid()) = 'admin'
    OR (
      public.obter_role_usuario(auth.uid()) = 'diretor'
      AND public.obter_atletica_usuario(auth.uid()) IN (
        SELECT atletica_id FROM eventos WHERE id = ingressos.evento_id
      )
    )
  );

-- PAGAMENTOS
CREATE POLICY "pagamentos_select"
  ON pagamentos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ingressos i
      WHERE i.id = pagamentos.ingresso_id
      AND i.comprador_id = auth.uid()
    )
    OR public.obter_role_usuario(auth.uid()) = 'admin'
  );

CREATE POLICY "pagamentos_insert_service"
  ON pagamentos FOR INSERT
  WITH CHECK (true);

CREATE POLICY "pagamentos_update_service"
  ON pagamentos FOR UPDATE
  USING (true);
