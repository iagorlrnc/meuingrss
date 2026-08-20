'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { criarClienteNavegador } from '@/lib/supabase/cliente';
import type { User, AuthChangeEvent, Session } from '@supabase/supabase-js';
import type { Perfil } from '@/tipos';
import { formatarCidadeEstado, traduzirErroAuth } from '@/lib/utilitarios';

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
  recuperarSenha: (email: string, turnstileToken?: string) => Promise<ResultadoAuth>;
  redefinirSenha: (novaSenha: string) => Promise<ResultadoAuth>;
}

const ContextoAuth = createContext<ContextoAuthType | null>(null);

async function checarRateLimitOuRegistrar(
  acao: 'verificar' | 'registrar_erro' | 'registrar_sucesso' | 'verificar_recuperacao' | 'registrar_recuperacao',
  tipoContexto: 'admin' | 'geral' = 'geral',
  turnstileToken?: string,
  email?: string
) {
  try {
    const res = await fetch('/api/auth/rate-limit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao, tipo: tipoContexto, turnstileToken, email }),
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

  const buscarPerfil = useCallback(async (userId: string, userMeta?: Record<string, any>) => {
    const { data } = await supabase
      .from('profiles')
      .select('id, nome, email, role, atletica_id, avatar_url, telefone, status, criado_em, atualizado_em, cpf')
      .eq('id', userId)
      .single();

    const metaNome = userMeta?.nome || userMeta?.full_name || userMeta?.name;
    const metaCpf = userMeta?.cpf;
    const metaTelefone = userMeta?.telefone;

    if (data) {
      const precisaNome = metaNome && (!data.nome || data.nome.includes('@') || data.nome.trim() === '');
      const precisaCpf = metaCpf && !data.cpf;
      const precisaTel = metaTelefone && !data.telefone;

      const perfilAtualizado = {
        ...data,
        nome: data.nome || metaNome || '',
      } as Perfil;

      setPerfil(perfilAtualizado);

      if (precisaNome || precisaCpf || precisaTel) {
        const payload: Record<string, any> = {};
        if (precisaNome) payload.nome = metaNome;
        if (precisaCpf) payload.cpf = metaCpf;
        if (precisaTel) payload.telefone = metaTelefone;

        try {
          await fetch('/api/perfil/sincronizar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          setPerfil((prev) => (prev ? { ...prev, ...payload } : prev));
        } catch {
          // Ignora falhas transitórias de sincronização
        }
      }
    } else if (metaNome) {
      setPerfil({
        id: userId,
        nome: metaNome,
        email: userMeta?.email || '',
        role: userMeta?.role || 'cliente',
        status: 'ativo',
        criado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
        cpf: metaCpf || null,
        telefone: metaTelefone || null,
      } as Perfil);
    }
  }, [supabase]);



  useEffect(() => {
    const inicializar = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        setUsuario(session.user);
        await buscarPerfil(session.user.id, session.user.user_metadata);
      }

      setCarregando(false);
    };

    inicializar();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_evento: AuthChangeEvent, session: Session | null) => {
        if (session?.user) {
          setUsuario(session.user);
          await buscarPerfil(session.user.id, session.user.user_metadata);
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
      let msgFinal = error.message;
      if (error.message.includes('Email not confirmed')) {
        msgFinal = 'Seu e-mail de cadastro ainda não foi confirmado. Verifique sua caixa de entrada ou aguarde a aprovação do administrador.';
      } else if (error.message.includes('Invalid login')) {
        msgFinal = tipoContexto === 'admin'
          ? 'Credenciais administrativas incorretas'
          : 'Email ou senha incorretos';
      }

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

    // 1. Tenta resgatar a sessão prévia estabelecida por OTP (se houver)
    const { data: { session } } = await supabase.auth.getSession();
    let userObj: User | null = session?.user || null;

    if (userObj) {
      // Se o usuário já está logado via OTP, grava a senha diretamente no auth.users
      const { error: errUpdate } = await supabase.auth.updateUser({
        password: senha,
        data: {
          nome,
          role: roleValido,
          telefone: metadadosAdicionais.telefone || null,
          cpf: metadadosAdicionais.cpf || null,
          cargo: metadadosAdicionais.cargo || null,
          atleticaNome: metadadosAdicionais.atleticaNome || null,
          atleticaSigla: metadadosAdicionais.atleticaSigla || null,
          atleticaCidade: metadadosAdicionais.atleticaCidade
            ? formatarCidadeEstado(metadadosAdicionais.atleticaCidade, metadadosAdicionais.atleticaEstado)
            : null,
          atleticaEstado: metadadosAdicionais.atleticaEstado || 'TO',
          atletica_nome: metadadosAdicionais.atleticaNome || null,
          atletica_sigla: metadadosAdicionais.atleticaSigla || null,
          atletica_cidade: metadadosAdicionais.atleticaCidade
            ? formatarCidadeEstado(metadadosAdicionais.atleticaCidade, metadadosAdicionais.atleticaEstado)
            : null,
          atletica_estado: metadadosAdicionais.atleticaEstado || 'TO',
        },
      });

      if (errUpdate) {
        console.error('Erro ao definir senha do usuário via updateUser:', errUpdate);
      }
    } else {
      // Se não há sessão OTP prévia, faz o signUp definindo a senha
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
            atleticaNome: metadadosAdicionais.atleticaNome || null,
            atleticaSigla: metadadosAdicionais.atleticaSigla || null,
            atleticaCidade: metadadosAdicionais.atleticaCidade
              ? formatarCidadeEstado(metadadosAdicionais.atleticaCidade, metadadosAdicionais.atleticaEstado)
              : null,
            atleticaEstado: metadadosAdicionais.atleticaEstado || 'TO',
            atletica_nome: metadadosAdicionais.atleticaNome || null,
            atletica_sigla: metadadosAdicionais.atleticaSigla || null,
            atletica_cidade: metadadosAdicionais.atleticaCidade
              ? formatarCidadeEstado(metadadosAdicionais.atleticaCidade, metadadosAdicionais.atleticaEstado)
              : null,
            atletica_estado: metadadosAdicionais.atleticaEstado || 'TO',
          },
        },
      });

      if (error) {
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
      userObj = authData?.user || null;
    }

    if (userObj) {
      try {
        const userStatus = roleValido === 'diretor' ? 'pendente' : 'ativo';

        // Tenta obter atletica_id já criada/vinculada via trigger
        let atleticaId: string | null = null;
        const { data: perfExistente } = await supabase
          .from('profiles')
          .select('atletica_id')
          .eq('id', userObj.id)
          .maybeSingle();

        if (perfExistente?.atletica_id) {
          atleticaId = perfExistente.atletica_id;
        } else if (roleValido === 'diretor' && metadadosAdicionais.atleticaNome) {
          const { data: atlExistente } = await supabase
            .from('atleticas')
            .select('id')
            .ilike('nome', metadadosAdicionais.atleticaNome)
            .order('criado_em', { ascending: false })
            .maybeSingle();

          if (atlExistente) {
            atleticaId = atlExistente.id;
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

        // Sincroniza via API com service role para garantir persistência no banco
        try {
          await fetch('/api/perfil/sincronizar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nome,
              cpf: metadadosAdicionais.cpf || null,
              telefone: metadadosAdicionais.telefone || null,
            }),
          });
        } catch {
          // Ignora
        }
      } catch (errCad) {
        console.error('Exceção ao concluir cadastro:', errCad);
      }

      // Se for cadastro de diretor, deslogar imediatamente a sessão para impedir o auto-login
      if (roleValido === 'diretor') {
        await supabase.auth.signOut();
        setUsuario(null);
        setPerfil(null);
      } else {
        await buscarPerfil(userObj.id, {
          nome,
          full_name: nome,
          name: nome,
          cpf: metadadosAdicionais.cpf,
          telefone: metadadosAdicionais.telefone,
        });
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

  const recuperarSenha = async (
    email: string,
    turnstileToken?: string
  ): Promise<ResultadoAuth> => {
    const emailNorm = email.trim().toLowerCase();

    // 1. Verifica se o IP, Captcha ou o E-mail específico estão bloqueados/em cooldown
    const checkStatus = await checarRateLimitOuRegistrar('verificar_recuperacao', 'geral', turnstileToken, emailNorm);
    if (checkStatus.bloqueado) {
      return {
        erro: checkStatus.mensagem || `Muitas tentativas. Aguarde ${checkStatus.segundosRestantes}s para solicitar novamente.`,
        bloqueado: true,
        segundosRestantes: checkStatus.segundosRestantes,
        rateLimitData: checkStatus,
      };
    }

    try {
      const origens = typeof window !== 'undefined' ? window.location.origin : '';
      const protocolo = process.env.NEXT_PUBLIC_PROTOCOLO || 'https';
      const dominio = (process.env.NEXT_PUBLIC_DOMINIO_PRINCIPAL || 'meuingrss.com.br').replace(/\/+$/, '');
      const urlBase = origens || `${protocolo}://${dominio}`;
      const urlRedirecionamento = `${urlBase}/autenticacao/redefinir-senha`;

      const { error } = await supabase.auth.resetPasswordForEmail(emailNorm, {
        redirectTo: urlRedirecionamento,
      });

      if (error) {
        const errStatus = await checarRateLimitOuRegistrar('registrar_erro', 'geral', undefined, emailNorm);
        let msgFinal = traduzirErroAuth(error.message);
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

      // 2. Registra o envio com sucesso para este e-mail (iniciando o cooldown)
      const statusEnvio = await checarRateLimitOuRegistrar('registrar_recuperacao', 'geral', undefined, emailNorm);

      return {
        bloqueado: false,
        segundosRestantes: statusEnvio.segundosRestantes || 60,
        rateLimitData: statusEnvio,
      };
    } catch (err: any) {
      return { erro: traduzirErroAuth(err?.message) || 'Erro inesperado ao solicitar recuperação de senha.' };
    }
  };

  const redefinirSenha = async (novaSenha: string): Promise<ResultadoAuth> => {
    try {
      const { error } = await supabase.auth.updateUser({
        password: novaSenha,
      });

      if (error) {
        return { erro: traduzirErroAuth(error.message) };
      }

      return {};
    } catch (err: any) {
      return { erro: traduzirErroAuth(err?.message) || 'Erro ao redefinir senha.' };
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
        recuperarSenha,
        redefinirSenha,
      }}
    >
      {children}
    </ContextoAuth.Provider>
  );
}
