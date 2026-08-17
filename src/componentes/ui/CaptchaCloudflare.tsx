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
    <div className={`flex flex-col items-center justify-center my-3 min-h-[65px] w-full max-w-full overflow-hidden ${className}`}>
      <div className="w-full overflow-hidden flex justify-center items-center py-1">
        <div className="flex justify-center items-center transform scale-[0.88] xs:scale-95 sm:scale-100 origin-center transition-transform">
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
      </div>
    </div>
  );
}
