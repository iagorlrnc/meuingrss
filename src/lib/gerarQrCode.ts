import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

function obterChaveSecreta(): string {
  const secret = process.env.QR_CODE_SECRET;
  if (!secret) {
    throw new Error(
      'QR_CODE_SECRET não está configurado no ambiente. Defina esta variável no .env.local para gerar hashes de ingressos.'
    );
  }
  return secret;
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
