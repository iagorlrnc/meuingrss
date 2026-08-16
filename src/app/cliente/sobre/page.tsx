import { Metadata } from 'next';
import Link from 'next/link';
import { Ticket, ShieldCheck, Zap, Users, Sparkles, Award } from 'lucide-react';

const dominioPrincipal = (process.env.NEXT_PUBLIC_DOMINIO_PRINCIPAL || 'meuingrss.com.br').replace(/\/+$/, '');
const protocolo = process.env.NEXT_PUBLIC_PROTOCOLO || 'https';
const baseUrl = `${protocolo}://${dominioPrincipal}`;

export const metadata: Metadata = {
  title: 'Sobre o meuingrss — Plataforma de Ingressos para Festas Universitárias em Palmas/TO',
  description:
    'Saiba tudo sobre o meuingrss: a plataforma oficial de compra de ingressos para festas universitárias, calouradas e cervejadas de atléticas em Palmas/TO.',
  alternates: {
    canonical: `${baseUrl}/sobre`,
  },
  openGraph: {
    title: 'Sobre o meuingrss — Ingressos Universitários em Palmas/TO',
    description:
      'A plataforma definitiva para compra de ingressos digitais via QR Code para festas de atléticas universitárias.',
    url: `${baseUrl}/sobre`,
    siteName: 'meuingrss',
    locale: 'pt_BR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sobre o meuingrss',
    description: 'Compra rápida e segura de ingressos para festas universitárias em Palmas/TO.',
  },
};

export default function PaginaSobre() {
  const jsonLdSobre = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'meuingrss',
    url: baseUrl,
    logo: `${baseUrl}/logomueingrss.png`,
    description:
      'Plataforma de venda de ingressos digitais especializada em festas, calouradas e cervejadas organizadas por atléticas universitárias em Palmas e região.',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Palmas',
      addressRegion: 'TO',
      addressCountry: 'BR',
    },
    sameAs: [`${baseUrl}`],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdSobre) }}
      />
      <main className="min-h-screen bg-[#080c14] text-white py-12 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto space-y-12">
          {/* Header Banner */}
          <header className="text-center space-y-4 pt-6">
            <span className="inline-block px-3 py-1 rounded-full bg-[#ff007a]/15 text-[#ff007a] text-xs font-black uppercase tracking-widest border border-[#ff007a]/30">
              Plataforma Oficial de Ingressos
            </span>
            <h1 className="text-3xl sm:text-5xl font-black font-titulo tracking-tight uppercase leading-tight">
              Sobre o <span className="gradiente-texto">meuingrss</span>
            </h1>
            <p className="text-slate-300 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
              O <strong>meuingrss</strong> é a plataforma tecnológica de referência em Palmas (Tocantins) para a compra e venda de ingressos de festas universitárias, calouradas, cervejadas e eventos de atléticas.
            </p>
          </header>

          {/* Missão e O que Fazemos */}
          <section className="bg-[#0f172a] border border-white/10 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl">
            <h2 className="text-xl sm:text-2xl font-black uppercase font-titulo text-[#00e5ff] flex items-center gap-2">
              <Sparkles size={24} className="text-[#ff007a]" />
              Nossa Missão
            </h2>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              Conectar universitários, atléticas e produtores de eventos através de uma experiência de compra instantânea, segura e 100% digital. Eliminamos filas, ingressos físicos de papel e fraudes com a emissão automática de QR Codes validados em tempo real na portaria do evento.
            </p>
          </section>

          {/* Pilares */}
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="bg-[#0f172a] border border-white/10 rounded-xl p-6 space-y-3">
              <div className="w-12 h-12 rounded-lg bg-[#ff007a]/10 flex items-center justify-center text-[#ff007a]">
                <Zap size={24} />
              </div>
              <h3 className="text-lg font-black uppercase font-titulo text-white">Pagamento Instantâneo</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Pagamento via Pix aprovado na hora com emissão imediata do ingresso digital em QR Code no seu celular.
              </p>
            </div>

            <div className="bg-[#0f172a] border border-white/10 rounded-xl p-6 space-y-3">
              <div className="w-12 h-12 rounded-lg bg-[#00e5ff]/10 flex items-center justify-center text-[#00e5ff]">
                <ShieldCheck size={24} />
              </div>
              <h3 className="text-lg font-black uppercase font-titulo text-white">Segurança Antifraude</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Validação por leitura de QR Code em scanner oficial pelas equipes das atléticas, evitando clonagem e cópias.
              </p>
            </div>

            <div className="bg-[#0f172a] border border-white/10 rounded-xl p-6 space-y-3">
              <div className="w-12 h-12 rounded-lg bg-[#ffbe00]/10 flex items-center justify-center text-[#ffbe00]">
                <Users size={24} />
              </div>
              <h3 className="text-lg font-black uppercase font-titulo text-white">Foco Universitário</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Desenvolvido sob medida para atléticas acadêmicas de Palmas e região, oferecendo gestão de lotes e relatórios de vendas.
              </p>
            </div>
          </section>

          {/* Onde Atuamos */}
          <section className="bg-[#0f172a] border border-white/10 rounded-2xl p-6 sm:p-8 space-y-4">
            <h2 className="text-xl sm:text-2xl font-black uppercase font-titulo text-white flex items-center gap-2">
              <Award size={24} className="text-[#00e5ff]" />
              Onde Comprar Ingressos de Festa em Palmas/TO?
            </h2>
            <p className="text-slate-300 text-sm leading-relaxed">
              Se você está procurando onde comprar ingressos para as melhores festas universitárias de Palmas/TO (como recepções de calouros da UFT, Unitins, Ulbra, IFTO e faculdades da região), o <strong>meuingrss</strong> é o canal oficial. Acesse os eventos ativos, escolha o lote desejado e garanta seu ingresso com facilidade.
            </p>
            <div className="pt-4 flex flex-wrap gap-4">
              <Link href="/eventos">
                <button className="px-6 py-3 rounded-lg bg-gradient-to-r from-[#ff007a] to-[#8b5cf6] font-black uppercase text-sm text-white hover:opacity-90 transition-opacity">
                  Ver Eventos Disponíveis
                </button>
              </Link>
              <Link href="/atleticas">
                <button className="px-6 py-3 rounded-lg bg-[#162036] border border-white/10 font-bold text-sm text-white hover:bg-white/10 transition-colors">
                  Conhecer Atléticas Parceiras
                </button>
              </Link>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
