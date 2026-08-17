# Documentação do Fluxo de Pagamento, Webhooks e Notificações (Mercado Pago)

Este documento descreve a arquitetura e o funcionamento completo da integração com o gateway **Mercado Pago** no projeto `meuingrss`, além do passo a passo para testes de homologação no ambiente **Sandbox**.

---

## 1. Visão Geral da Arquitetura

O sistema implementa o fluxo de compra, pagamento, confirmação assíncrona via webhook, emissão atômica de ingressos, notificações (in-app e e-mail) e reconciliação automática contra falhas de rede.

### Fluxo Passo a Passo:
1. **Criação do Pedido e Preferência (`POST /api/criar-sessao-pagamento`)**:
   - Valida a autenticação do comprador e sanitiza os parâmetros de lote e quantidade.
   - Gera um `external_reference` único prefixado com `PED-` (ex: `PED-A1B2C3D4E5F67890`).
   - Insere o registro do pedido na tabela `pedidos` do Supabase com o status inicial `'pending'`.
   - Cria a preferência de checkout na API do Mercado Pago incluindo `external_reference`, metadados, validade do Pix (10 minutos), opções de parcelamento (até 12x) e a URL oficial de webhook (`/api/webhooks/mercadopago`).
   - Retorna a URL de checkout (`init_point`) para o frontend redirecionar o comprador.

2. **Recepção e Validação do Webhook (`POST /api/webhooks/mercadopago`)**:
   - Valida a assinatura HMAC de segurança enviada nos cabeçalhos `x-signature` e `x-request-id` usando o segredo `MERCADOPAGO_WEBHOOK_SECRET`.
   - Retorna o status `200 OK` imediatamente para evitar estouro de timeout do Mercado Pago.
   - Trata a **idempotência estrita**: registra o `payment_id` na tabela `webhooks_processados`. Se a mesma notificação for recebida repetidas vezes, o re-processamento é ignorado.
   - Realiza a **consulta direta obrigatória** via `GET /v1/payments/{id}` na API do Mercado Pago para obter o estado oficial da transação.
   - Executa a **proteção anti price-tampering**: valida se o valor total pago no gateway é igual ou superior ao valor esperado do lote + taxa de serviço da plataforma (12%).

3. **Processamento Atômico do Pagamento (`processar_pagamento_aprovado`)**:
   - Transação atômica em PL/pgSQL executada via RPC no PostgreSQL (Migration `026_fluxo_pagamento_completo.sql`).
   - Atualiza o pedido para `'approved'` e vincula o `gateway_transaction_id`.
   - Executa a trava do lote (`FOR UPDATE`), verifica o estoque remanescente e incrementa o total vendido.
   - Insere os registros na tabela `ingressos` com hashes únicos de QR Code gerados via HMAC SHA-256.
   - Insere os registros em `pagamentos` e `transacoes_processadas`.
   - Registra um alerta in-app na tabela `notificacoes_cliente`.
   - Dispara o envio desacoplado de e-mail de confirmação do ingresso.

4. **Tratamento de Cancelamento e Estorno (`processar_estorno_pagamento`)**:
   - Quando um pagamento transita para `'refunded'`, `'charged_back'`, `'cancelled'` ou `'rejected'`:
     - Atualiza o pedido para o novo status.
     - Invalida os ingressos (`status = 'cancelado'`), o que aciona automaticamente o trigger no banco para decrementar as vendas do lote e liberar a vaga/estoque.
     - Dispara notificação in-app informando que o pagamento não foi aprovado.

5. **Notificações em Tempo Real**:
   - O cliente na página `Meus Ingressos` assina o canal **Supabase Realtime** nas tabelas `pedidos` e `ingressos`. Assim que o webhook processa a aprovação ou recusa, a tela atualiza instantaneamente sem necessidade de F5 manual.

6. **Reconciliação e Expiração de Pedidos (`/api/cron/expirar-pedidos` & `/api/admin/reconciliar-pagamentos`)**:
   - Rotina cron periódica que expira automaticamente pedidos `pending` sem pagamento após 10 minutos (tempo limite do Pix).
   - Endpoint administrativo que consulta diretamente na API do Mercado Pago pagamentos pendentes para reparar possíveis quedas de webhook.

---

## 2. Configuração de Variáveis de Ambiente

No arquivo `.env.local`, certifique-se de configurar:

```env
# Mercado Pago Credentials
MERCADOPAGO_ACCESS_TOKEN=APP_USR-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
MERCADOPAGO_WEBHOOK_SECRET=seusecretwh1234567890abcdef

# Configurações do Domínio do Sistema
NEXT_PUBLIC_DOMINIO_PRINCIPAL=meuingrss.com.br
NEXT_PUBLIC_PROTOCOLO=https

# Cron Secret para Proteção de Endpoints de Manutenção
CRON_SECRET=seucronsecret123456
```

---

## 3. Como Testar no Ambiente Sandbox do Mercado Pago

### Passo 1: Obter credenciais de teste no Mercado Pago
1. Acesse o [Painel de Desenvolvedores do Mercado Pago](https://www.mercadopago.com.br/developers/panel).
2. Selecione sua aplicação e obtenha as **Credenciais de Teste (Sandbox)**.
3. Copie o `Test Access Token` (`APP_USR-...`) para a variável `MERCADOPAGO_ACCESS_TOKEN`.

### Passo 2: Testando Webhooks em Ambiente Local (Ngrok / Localtunnel)
Como o Mercado Pago precisa enviar notificações HTTP POST para o seu backend, utilize o Ngrok em ambiente de desenvolvimento local:

```bash
ngrok http 3000
```

Copie a URL pública gerada pelo ngrok (ex: `https://abcd-123.ngrok-free.app`) e adicione ao seu arquivo `.env.local` ou configure na URL do Webhook no painel do Mercado Pago:
`https://abcd-123.ngrok-free.app/api/webhooks/mercadopago`

### Passo 3: Executar Teste de Compra End-to-End
1. Inicie a aplicação com `npm run dev`.
2. Acesse a página de um evento no navegador.
3. Escolha o lote e clique em **Comprar Ingresso**.
4. Você será redirecionado para o Checkout Sandbox do Mercado Pago.
5. Utilize os **Cartões de Teste do Mercado Pago**:
   - **Aprovado**: Número `5031 4321 0000 0000` | Validade `11/28` | CVV `123` | Nome `APRO`.
   - **Recusado**: Número `5031 4321 0000 0001` | Nome `OTHE`.
6. Após a aprovação, você será redirecionado de volta para a página `/meus-ingressos`.
7. Verifique o log no console do servidor:
   - Log do Webhook: `Assinatura HMAC do webhook validada com sucesso`
   - Log da RPC: `Pagamento processado e ingressos entregues com sucesso!`
   - O ingresso aparecerá com o QR Code pronto na página `/meus-ingressos`.

### Passo 4: Executar a Suíte de Testes Automatizados

```bash
npm run test
```

Resultado esperado: 52 testes passando com sucesso (`52 passed`).
