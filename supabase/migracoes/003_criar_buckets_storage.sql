-- 1. Criar os buckets públicos para eventos e atléticas
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('eventos', 'eventos', true),
  ('atleticas', 'atleticas', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Habilitar políticas de acesso públicas para o bucket 'eventos'
CREATE POLICY "Permitir leitura publica em eventos"
ON storage.objects FOR SELECT
USING (bucket_id = 'eventos');

CREATE POLICY "Permitir upload em eventos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'eventos');

CREATE POLICY "Permitir atualização em eventos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'eventos');

CREATE POLICY "Permitir remoção em eventos"
ON storage.objects FOR DELETE
USING (bucket_id = 'eventos');

-- 3. Habilitar políticas de acesso públicas para o bucket 'atleticas'
CREATE POLICY "Permitir leitura publica em atleticas"
ON storage.objects FOR SELECT
USING (bucket_id = 'atleticas');

CREATE POLICY "Permitir upload em atleticas"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'atleticas');

CREATE POLICY "Permitir atualização em atleticas"
ON storage.objects FOR UPDATE
USING (bucket_id = 'atleticas');

CREATE POLICY "Permitir remoção em atleticas"
ON storage.objects FOR DELETE
USING (bucket_id = 'atleticas');
