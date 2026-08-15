<div align="center">

# 🎓 meuingrss
### Plataforma Full-Stack de Venda e Gestão de Ingressos Universitários

[![Next.js](https://img.shields.io/badge/Next.js-15_(App_Router)-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4.0-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Database_%26_Auth-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)
[![Mercado Pago](https://img.shields.io/badge/Mercado_Pago-Pix_%26_Cartão-009EE3?style=for-the-badge&logo=mercadopago&logoColor=white)](https://www.mercadopago.com.br/)
[![Vitest](https://img.shields.io/badge/Vitest-Testing-6E9F18?style=for-the-badge&logo=vitest&logoColor=white)](https://vitest.dev/)
[![License](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)

<p align="center">
  <b>Solução de alta performance para Atléticas Acadêmicas, eventos universitários e estudantes.</b><br>
  Integração nativa com Mercado Pago via Pix, validação presencial de QR Code antifraude com HMAC, gestão multi-lotes e arquitetura multi-subdomínio.
</p>

[Visão Geral](#-visão-geral) •
[Funcionalidades](#-funcionalidades-principais) •
[Arquitetura de Subdomínios](#-arquitetura-de-subdomínios) •
[Stack Técnica](#-stack-técnica) •
[Estrutura](#-estrutura-do-projeto)

---

</div>

## 📌 Visão Geral

O **meuingrss** foi desenvolvido para transformar a gestão de festas e recepções de calouros organizadas por Atléticas Acadêmicas Universitárias. A plataforma elimina processos manuais, filas de portaria inseguras e fraudes de ingressos duplicados através de um ecossistema integrado em 3 portais especializados.

---

## ✨ Funcionalidades Principais

### 🎓 1. Portal do Estudante / Cliente (`meuingrss.com.br`)
- **Catálogo de Eventos & Atléticas**: Navegação por festas, filtro por cidade/faculdade e detalhes dos lotes ativos.
- **Checkout Instantâneo via Pix**: Pagamento automatizado via Mercado Pago com QR Code Pix gerado na hora e atualização por Webhook/Polling em tempo real.
- **Gestão de Ingressos**: Acesso à carteira digital de ingressos com QR Code dinâmico em tempo real.
- **Exportação em PDF**: Emissão do ingresso em arquivo PDF otimizado para impressão ou visualização offline.

### 🎪 2. Portal do Diretor da Atlética (`diretoria.meuingrss.com.br`)
- **Gestão de Eventos e Lotes**: Criação de festas, configuração de lotes progressivos (1º lote, 2º lote, etc.), limites de quantidade e data/hora de abertura/fechamento.
- **Scanner Presencial de QR Code**: Validador embutido no navegador (`html5-qrcode`) que utiliza a câmera do celular/tablet para realizar a leitura rápida na portaria do evento.
- **Métricas e Dashboards de Vendas**: Acompanhamento de receita total, ingressos vendidos, taxa de check-in em tempo real e ticket médio.

### 👑 3. Portal de Administração Geral (`dev.meuingrss.com.br`)
- **Onboarding de Atléticas**: Aprovação e cadastro de novas atléticas parceiras na plataforma.
- **Visão Global Financeira**: Controle consolidado de vendas, repasses e conciliação de pagamentos.
- **Auditoria & Segurança**: Gerenciamento de usuários, permissões e status do sistema.

---

## 🌐 Arquitetura de Subdomínios

A aplicação utiliza o **Middleware do Next.js** para realizar o roteamento dinâmico transparente baseado no cabeçalho `Host` da requisição HTTP:

| Subdomínio | Ambiente Dev Local | Função / Destino no App Router |
| :--- | :--- | :--- |
| **Cliente** (`meuingrss.com.br`) | `meuingrss.local:3000` | `src/app/cliente` |
| **Diretor** (`diretoria.meuingrss.com.br`) | `diretoria.meuingrss.local:3000` | `src/app/diretor` |
| **Admin Geral** (`dev.meuingrss.com.br`) | `dev.meuingrss.local:3000` | `src/app/admin` |

---

## 🛠️ Stack Técnica

| Categoria | Tecnologias Utilizadas |
| :--- | :--- |
| **Frontend** | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4, Lucide Icons |
| **Backend & BD** | Supabase (PostgreSQL, Auth, Storage, Edge Functions, Row Level Security) |
| **Pagamentos** | Mercado Pago SDK (Pix e Cartão de Crédito em até 12x) com Webhooks |
| **Leitura & PDF** | `html5-qrcode` (Scanner via Câmera Browser), `jspdf`, `qrcode`, `crypto-js` |
| **Qualidade & Testes** | Vitest, ESLint, TypeScript Strict Type Checking |

## 📂 Estrutura do Projeto

```
meuingrss/
├── public/                    # Arquivos estáticos e logos
├── src/
│   ├── app/                   # Next.js App Router por subdomínios
│   │   ├── admin/             # Rotas do Portal do Admin Geral
│   │   ├── api/               # API Routes (Webhooks, Pagamentos, Cron)
│   │   ├── cliente/           # Rotas do Portal do Estudante
│   │   └── diretor/           # Rotas do Portal do Diretor da Atlética
│   ├── componentes/           # Componentes UI reutilizáveis
│   ├── contextos/             # Contextos Globais do React (Auth, Ingressos)
│   ├── lib/                   # Clientes SDK (Supabase, Mercado Pago, HMAC)
│   ├── tipos/                 # Definições TypeScript
│   └── middleware.ts          # Roteador dinâmico de subdomínio
├── supabase/
│   └── migracoes/             # Scripts SQL de schema, RLS e RPCs atômicas
├── package.json
└── README.md
```

---

## 🧪 Testes Automatizados

O projeto utiliza **Vitest** para testes de rotas, funções utilitárias e geração/validação de HMAC:

```bash
npm run test
```

---

## 📄 Licença

Este projeto é disponibilizado sob a licença [MIT](LICENSE). Veja o arquivo de licença para mais detalhes.

<div align="center">
  <sub>Desenvolvido para fortalecer o cenário universitário e as Atléticas Acadêmicas.</sub>
</div>

