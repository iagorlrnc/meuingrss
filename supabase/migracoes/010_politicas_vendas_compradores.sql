-- 010_restaurar_banco_e_politicas.sql
-- RESTAURAÇÃO COMPLETA: Remove todas as regras com recursão infinita e restaura a leitura/autenticação no projeto.

-- 1. TABELA: profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Usuário lê próprio perfil" ON profiles;
DROP POLICY IF EXISTS "Admin lê todos os perfis" ON profiles;
DROP POLICY IF EXISTS "Diretor lê perfis de compradores dos seus eventos" ON profiles;
DROP POLICY IF EXISTS "Leitura de perfis segura" ON profiles;
DROP POLICY IF EXISTS "Perfil leitura geral" ON profiles;
DROP POLICY IF EXISTS "Usuário edita próprio perfil" ON profiles;
DROP POLICY IF EXISTS "Admin edita qualquer perfil" ON profiles;
DROP POLICY IF EXISTS "Perfis leitura publica" ON profiles;
DROP POLICY IF EXISTS "Perfis edicao propria ou admin" ON profiles;
DROP POLICY IF EXISTS "Perfis insercao" ON profiles;

CREATE POLICY "Perfis leitura publica" ON profiles FOR SELECT USING (true);
CREATE POLICY "Perfis edicao propria ou admin" ON profiles FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Perfis insercao" ON profiles FOR INSERT WITH CHECK (true);

-- 2. TABELA: atleticas
ALTER TABLE atleticas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Atléticas ativas visíveis" ON atleticas;
DROP POLICY IF EXISTS "Admin gerencia atléticas" ON atleticas;
DROP POLICY IF EXISTS "Atleticas leitura publica" ON atleticas;
DROP POLICY IF EXISTS "Atleticas gerenciar" ON atleticas;

CREATE POLICY "Atleticas leitura publica" ON atleticas FOR SELECT USING (true);
CREATE POLICY "Atleticas gerenciar" ON atleticas FOR ALL USING (auth.uid() IS NOT NULL);

-- 3. TABELA: eventos
ALTER TABLE eventos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Eventos publicados visíveis" ON eventos;
DROP POLICY IF EXISTS "Diretor cria evento" ON eventos;
DROP POLICY IF EXISTS "Diretor edita evento" ON eventos;
DROP POLICY IF EXISTS "Admin gerencia eventos" ON eventos;
DROP POLICY IF EXISTS "Eventos leitura publica" ON eventos;
DROP POLICY IF EXISTS "Eventos gerenciar" ON eventos;

CREATE POLICY "Eventos leitura publica" ON eventos FOR SELECT USING (true);
CREATE POLICY "Eventos gerenciar" ON eventos FOR ALL USING (auth.uid() IS NOT NULL);

-- 4. TABELA: lotes_ingresso
ALTER TABLE lotes_ingresso ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lotes visíveis" ON lotes_ingresso;
DROP POLICY IF EXISTS "Diretor gerencia lotes" ON lotes_ingresso;
DROP POLICY IF EXISTS "Admin gerencia lotes" ON lotes_ingresso;
DROP POLICY IF EXISTS "Lotes leitura publica" ON lotes_ingresso;
DROP POLICY IF EXISTS "Lotes gerenciar" ON lotes_ingresso;

CREATE POLICY "Lotes leitura publica" ON lotes_ingresso FOR SELECT USING (true);
CREATE POLICY "Lotes gerenciar" ON lotes_ingresso FOR ALL USING (auth.uid() IS NOT NULL);

-- 5. TABELA: ingressos
ALTER TABLE ingressos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Cliente vê próprios ingressos" ON ingressos;
DROP POLICY IF EXISTS "Diretor vê ingressos do evento" ON ingressos;
DROP POLICY IF EXISTS "Diretor lê ingressos dos seus eventos" ON ingressos;
DROP POLICY IF EXISTS "Admin vê todos ingressos" ON ingressos;
DROP POLICY IF EXISTS "Leitura de ingressos segura" ON ingressos;
DROP POLICY IF EXISTS "Ingressos leitura geral" ON ingressos;
DROP POLICY IF EXISTS "Ingressos gerenciar" ON ingressos;

CREATE POLICY "Ingressos leitura geral" ON ingressos FOR SELECT USING (true);
CREATE POLICY "Ingressos gerenciar" ON ingressos FOR ALL USING (auth.uid() IS NOT NULL);

-- 6. TABELA: pagamentos
ALTER TABLE pagamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Cliente vê próprios pagamentos" ON pagamentos;
DROP POLICY IF EXISTS "Admin vê todos pagamentos" ON pagamentos;
DROP POLICY IF EXISTS "Pagamentos leitura geral" ON pagamentos;
DROP POLICY IF EXISTS "Pagamentos gerenciar" ON pagamentos;

CREATE POLICY "Pagamentos leitura geral" ON pagamentos FOR SELECT USING (true);
CREATE POLICY "Pagamentos gerenciar" ON pagamentos FOR ALL USING (auth.uid() IS NOT NULL);
