import { useState, useEffect, useCallback, useRef } from 'react';

export function useRateLimitAuth(aoDesbloquear?: () => void) {
  const [bloqueado, setBloqueado] = useState(false);
  const [segundosRestantes, setSegundosRestantes] = useState(0);
  const [mensagem, setMensagem] = useState('');
  const [verificando, setVerificando] = useState(true);
  const callbackRef = useRef(aoDesbloquear);

  useEffect(() => {
    callbackRef.current = aoDesbloquear;
  }, [aoDesbloquear]);

  const consultarRateLimit = useCallback(async () => {
    try {
      setVerificando(true);
      const res = await fetch('/api/auth/rate-limit', {
        method: 'GET',
        cache: 'no-store',
      });
      const data = await res.json();
      if (data.bloqueado) {
        setBloqueado(true);
        setSegundosRestantes(data.segundosRestantes || 0);
        setMensagem(data.mensagem || 'Muitas tentativas incorretas. Bloqueado temporariamente.');
      } else {
        setBloqueado(false);
        setSegundosRestantes(0);
        setMensagem('');
        callbackRef.current?.();
      }
    } catch {
      // Ignorar erro de rede pontual
    } finally {
      setVerificando(false);
    }
  }, []);

  useEffect(() => {
    consultarRateLimit();
  }, [consultarRateLimit]);

  useEffect(() => {
    if (segundosRestantes <= 0) {
      if (bloqueado) {
        setBloqueado(false);
        setMensagem('');
        callbackRef.current?.();
      }
      return;
    }

    const timer = setInterval(() => {
      setSegundosRestantes((prev) => {
        if (prev <= 1) {
          setBloqueado(false);
          setMensagem('');
          callbackRef.current?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [segundosRestantes, bloqueado]);

  const aplicarStatus = useCallback((data: { bloqueado?: boolean; segundosRestantes?: number; mensagem?: string }) => {
    if (data?.bloqueado) {
      setBloqueado(true);
      setSegundosRestantes(data.segundosRestantes || 0);
      if (data.mensagem) setMensagem(data.mensagem);
    } else {
      setBloqueado(false);
      setSegundosRestantes(0);
      setMensagem('');
      callbackRef.current?.();
    }
  }, []);

  return {
    bloqueado,
    segundosRestantes,
    mensagemRateLimit: mensagem,
    verificandoRateLimit: verificando,
    consultarRateLimit,
    aplicarStatus,
  };
}
