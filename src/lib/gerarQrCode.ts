import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

function obterChaveSecreta(): string {
  const secret = process.env.QR_CODE_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      'FATAL: QR_CODE_SECRET não está configurado ou é muito curto (mín. 16 caracteres). ' +
      'Configure uma chave aleatória segura no .env.local antes de usar o sistema.'
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

export async function gerarQrCodeDataUrlComLogo(
  textoQr: string,
  logoUrl: string = '/logomueingrss.png'
): Promise<string> {
  const QRCode = (await import('qrcode')).default;

  const baseQrDataUrl = await QRCode.toDataURL(textoQr, {
    width: 400,
    margin: 2,
    color: { dark: '#080c14', light: '#ffffff' },
    errorCorrectionLevel: 'H',
  });

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return baseQrDataUrl;
  }

  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return resolve(baseQrDataUrl);
    }

    const imgQr = new Image();
    imgQr.crossOrigin = 'anonymous';

    imgQr.onload = () => {
      ctx.drawImage(imgQr, 0, 0, 400, 400);

      const imgLogo = new Image();
      imgLogo.crossOrigin = 'anonymous';

      imgLogo.onload = () => {
        const logoSize = 88;
        const x = (400 - logoSize) / 2;
        const y = (400 - logoSize) / 2;
        const padding = 6;

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x - padding, y - padding, logoSize + padding * 2, logoSize + padding * 2, 14);
        } else {
          ctx.rect(x - padding, y - padding, logoSize + padding * 2, logoSize + padding * 2);
        }
        ctx.fill();
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.drawImage(imgLogo, x, y, logoSize, logoSize);
        resolve(canvas.toDataURL('image/png'));
      };

      imgLogo.onerror = () => {
        resolve(baseQrDataUrl);
      };

      imgLogo.src = logoUrl;
    };

    imgQr.onerror = () => {
      resolve(baseQrDataUrl);
    };

    imgQr.src = baseQrDataUrl;
  });
}
