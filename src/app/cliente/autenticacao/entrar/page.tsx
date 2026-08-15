'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { usarAutenticacao } from '@/contextos/ContextoAutenticacao';
import Botao from '@/componentes/ui/Botao';
import CampoTexto from '@/componentes/ui/CampoTexto';
import Modal from '@/componentes/ui/Modal';
import Carregando from '@/componentes/ui/Carregando';
import { Ticket, Mail, Lock, ArrowLeft, Clock } from 'lucide-react';

function FormularioEntrar() {
  const { entrar, entrarComGoogle } = usarAutenticacao();
  const parametrosBusca = useSearchParams();
  const redirecionar = parametrosBusca.get('redirecionar') || '/';

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [modalPendenteAberto, setModalPendenteAberto] = useState(false);

  async function aoSubmeter(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setCarregando(true);

    const resultado = await entrar(email, senha);

    if (resultado.erro) {
      setErro(
        resultado.erro.includes('Invalid login')
          ? 'Email ou senha incorretos'
          : resultado.erro
      );
      setCarregando(false);
    } else {
      const { criarClienteNavegador } = await import('@/lib/supabase/cliente');
      const supabase = criarClienteNavegador();
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data: perfil } = await supabase
          .from('profiles')
          .select('role, status')
          .eq('id', user.id)
          .single();

        if (perfil?.status === 'pendente') {
          await supabase.auth.signOut();
          setModalPendenteAberto(true);
          setCarregando(false);
          return;
        }

        if (perfil?.role === 'diretor') {
          window.location.href = '/diretor';
          return;
        }
        if (perfil?.role === 'admin') {
          window.location.href = '/admin';
          return;
        }
      }

      window.location.href = redirecionar;
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {}
      <div className="orbe-roxa -top-20 -left-20 opacity-40" />
      <div className="orbe-rosa bottom-20 right-0 opacity-30" />

      <div className="w-full max-w-md relative z-10">
        {}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-texto-secundario hover:text-texto-principal transition-colors mb-8"
        >
          <ArrowLeft size={16} />
          Voltar ao início
        </Link>

        {}
        <div className="vidro-forte rounded-3xl p-8 shadow-glass animar-entrar-baixo">
          {}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#ff007a] via-[#8b5cf6] to-[#026cdf] flex items-center justify-center shadow-lg shrink-0">
              <Ticket className="w-6 h-6 text-white transform -rotate-12" />
            </div>
            <div>
              <h1 className="text-xl font-bold font-titulo text-texto-principal">
                Entrar
              </h1>
              <p className="text-xs text-texto-terciario">
                Acesse sua conta meuingrss
              </p>
            </div>
          </div>

          {}
          <form onSubmit={aoSubmeter} className="space-y-5">
            <CampoTexto
              rotulo="Email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail((e.target as HTMLInputElement).value)}
              icone={<Mail size={18} />}
              required
            />

            <CampoTexto
              rotulo="Senha"
              type="password"
              placeholder="••••••••"
              value={senha}
              onChange={(e) => setSenha((e.target as HTMLInputElement).value)}
              icone={<Lock size={18} />}
              required
            />

            {erro && (
              <div className="p-3 rounded-xl bg-erro/10 border border-erro/20 text-sm text-erro">
                {erro}
              </div>
            )}

            <Botao
              type="submit"
              larguraTotal
              tamanho="lg"
              carregando={carregando}
            >
              Entrar
            </Botao>
          </form>

          {}
          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-borda-sutil" />
            <span className="text-xs text-texto-terciario">ou continue com</span>
            <div className="flex-1 h-px bg-borda-sutil" />
          </div>

          {}
          <Botao
            variante="contorno"
            larguraTotal
            tamanho="lg"
            onClick={entrarComGoogle}
            icone={
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
            }
          >
            Google
          </Botao>

          {}
          <p className="text-center text-sm text-texto-secundario mt-6">
            Não tem conta?{' '}
            <Link
              href="/autenticacao/cadastro"
              className="text-primaria-400 hover:text-primaria-300 font-medium transition-colors"
            >
              Cadastre-se gratuitamente
            </Link>
          </p>
        </div>
      </div>

      {/* Modal Pop-up de Aguardando Aprovação */}
      <Modal
        aberto={modalPendenteAberto}
        aoFechar={() => setModalPendenteAberto(false)}
        tamanho="sm"
      >
        <div className="text-center space-y-4 py-2">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400 shadow-lg shadow-amber-500/10">
            <Clock size={32} />
          </div>

          <h3 className="text-xl font-black font-titulo text-white">
            Cadastro em Análise
          </h3>

          <p className="text-xs text-slate-300 leading-relaxed">
            Sua conta de <strong className="text-amber-400 font-bold">Diretor de Atlética</strong> e os dados cadastrados ainda estão aguardando a aprovação do <strong className="text-white">Administrador</strong>.
          </p>

          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 font-medium">
            ⏳ Você receberá a permissão de acesso ao painel assim que o administrador aprovar seu credenciamento.
          </div>

          <Botao
            variante="festiva"
            larguraTotal
            onClick={() => setModalPendenteAberto(false)}
          >
            Entendido
          </Botao>
        </div>
      </Modal>
    </div>
  );
}

export default function PaginaEntrar() {
  return (
    <Suspense fallback={<Carregando telaCheia texto="Carregando..." />}>
      <FormularioEntrar />
    </Suspense>
  );
}
