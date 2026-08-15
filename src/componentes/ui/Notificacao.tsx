'use client';

import { useState, createContext, useContext, useCallback } from 'react';
import { cn } from '@/lib/utilitarios';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

type TipoNotificacao = 'sucesso' | 'erro' | 'alerta' | 'info';

interface Notificacao {
  id: string;
  tipo: TipoNotificacao;
  titulo: string;
  mensagem?: string;
  duracao?: number;
}

interface ContextoNotificacaoType {
  notificar: (notificacao: Omit<Notificacao, 'id'>) => void;
  sucesso: (titulo: string, mensagem?: string) => void;
  erro: (titulo: string, mensagem?: string) => void;
  alerta: (titulo: string, mensagem?: string) => void;
  info: (titulo: string, mensagem?: string) => void;
}

const ContextoNotificacao = createContext<ContextoNotificacaoType | null>(null);

export function useNotificacao() {
  const ctx = useContext(ContextoNotificacao);
  if (!ctx) {
    throw new Error('useNotificacao deve ser usado dentro de ProvedorNotificacao');
  }
  return ctx;
}

const icones: Record<TipoNotificacao, React.ReactNode> = {
  sucesso: <CheckCircle className="w-5 h-5 text-sucesso" />,
  erro: <XCircle className="w-5 h-5 text-erro" />,
  alerta: <AlertTriangle className="w-5 h-5 text-alerta" />,
  info: <Info className="w-5 h-5 text-info" />,
};

const coresBorda: Record<TipoNotificacao, string> = {
  sucesso: 'border-l-sucesso',
  erro: 'border-l-erro',
  alerta: 'border-l-alerta',
  info: 'border-l-info',
};

export function ProvedorNotificacao({ children }: { children: React.ReactNode }) {
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);

  const removerNotificacao = useCallback((id: string) => {
    setNotificacoes((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const notificar = useCallback((notificacao: Omit<Notificacao, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const nova = { ...notificacao, id };
    setNotificacoes((prev) => [...prev, nova]);

    setTimeout(() => {
      removerNotificacao(id);
    }, notificacao.duracao || 4000);
  }, [removerNotificacao]);

  const sucesso = useCallback((titulo: string, mensagem?: string) => {
    notificar({ tipo: 'sucesso', titulo, mensagem });
  }, [notificar]);

  const erro = useCallback((titulo: string, mensagem?: string) => {
    notificar({ tipo: 'erro', titulo, mensagem });
  }, [notificar]);

  const alerta = useCallback((titulo: string, mensagem?: string) => {
    notificar({ tipo: 'alerta', titulo, mensagem });
  }, [notificar]);

  const info = useCallback((titulo: string, mensagem?: string) => {
    notificar({ tipo: 'info', titulo, mensagem });
  }, [notificar]);

  return (
    <ContextoNotificacao.Provider value={{ notificar, sucesso, erro, alerta, info }}>
      {children}

      {}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {notificacoes.map((n) => (
          <div
            key={n.id}
            className={cn(
              'pointer-events-auto vidro-forte rounded-xl p-4 border-l-4 animar-entrar-baixo shadow-glass',
              coresBorda[n.tipo]
            )}
          >
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 mt-0.5">{icones[n.tipo]}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-texto-principal">{n.titulo}</p>
                {n.mensagem && (
                  <p className="mt-0.5 text-xs text-texto-secundario">{n.mensagem}</p>
                )}
              </div>
              <button
                onClick={() => removerNotificacao(n.id)}
                className="flex-shrink-0 p-1 rounded-lg text-texto-terciario hover:text-texto-principal transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ContextoNotificacao.Provider>
  );
}
