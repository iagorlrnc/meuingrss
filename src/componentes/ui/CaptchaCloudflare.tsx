'use client';

import { Turnstile } from '@marsidev/react-turnstile';

interface CaptchaCloudflareProps {
  onVerify?: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
  siteKey?: string;
  theme?: 'dark' | 'light' | 'auto';
  className?: string;
}

export default function CaptchaCloudflare({
  onVerify,
  onError,
  onExpire,
  siteKey,
  theme = 'dark',
  className = '',
}: CaptchaCloudflareProps) {
  const keyToUse =
    siteKey ||
    process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY ||
    '1x00000000000000000000AA';

  return (
    <div className={`flex flex-col items-center justify-center my-3 min-h-[65px] w-full ${className}`}>
      <Turnstile
        siteKey={keyToUse}
        options={{
          theme,
        }}
        onSuccess={(token) => {
          if (onVerify) onVerify(token);
        }}
        onError={() => {
          if (onError) onError();
        }}
        onExpire={() => {
          if (onExpire) onExpire();
        }}
      />
    </div>
  );
}
