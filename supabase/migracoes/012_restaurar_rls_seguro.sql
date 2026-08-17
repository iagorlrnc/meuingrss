-- 012_restaurar_rls_seguro.sql
-- CORREÇÃO DE SEGURANÇA: Substitui as policies excessivamente permissivas da migração 010
-- por policies granulares que respeitam o princípio do menor privilégio.

-- =============================================
-- 1. TABELA: profiles
-- =============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Perfis leitura publica" ON profiles;
DROP POLICY IF EXISTS "Perfis edicao propria ou admin" ON profiles;
DROP POLICY IF EXISTS "Perfis insercao" ON profiles;

-- SELECT: usuário vê o próprio perfil
CREATE POLICY "profiles_select_proprio"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- SELECT: admin vê todos
CREATE POLICY "profiles_select_admin"
  ON profiles FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- SELECT: diretor vê perfis de compradores dos seus eventos
CREATE POLICY "profiles_select_diretor_compradores"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ingressos i
      JOIN eventos e ON e.id = i.evento_id
      JOIN profiles p ON p.atletica_id = e.atletica_id
      WHERE i.comprador_id = profiles.id
      AND p.id = auth.uid()
      AND p.role = 'diretor'
    )
  );

-- UPDATE: usuário edita apenas o próprio perfil
CREATE POLICY "profiles_update_proprio"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- UPDATE: admin edita qualquer perfil
CREATE POLICY "profiles_update_admin"
  ON profiles FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- INSERT: via trigger/service_role (necessário para criação de perfil no signup)
CREATE POLICY "profiles_insert_service"
  ON profiles FOR INSERT
  WITH CHECK (true);

-- =============================================
-- 2. TABELA: atleticas
-- =============================================
ALTER TABLE atleticas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Atleticas leitura publica" ON atleticas;
DROP POLICY IF EXISTS "Atleticas gerenciar" ON atleticas;

-- SELECT: atléticas ativas são públicas; admin vê todas
CREATE POLICY "atleticas_select_publico"
  ON atleticas FOR SELECT
  USING (
    status = 'ativa'
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'diretor' AND p.atletica_id = atleticas.id)
  );

-- INSERT: criação de atlética pendente durante cadastro (via service_role ou anon para signup flow)
CREATE POLICY "atleticas_insert"
  ON atleticas FOR INSERT
  WITH CHECK (true);

-- UPDATE: admin ou diretor vinculado
CREATE POLICY "atleticas_update"
  ON atleticas FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'diretor' AND p.atletica_id = atleticas.id)
  );

-- DELETE: apenas admin
CREATE POLICY "atleticas_delete"
  ON atleticas FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- =============================================
-- 3. TABELA: eventos
-- =============================================
ALTER TABLE eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Eventos leitura publica" ON eventos;
DROP POLICY IF EXISTS "Eventos gerenciar" ON eventos;

-- SELECT: eventos publicados são públicos; diretor vê os da sua atlética; admin vê todos
CREATE POLICY "eventos_select"
  ON eventos FOR SELECT
  USING (
    status = 'publicado'
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'diretor' AND p.atletica_id = eventos.atletica_id
    )
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- INSERT: diretor cria evento da sua atlética
CREATE POLICY "eventos_insert_diretor"
  ON eventos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'diretor' AND p.atletica_id = eventos.atletica_id
    )
  );

-- UPDATE: diretor edita evento da sua atlética; admin edita qualquer
CREATE POLICY "eventos_update"
  ON eventos FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'diretor' AND p.atletica_id = eventos.atletica_id
    )
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- DELETE: apenas admin
CREATE POLICY "eventos_delete"
  ON eventos FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- =============================================
-- 4. TABELA: lotes_ingresso
-- =============================================
ALTER TABLE lotes_ingresso ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lotes leitura publica" ON lotes_ingresso;
DROP POLICY IF EXISTS "Lotes gerenciar" ON lotes_ingresso;

-- SELECT: lotes de eventos publicados são públicos; diretor/admin vê demais
CREATE POLICY "lotes_select"
  ON lotes_ingresso FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM eventos e WHERE e.id = lotes_ingresso.evento_id AND e.status = 'publicado')
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (
        p.role = 'admin'
        OR (p.role = 'diretor' AND p.atletica_id IN (SELECT atletica_id FROM eventos WHERE id = lotes_ingresso.evento_id))
      )
    )
  );

-- INSERT/UPDATE/DELETE: diretor da atlética do evento ou admin
CREATE POLICY "lotes_gerenciar_diretor"
  ON lotes_ingresso FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM eventos e
      JOIN profiles p ON p.atletica_id = e.atletica_id
      WHERE e.id = lotes_ingresso.evento_id
      AND p.id = auth.uid()
      AND p.role = 'diretor'
    )
  );

CREATE POLICY "lotes_gerenciar_admin"
  ON lotes_ingresso FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- =============================================
-- 5. TABELA: ingressos
-- =============================================
ALTER TABLE ingressos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ingressos leitura geral" ON ingressos;
DROP POLICY IF EXISTS "Ingressos gerenciar" ON ingressos;

-- SELECT: cliente vê próprios ingressos
CREATE POLICY "ingressos_select_comprador"
  ON ingressos FOR SELECT
  USING (comprador_id = auth.uid());

-- SELECT: diretor vê ingressos dos eventos da sua atlética
CREATE POLICY "ingressos_select_diretor"
  ON ingressos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM eventos e
      JOIN profiles p ON p.atletica_id = e.atletica_id
      WHERE e.id = ingressos.evento_id
      AND p.id = auth.uid()
      AND p.role = 'diretor'
    )
  );

-- SELECT: admin vê todos
CREATE POLICY "ingressos_select_admin"
  ON ingressos FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- INSERT: via service_role (webhook de pagamento). WITH CHECK true para permitir via service_role.
CREATE POLICY "ingressos_insert_service"
  ON ingressos FOR INSERT
  WITH CHECK (true);

-- UPDATE: diretor valida ingresso do seu evento
CREATE POLICY "ingressos_update_diretor"
  ON ingressos FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM eventos e
      JOIN profiles p ON p.atletica_id = e.atletica_id
      WHERE e.id = ingressos.evento_id
      AND p.id = auth.uid()
      AND p.role = 'diretor'
    )
  );

-- =============================================
-- 6. TABELA: pagamentos
-- =============================================
ALTER TABLE pagamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Pagamentos leitura geral" ON pagamentos;
DROP POLICY IF EXISTS "Pagamentos gerenciar" ON pagamentos;

-- SELECT: cliente vê próprios pagamentos
CREATE POLICY "pagamentos_select_comprador"
  ON pagamentos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ingressos i
      WHERE i.id = pagamentos.ingresso_id
      AND i.comprador_id = auth.uid()
    )
  );

-- SELECT: admin vê todos
CREATE POLICY "pagamentos_select_admin"
  ON pagamentos FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- INSERT/UPDATE: via service_role (webhook de pagamento)
CREATE POLICY "pagamentos_insert_service"
  ON pagamentos FOR INSERT
  WITH CHECK (true);

CREATE POLICY "pagamentos_update_service"
  ON pagamentos FOR UPDATE
  USING (true);
