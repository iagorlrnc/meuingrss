'use client';

import { useEffect, useRef } from 'react';

interface CaptchaCloudflareProps {
  onVerify?: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
  siteKey?: string;
  theme?: 'dark' | 'light' | 'auto';
  className?: string;
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          theme?: 'dark' | 'light' | 'auto';
          callback?: (token: string) => void;
          'error-callback'?: () => void;
          'expired-callback'?: () => void;
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
    onloadTurnstileCallback?: () => void;
  }
}

export default function CaptchaCloudflare({
  onVerify,
  onError,
  onExpire,
  siteKey = process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY || '1x00000000000000000000AA',
  theme = 'dark',
  className = '',
}: CaptchaCloudflareProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    let scriptEl = document.getElementById('cf-turnstile-script') as HTMLScriptElement;

    function renderWidget() {
      if (!containerRef.current || !window.turnstile) return;
      if (widgetIdRef.current) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {}
      }

      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme,
        callback: (token) => {
          if (onVerify) onVerify(token);
        },
        'error-callback': () => {
          if (onError) onError();
        },
        'expired-callback': () => {
          if (onExpire) onExpire();
        },
      });
    }

    if (window.turnstile) {
      renderWidget();
    } else {
      if (!scriptEl) {
        scriptEl = document.createElement('script');
        scriptEl.id = 'cf-turnstile-script';
        scriptEl.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstileCallback';
        scriptEl.async = true;
        scriptEl.defer = true;
        document.head.appendChild(scriptEl);
      }

      const prevCallback = window.onloadTurnstileCallback;
      window.onloadTurnstileCallback = () => {
        if (prevCallback) prevCallback();
        renderWidget();
      };
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {}
      }
    };
  }, [siteKey, theme, onVerify, onError, onExpire]);

  return (
    <div className={`flex flex-col items-center justify-center my-3 min-h-[65px] ${className}`}>
      <div ref={containerRef} />
    </div>
  );
}
