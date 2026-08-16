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

export interface ResultadoAuth {
  erro?: string;
  bloqueado?: boolean;
  segundosRestantes?: number;
  rateLimitData?: any;
}

interface ContextoAuthType {
  usuario: User | null;
  perfil: Perfil | null;
  carregando: boolean;
  entrar: (email: string, senha: string, tipoContexto?: 'admin' | 'geral', turnstileToken?: string) => Promise<ResultadoAuth>;
  cadastrar: (
    email: string,
    senha: string,
    nome: string,
    role?: 'cliente' | 'diretor',
    metadadosAdicionais?: MetadadosCadastro,
    turnstileToken?: string
  ) => Promise<ResultadoAuth>;
  sair: () => Promise<void>;
  entrarComGoogle: (redirecionarPara?: string) => Promise<void>;
}

const ContextoAuth = createContext<ContextoAuthType | null>(null);

async function checarRateLimitOuRegistrar(
  acao: 'verificar' | 'registrar_erro' | 'registrar_sucesso',
  tipoContexto: 'admin' | 'geral' = 'geral',
  turnstileToken?: string
) {
  try {
    const res = await fetch('/api/auth/rate-limit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao, tipo: tipoContexto, turnstileToken }),
      cache: 'no-store',
    });
    return await res.json();
  } catch {
    return { bloqueado: false, segundosRestantes: 0, tentativasConsecutivas: 0 };
  }
}

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

  const entrar = async (
    email: string,
    senha: string,
    tipoContexto: 'admin' | 'geral' = 'geral',
    turnstileToken?: string
  ): Promise<ResultadoAuth> => {
    // 1. Verificar se o IP já está bloqueado por rate limit ou se captcha falhou
    const checkStatus = await checarRateLimitOuRegistrar('verificar', tipoContexto, turnstileToken);
    if (checkStatus.bloqueado) {
      return {
        erro: checkStatus.mensagem || `Muitas tentativas erradas. IP bloqueado. Aguarde ${checkStatus.segundosRestantes}s.`,
        bloqueado: true,
        segundosRestantes: checkStatus.segundosRestantes,
        rateLimitData: checkStatus,
      };
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    });

    if (error) {
      // 2. Registrar erro e atualizar contador do IP
      const errStatus = await checarRateLimitOuRegistrar('registrar_erro', tipoContexto);
      let msgFinal = error.message.includes('Invalid login')
        ? tipoContexto === 'admin'
          ? 'Credenciais administrativas incorretas'
          : 'Email ou senha incorretos'
        : error.message;

      if (errStatus.mensagem) {
        msgFinal = `${msgFinal}. ${errStatus.mensagem}`;
      }

      return {
        erro: msgFinal,
        bloqueado: errStatus.bloqueado,
        segundosRestantes: errStatus.segundosRestantes,
        rateLimitData: errStatus,
      };
    }

    // 3. Sucesso -> Reseta contagem do IP
    await checarRateLimitOuRegistrar('registrar_sucesso', tipoContexto);
    return {};
  };

  const cadastrar = async (
    email: string,
    senha: string,
    nome: string,
    role: 'cliente' | 'diretor' = 'cliente',
    metadadosAdicionais: MetadadosCadastro = {},
    turnstileToken?: string
  ): Promise<ResultadoAuth> => {
    // 1. Verificar se o IP já está bloqueado por rate limit ou se captcha falhou
    const checkStatus = await checarRateLimitOuRegistrar('verificar', 'geral', turnstileToken);
    if (checkStatus.bloqueado) {
      return {
        erro: checkStatus.mensagem || `Muitas tentativas erradas. IP bloqueado. Aguarde ${checkStatus.segundosRestantes}s.`,
        bloqueado: true,
        segundosRestantes: checkStatus.segundosRestantes,
        rateLimitData: checkStatus,
      };
    }

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

    let userObj = authData?.user;

    // Se o usuário foi pré-criado/verificado via OTP na etapa anterior, recupera a sessão ativa
    if (!userObj) {
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user) {
        userObj = userData.user;
        try {
          await supabase.auth.updateUser({
            password: senha,
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
          });
        } catch (uErr) {
          console.error('Erro ao atualizar usuário auth:', uErr);
        }
      } else if (error) {
        // Erro real de signup sem usuário logado
        const errStatus = await checarRateLimitOuRegistrar('registrar_erro');
        let msgFinal = error.message;
        if (errStatus.mensagem) {
          msgFinal = `${msgFinal}. ${errStatus.mensagem}`;
        }
        return {
          erro: msgFinal,
          bloqueado: errStatus.bloqueado,
          segundosRestantes: errStatus.segundosRestantes,
          rateLimitData: errStatus,
        };
      }
    }

    if (userObj) {
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
            console.error('Erro ao criar atlética:', errAtl);
          }
        }

        const { error: errProfile } = await supabase.from('profiles').upsert({
          id: userObj.id,
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
          console.error('Erro ao atualizar perfil no cadastro:', errProfile);
        }
      } catch (errCad) {
        console.error('Exceção ao concluir cadastro:', errCad);
      }

      // Se for cadastro de diretor, deslogar imediatamente a sessão para impedir o auto-login
      if (roleValido === 'diretor') {
        await supabase.auth.signOut();
        setUsuario(null);
        setPerfil(null);
      }
    }

    // 3. Sucesso -> Reseta contagem do IP
    await checarRateLimitOuRegistrar('registrar_sucesso');

    return {};
  };

  const sair = async () => {
    await supabase.auth.signOut();
    setUsuario(null);
    setPerfil(null);
    window.location.href = '/';
  };

  const entrarComGoogle = async (redirecionarPara?: string) => {
    try {
      const origens = typeof window !== 'undefined' ? window.location.origin : '';
      const protocolo = process.env.NEXT_PUBLIC_PROTOCOLO || 'https';
      const dominio = (process.env.NEXT_PUBLIC_DOMINIO_PRINCIPAL || 'meuingrss.com.br').replace(/\/+$/, '');
      const urlRedirecionamento = origens || `${protocolo}://${dominio}`;

      const callbackUrl = new URL(`${urlRedirecionamento}/autenticacao/callback`);
      if (redirecionarPara && redirecionarPara !== '/') {
        callbackUrl.searchParams.set('redirecionar', redirecionarPara);
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callbackUrl.toString(),
          queryParams: {
            prompt: 'select_account',
          },
        },
      });

      if (error) {
        console.error('Erro no signInWithOAuth:', error);
        throw error;
      }
    } catch (err) {
      console.error('Erro ao chamar autenticação Google:', err);
      throw err;
    }
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
