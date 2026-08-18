'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface PreferenciasCookies {
  essenciais: boolean;
  analiticos: boolean;
  marketing: boolean;
}

interface ContextoCookiesTipo {
  bannerAberto: boolean;
  preferencias: PreferenciasCookies;
  abrirBanner: () => void;
  fecharBanner: () => void;
  salvarPreferencias: (novasPreferencias: PreferenciasCookies) => void;
  aceitarTodos: () => void;
  aceitarApenasEssenciais: () => void;
}

const PREFERENCIAS_PADRAO: PreferenciasCookies = {
  essenciais: true,
  analiticos: true,
  marketing: false,
};

const CHAVE_LOCAL_STORAGE = 'meuingrss_consentimento_cookies';

const ContextoCookies = createContext<ContextoCookiesTipo | undefined>(undefined);

function obterCookieNativo(nome: string): string | null {
  if (typeof document === 'undefined') return null;
  const prefixo = `${encodeURIComponent(nome)}=`;
  const cookies = document.cookie.split(';');
  for (let i = 0; i < cookies.length; i++) {
    const cookieAtual = cookies[i].trim();
    if (cookieAtual.startsWith(prefixo)) {
      return decodeURIComponent(cookieAtual.substring(prefixo.length));
    }
  }
  return null;
}

export function ProvedorCookies({ children }: { children: ReactNode }) {
  const [preferencias, setPreferencias] = useState<PreferenciasCookies>(PREFERENCIAS_PADRAO);
  const [bannerAberto, setBannerAberto] = useState<boolean>(false);

  useEffect(() => {
    try {
      const salvoLocal = localStorage.getItem(CHAVE_LOCAL_STORAGE);
      const salvoCookie = obterCookieNativo(CHAVE_LOCAL_STORAGE);
      if (salvoLocal) {
        setPreferencias(JSON.parse(salvoLocal));
        setBannerAberto(false);
      } else if (salvoCookie) {
        setPreferencias(JSON.parse(salvoCookie));
        setBannerAberto(false);
      } else {
        setBannerAberto(true);
      }
    } catch {
      setBannerAberto(false);
    }
  }, []);

  function abrirBanner() {
    setBannerAberto(true);
  }

  function fecharBanner() {
    setBannerAberto(false);
  }

  function salvarPreferencias(novasPreferencias: PreferenciasCookies) {
    const atualizadas = { ...novasPreferencias, essenciais: true };
    setPreferencias(atualizadas);
    setBannerAberto(false);
    try {
      localStorage.setItem(CHAVE_LOCAL_STORAGE, JSON.stringify(atualizadas));
      const ehHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
      document.cookie = `${CHAVE_LOCAL_STORAGE}=${encodeURIComponent(JSON.stringify(atualizadas))}; path=/; max-age=31536000; SameSite=Lax${ehHttps ? '; Secure' : ''}`;
    } catch {
      // Ignorar erros
    }
  }

  function aceitarTodos() {
    salvarPreferencias({
      essenciais: true,
      analiticos: true,
      marketing: true,
    });
  }

  function aceitarApenasEssenciais() {
    salvarPreferencias({
      essenciais: true,
      analiticos: false,
      marketing: false,
    });
  }

  return (
    <ContextoCookies.Provider
      value={{
        bannerAberto,
        preferencias,
        abrirBanner,
        fecharBanner,
        salvarPreferencias,
        aceitarTodos,
        aceitarApenasEssenciais,
      }}
    >
      {children}
    </ContextoCookies.Provider>
  );
}

export function usarCookies() {
  const contexto = useContext(ContextoCookies);
  if (!contexto) {
    throw new Error('usarCookies deve ser usado dentro de um ProvedorCookies');
  }
  return contexto;
}
