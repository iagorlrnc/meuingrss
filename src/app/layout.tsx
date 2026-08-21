import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ProvedorNotificacao } from "@/componentes/ui/Notificacao";
import { ProvedorAutenticacao } from "@/contextos/ContextoAutenticacao";
import { ProvedorCookies } from "@/contextos/ContextoCookies";
import { ProvedorCarrinho } from "@/contextos/ContextoCarrinho";
import dynamic from "next/dynamic";

const BannerCookies = dynamic(() => import("@/componentes/ui/BannerCookies"));

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#080c14",
};

const dominioPrincipal = (process.env.NEXT_PUBLIC_DOMINIO_PRINCIPAL || 'meuingrss.com.br').replace(/\/+$/, '');
const protocoloConfig = process.env.NEXT_PUBLIC_PROTOCOLO || 'https';

export const metadata: Metadata = {
  metadataBase: new URL(`${protocoloConfig}://${dominioPrincipal}`),
  title: "MeuIngrss",
  description: "A plataforma definitiva para compra de ingressos de festas organizadas por atléticas universitárias. Encontre os melhores eventos, compre com segurança e entre com QR Code.",
  keywords: ["ingressos", "festas universitárias", "atlética", "eventos", "QR Code", "calourada"],
  authors: [{ name: "meuingrss" }],
  icons: {
    icon: "/logomueingrss.png",
    shortcut: "/logomueingrss.png",
    apple: "/logomueingrss.png",
  },
  openGraph: {
    title: "MeuIngrss",
    description: "Encontre os melhores eventos universitários e compre ingressos com segurança.",
    type: "website",
    images: ["/logomueingrss.png"],
  },
};

export default function LayoutRaiz({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">
        <ProvedorAutenticacao>
          <ProvedorCookies>
            <ProvedorNotificacao>
              <ProvedorCarrinho>
                {children}
                <BannerCookies />
              </ProvedorCarrinho>
            </ProvedorNotificacao>
          </ProvedorCookies>
        </ProvedorAutenticacao>
      </body>
    </html>
  );
}

