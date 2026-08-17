-- 013_storage_policies_seguras.sql
-- CORREÇÃO DE SEGURANÇA: Restringe upload/update/delete nos buckets de storage
-- apenas para diretores vinculados e admins. Leitura pública mantida.

-- =============================================
-- BUCKET: eventos
-- =============================================
DROP POLICY IF EXISTS "Permitir upload em eventos" ON storage.objects;
DROP POLICY IF EXISTS "Permitir atualização em eventos" ON storage.objects;
DROP POLICY IF EXISTS "Permitir remoção em eventos" ON storage.objects;

-- Upload: apenas diretor ou admin autenticado
CREATE POLICY "eventos_upload_autenticado"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'eventos'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('diretor', 'admin')
    )
  );

-- Update: apenas diretor ou admin autenticado
CREATE POLICY "eventos_update_autenticado"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'eventos'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('diretor', 'admin')
    )
  );

-- Delete: apenas diretor ou admin autenticado
CREATE POLICY "eventos_delete_autenticado"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'eventos'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('diretor', 'admin')
    )
  );

-- =============================================
-- BUCKET: atleticas
-- =============================================
DROP POLICY IF EXISTS "Permitir upload em atleticas" ON storage.objects;
DROP POLICY IF EXISTS "Permitir atualização em atleticas" ON storage.objects;
DROP POLICY IF EXISTS "Permitir remoção em atleticas" ON storage.objects;

-- Upload: apenas diretor ou admin autenticado
CREATE POLICY "atleticas_upload_autenticado"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'atleticas'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('diretor', 'admin')
    )
  );

-- Update: apenas diretor ou admin autenticado
CREATE POLICY "atleticas_update_autenticado"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'atleticas'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('diretor', 'admin')
    )
  );

-- Delete: apenas diretor ou admin autenticado
CREATE POLICY "atleticas_delete_autenticado"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'atleticas'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('diretor', 'admin')
    )
  );
