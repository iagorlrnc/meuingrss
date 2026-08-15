'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { criarClienteNavegador } from '@/lib/supabase/cliente';
import type { User, AuthChangeEvent, Session } from '@supabase/supabase-js';
import type { Perfil } from '@/tipos';

export interface MetadadosCadastro {
  telefone?: string | null;
  cpf?: string | null;
  cargo?: string | null;
  atleticaNome?: string | null;
  atleticaSigla?: string | null;
  atleticaCidade?: string | null;
  atleticaEstado?: string | null;
}

interface ContextoAuthType {
  usuario: User | null;
  perfil: Perfil | null;
  carregando: boolean;
  entrar: (email: string, senha: string) => Promise<{ erro?: string }>;
  cadastrar: (
    email: string,
    senha: string,
    nome: string,
    role?: 'cliente' | 'diretor',
    metadadosAdicionais?: MetadadosCadastro
  ) => Promise<{ erro?: string }>;
  sair: () => Promise<void>;
  entrarComGoogle: () => Promise<void>;
}

const ContextoAuth = createContext<ContextoAuthType | null>(null);

export function usarAutenticacao() {
  const ctx = useContext(ContextoAuth);
  if (!ctx) {
    throw new Error('usarAutenticacao deve ser usado dentro de ProvedorAutenticacao');
  }
  return ctx;
}

export function ProvedorAutenticacao({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<User | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [carregando, setCarregando] = useState(true);
  const supabase = criarClienteNavegador();

  const buscarPerfil = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('id, nome, email, role, atletica_id, avatar_url, telefone, status, criado_em, atualizado_em')
      .eq('id', userId)
      .single();

    if (data) {
      setPerfil(data as Perfil);
    }
  }, [supabase]);

  useEffect(() => {
    const inicializar = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        setUsuario(session.user);
        await buscarPerfil(session.user.id);
      }

      setCarregando(false);
    };

    inicializar();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_evento: AuthChangeEvent, session: Session | null) => {
        if (session?.user) {
          setUsuario(session.user);
          await buscarPerfil(session.user.id);
        } else {
          setUsuario(null);
          setPerfil(null);
        }
        setCarregando(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, buscarPerfil]);

  const entrar = async (email: string, senha: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    });

    if (error) {
      return { erro: error.message };
    }

    return {};
  };

  const cadastrar = async (
    email: string,
    senha: string,
    nome: string,
    role: 'cliente' | 'diretor' = 'cliente',
    metadadosAdicionais: MetadadosCadastro = {}
  ) => {
    // Validação estrita: Bloquear atribuição pública do papel de 'admin'
    const roleValido: 'cliente' | 'diretor' = role === 'diretor' ? 'diretor' : 'cliente';

    const { data: authData, error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: {
        data: {
          nome,
          role: roleValido,
          telefone: metadadosAdicionais.telefone || null,
          cpf: metadadosAdicionais.cpf || null,
          cargo: metadadosAdicionais.cargo || null,
          atletica_nome: metadadosAdicionais.atleticaNome || null,
          atletica_sigla: metadadosAdicionais.atleticaSigla || null,
          atletica_cidade: metadadosAdicionais.atleticaCidade || null,
          atletica_estado: metadadosAdicionais.atleticaEstado || 'TO',
        },
      },
    });

    if (error) {
      return { erro: error.message };
    }

    if (authData?.user) {
      try {
        const userStatus = roleValido === 'diretor' ? 'pendente' : 'ativo';

        let atleticaId: string | null = null;
        if (roleValido === 'diretor' && metadadosAdicionais.atleticaNome) {
          const { data: atleticaCriada, error: errAtl } = await supabase
            .from('atleticas')
            .insert({
              nome: metadadosAdicionais.atleticaNome,
              faculdade: metadadosAdicionais.atleticaSigla
                ? `${metadadosAdicionais.atleticaNome} (${metadadosAdicionais.atleticaSigla})`
                : metadadosAdicionais.atleticaNome,
              cidade: metadadosAdicionais.atleticaCidade || 'Não informada',
              estado: metadadosAdicionais.atleticaEstado || 'TO',
              status: 'pendente',
            })
            .select()
            .maybeSingle();

          if (atleticaCriada) {
            atleticaId = atleticaCriada.id;
          } else if (errAtl) {
            // Silencioso no client para não vazar schema
          }
        }

        const { error: errProfile } = await supabase.from('profiles').upsert({
          id: authData.user.id,
          nome,
          email,
          role: roleValido,
          telefone: metadadosAdicionais.telefone || null,
          cpf: metadadosAdicionais.cpf || null,
          atletica_id: atleticaId,
          status: userStatus,
          criado_em: new Date().toISOString(),
          atualizado_em: new Date().toISOString(),
        });

        if (errProfile) {
          // Silencioso no client
        }
      } catch {
        // Ignorar erros no client
      }

      // Se for cadastro de diretor, deslogar imediatamente a sessão para impedir o auto-login
      if (roleValido === 'diretor') {
        await supabase.auth.signOut();
        setUsuario(null);
        setPerfil(null);
      }
    }

    return {};
  };

  const sair = async () => {
    await supabase.auth.signOut();
    setUsuario(null);
    setPerfil(null);
    window.location.href = '/';
  };

  const entrarComGoogle = async () => {
    const origens = typeof window !== 'undefined' ? window.location.origin : '';
    const protocolo = process.env.NEXT_PUBLIC_PROTOCOLO || 'http';
    const dominio = process.env.NEXT_PUBLIC_DOMINIO_PRINCIPAL || 'meuingrss.local:3000';
    const urlRedirecionamento = origens || `${protocolo}://${dominio}`;

    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${urlRedirecionamento}/autenticacao/callback`,
      },
    });
  };

  return (
    <ContextoAuth.Provider
      value={{
        usuario,
        perfil,
        carregando,
        entrar,
        cadastrar,
        sair,
        entrarComGoogle,
      }}
    >
      {children}
    </ContextoAuth.Provider>
  );
}
