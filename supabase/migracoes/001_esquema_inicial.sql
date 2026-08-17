CREATE TYPE perfil_usuario AS ENUM ('cliente', 'diretor', 'admin');
CREATE TYPE status_usuario AS ENUM ('ativo', 'bloqueado', 'pendente');
CREATE TYPE status_atletica AS ENUM ('ativa', 'inativa', 'pendente');
CREATE TYPE status_evento AS ENUM ('rascunho', 'publicado', 'encerrado', 'cancelado');
CREATE TYPE status_ingresso AS ENUM ('valido', 'utilizado', 'cancelado');
CREATE TYPE status_pagamento AS ENUM ('pendente', 'aprovado', 'recusado', 'estornado');

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  role perfil_usuario NOT NULL DEFAULT 'cliente',
  atletica_id UUID,
  avatar_url TEXT,
  telefone TEXT,
  status status_usuario NOT NULL DEFAULT 'ativo',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE atleticas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  faculdade TEXT NOT NULL,
  cidade TEXT NOT NULL DEFAULT '',
  logo_url TEXT,
  cor_primaria TEXT NOT NULL DEFAULT '#7C3AED',
  cor_secundaria TEXT NOT NULL DEFAULT '#EC4899',
  status status_atletica NOT NULL DEFAULT 'pendente',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE profiles
  ADD CONSTRAINT fk_profiles_atletica
  FOREIGN KEY (atletica_id) REFERENCES atleticas(id) ON DELETE SET NULL;

CREATE TABLE eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  atletica_id UUID NOT NULL REFERENCES atleticas(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',
  imagem_url TEXT,
  data_evento TIMESTAMPTZ NOT NULL,
  local TEXT NOT NULL DEFAULT '',
  cidade TEXT NOT NULL DEFAULT '',
  status status_evento NOT NULL DEFAULT 'rascunho',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE lotes_ingresso (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id UUID NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  nome_lote TEXT NOT NULL,
  preco DECIMAL(10, 2) NOT NULL DEFAULT 0,
  quantidade_total INTEGER NOT NULL DEFAULT 0,
  quantidade_vendida INTEGER NOT NULL DEFAULT 0,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE ingressos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id UUID NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  lote_id UUID NOT NULL REFERENCES lotes_ingresso(id) ON DELETE CASCADE,
  comprador_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  qr_code_hash TEXT NOT NULL UNIQUE,
  status status_ingresso NOT NULL DEFAULT 'valido',
  data_compra TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_validacao TIMESTAMPTZ,
  validado_por UUID REFERENCES profiles(id)
);

CREATE TABLE pagamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingresso_id UUID NOT NULL REFERENCES ingressos(id) ON DELETE CASCADE,
  valor DECIMAL(10, 2) NOT NULL,
  status status_pagamento NOT NULL DEFAULT 'pendente',
  gateway_transaction_id TEXT,
  metodo_pagamento TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_atletica ON profiles(atletica_id);
CREATE INDEX idx_eventos_atletica ON eventos(atletica_id);
CREATE INDEX idx_eventos_status ON eventos(status);
CREATE INDEX idx_eventos_data ON eventos(data_evento);
CREATE INDEX idx_lotes_evento ON lotes_ingresso(evento_id);
CREATE INDEX idx_ingressos_evento ON ingressos(evento_id);
CREATE INDEX idx_ingressos_comprador ON ingressos(comprador_id);
CREATE INDEX idx_ingressos_qrcode ON ingressos(qr_code_hash);
CREATE INDEX idx_pagamentos_ingresso ON pagamentos(ingresso_id);

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

  
  v_meta_role := LOWER(TRIM(COALESCE(NEW.raw_user_meta_data->>'role', 'cliente')));
  IF v_meta_role IN ('diretor', 'admin', 'cliente') THEN
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

DROP TRIGGER IF EXISTS ao_criar_usuario ON auth.users;

CREATE TRIGGER ao_criar_usuario
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.criar_perfil_novo_usuario();

CREATE OR REPLACE FUNCTION atualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ao_atualizar_profile
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();

CREATE TRIGGER ao_atualizar_evento
  BEFORE UPDATE ON eventos
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();

CREATE OR REPLACE FUNCTION incrementar_vendas_lote()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE lotes_ingresso
  SET quantidade_vendida = quantidade_vendida + 1
  WHERE id = NEW.lote_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ao_inserir_ingresso
  AFTER INSERT ON ingressos
  FOR EACH ROW EXECUTE FUNCTION incrementar_vendas_lote();

CREATE OR REPLACE FUNCTION decrementar_vendas_lote()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'valido' AND NEW.status = 'cancelado' THEN
    UPDATE lotes_ingresso
    SET quantidade_vendida = quantidade_vendida - 1
    WHERE id = NEW.lote_id AND quantidade_vendida > 0;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ao_cancelar_ingresso
  BEFORE UPDATE ON ingressos
  FOR EACH ROW EXECUTE FUNCTION decrementar_vendas_lote();

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE atleticas ENABLE ROW LEVEL SECURITY;
ALTER TABLE eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE lotes_ingresso ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingressos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário lê próprio perfil"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Admin lê todos os perfis"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Diretor lê perfis de compradores dos seus eventos"
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

CREATE POLICY "Usuário edita próprio perfil"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admin edita qualquer perfil"
  ON profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE OR REPLACE FUNCTION public.validar_ingresso(
  p_qr_hash TEXT,
  p_evento_id UUID,
  p_validado_por UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ingresso RECORD;
  v_comprador_nome TEXT;
  v_lote_nome TEXT;
  v_role public.perfil_usuario;
  v_atletica_diretor UUID;
  v_atletica_evento UUID;
BEGIN
  
  SELECT role, atletica_id INTO v_role, v_atletica_diretor
  FROM profiles
  WHERE id = p_validado_por;

  IF v_role IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Validador não encontrado.');
  END IF;

  SELECT atletica_id INTO v_atletica_evento
  FROM eventos
  WHERE id = p_evento_id;

  IF v_role = 'diretor' AND (v_atletica_diretor IS NULL OR v_atletica_diretor <> v_atletica_evento) THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Sem permissão para validar ingressos deste evento.');
  END IF;

  
  SELECT i.*, p.nome as nome_comprador, l.nome_lote as nome_lote
  INTO v_ingresso
  FROM ingressos i
  JOIN profiles p ON p.id = i.comprador_id
  JOIN lotes_ingresso l ON l.id = i.lote_id
  WHERE i.qr_code_hash = p_qr_hash
    AND i.evento_id = p_evento_id
  FOR UPDATE OF i;

  IF v_ingresso.id IS NULL THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'mensagem', 'QR Code inválido ou não pertence a este evento.'
    );
  END IF;

  IF v_ingresso.status = 'utilizado' THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'mensagem', 'Ingresso já utilizado!',
      'nomeComprador', v_ingresso.nome_comprador,
      'nomeLote', v_ingresso.nome_lote
    );
  END IF;

  IF v_ingresso.status = 'cancelado' THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'mensagem', 'Ingresso cancelado.'
    );
  END IF;

  
  UPDATE ingressos
  SET status = 'utilizado',
      data_validacao = now(),
      validado_por = p_validado_por
  WHERE id = v_ingresso.id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'mensagem', 'Entrada validada com sucesso!',
    'nomeComprador', v_ingresso.nome_comprador,
    'nomeLote', v_ingresso.nome_lote
  );
END;
$$;

CREATE POLICY "Atléticas ativas visíveis"
  ON atleticas FOR SELECT
  USING (status = 'ativa' OR EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "Admin gerencia atléticas"
  ON atleticas FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Eventos publicados visíveis"
  ON eventos FOR SELECT
  USING (
    status = 'publicado'
    OR (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role = 'diretor'
        AND atletica_id = eventos.atletica_id
      )
    )
    OR (
      EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
      )
    )
  );

CREATE POLICY "Diretor cria evento"
  ON eventos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'diretor'
      AND atletica_id = eventos.atletica_id
    )
  );

CREATE POLICY "Diretor edita evento"
  ON eventos FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'diretor'
      AND atletica_id = eventos.atletica_id
    )
  );

CREATE POLICY "Admin gerencia eventos"
  ON eventos FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Lotes visíveis"
  ON lotes_ingresso FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM eventos WHERE id = lotes_ingresso.evento_id AND status = 'publicado'
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND (role = 'admin' OR (role = 'diretor' AND atletica_id IN (
        SELECT atletica_id FROM eventos WHERE id = lotes_ingresso.evento_id
      )))
    )
  );

CREATE POLICY "Diretor gerencia lotes"
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

CREATE POLICY "Admin gerencia lotes"
  ON lotes_ingresso FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Cliente vê próprios ingressos"
  ON ingressos FOR SELECT
  USING (comprador_id = auth.uid());

CREATE POLICY "Diretor vê ingressos do evento"
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

CREATE POLICY "Admin vê todos ingressos"
  ON ingressos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Inserir ingresso via service"
  ON ingressos FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Diretor valida ingresso"
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

CREATE POLICY "Cliente vê próprios pagamentos"
  ON pagamentos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ingressos
      WHERE id = pagamentos.ingresso_id
      AND comprador_id = auth.uid()
    )
  );

CREATE POLICY "Admin vê todos pagamentos"
  ON pagamentos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Inserir pagamento via service"
  ON pagamentos FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Atualizar pagamento via service"
  ON pagamentos FOR UPDATE
  USING (true);
