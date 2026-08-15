import { createBrowserClient } from '@supabase/ssr';

let clienteNavegadorUnico: ReturnType<typeof createBrowserClient> | null = null;

export function criarClienteNavegador() {
  if (!clienteNavegadorUnico) {
    clienteNavegadorUnico = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder'
    );
  }
  return clienteNavegadorUnico;
}

