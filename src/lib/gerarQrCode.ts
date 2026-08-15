import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

function obterChaveSecreta(): string {
  return (
    process.env.QR_CODE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    'meuingrss-secret-qr-key-2026'
  );
}

export function gerarHashIngresso(ingressoId: string, eventoId: string): string {
  const payload = `${ingressoId}:${eventoId}:${Date.now()}`;
  const uuid = uuidv4();
  const hmac = crypto
    .createHmac('sha256', obterChaveSecreta())
    .update(payload)
    .digest('hex')
    .slice(0, 16);
  return `${uuid}-${hmac}`;
}
