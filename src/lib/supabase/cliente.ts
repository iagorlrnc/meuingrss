import { createBrowserClient } from '@supabase/ssr';

let clienteNavegadorUnico: ReturnType<typeof createBrowserClient> | null = null;

export function criarClienteNavegador() {
  if (!clienteNavegadorUnico) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    clienteNavegadorUnico = createBrowserClient(
      url || 'https://meuingrss.supabase.co',
      anonKey
    );
  }
  return clienteNavegadorUnico;
}

