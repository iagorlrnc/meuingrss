-- 021_verificar_status_cadastro_rpc.sql
-- Função segura SECURITY DEFINER para verificar o status de cadastro de um e-mail durante o login do Diretor

CREATE OR REPLACE FUNCTION public.verificar_status_cadastro(p_email TEXT)
RETURNS TABLE (
  status TEXT,
  role TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT 
    p.status::text,
    p.role::text
  FROM public.profiles p
  WHERE LOWER(p.email) = LOWER(TRIM(p_email))
  LIMIT 1;
$$;
