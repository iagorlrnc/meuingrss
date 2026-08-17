import { NextRequest, NextResponse } from 'next/server';
import { paymentClient, ehMercadoPagoConfigurado } from '@/lib/mercadopago';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { criarClienteServidor } from '@/lib/supabase/servidor';
import { logger } from '@/lib/logger';
import { gerarHashIngresso } from '@/lib/gerarQrCode';
import { enviarNotificacaoIngressoLiberado } from '@/lib/notificacoes';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface DetalheReconciliacao {
  id: string | number;
  status?: string;
  reconciliado?: boolean;
  motivo?: string;
  erro?: string;
  pedido_id?: string;
  ingressos_ids?: string[];
}

/**
 * Endpoint de Reconciliação Administrativa de Pagamentos
 * Permite varredura geral ou reconciliação de IDs de pagamento específicos do Mercado Pago.
 * Protegido por autenticação de administrador.
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Verificação de Autenticação do Administrador
    const supabaseServidor = await criarClienteServidor();
    const { data: { user }, error: erroUser } = await supabaseServidor.auth.getUser();

    if (erroUser || !user) {
      return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 });
    }

    const { data: perfil } = await supabaseServidor
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!perfil || perfil.role !== 'admin') {
      logger.security('Tentativa não autorizada de acesso à reconciliação administrativa', { userId: user.id });
      return NextResponse.json({ erro: 'Acesso restrito a administradores' }, { status: 403 });
    }

    if (!ehMercadoPagoConfigurado()) {
      return NextResponse.json({ erro: 'Mercado Pago não está configurado' }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}));
    const ids_especificos: (string | number)[] = Array.isArray(body?.ids_pagamento) ? body.ids_pagamento : [];

    const supabase = criarClienteAdmin();

    const relatorio: {
      verificados: number;
      recuperados: number;
      ja_existentes: number;
      erros: number;
      detalhes: DetalheReconciliacao[];
    } = {
      verificados: 0,
      recuperados: 0,
      ja_existentes: 0,
      erros: 0,
      detalhes: [],
    };

    let pagamentosParaProcessar: Array<Awaited<ReturnType<typeof paymentClient.get>>> = [];

    // Se foram passados IDs específicos, busca cada um individualmente
    if (ids_especificos.length > 0) {
      for (const id of ids_especificos) {
        try {
          const p = await paymentClient.get({ id: String(id) });
          if (p) pagamentosParaProcessar.push(p);
        } catch (e) {
          relatorio.erros++;
          relatorio.detalhes.push({ id, erro: `Falha ao buscar no gateway: ${String(e)}` });
        }
      }
    } else {
      // Caso contrário, busca os últimos 50 pagamentos na API do Mercado Pago
      const searchRes = await paymentClient.search({
        options: {
          sort: 'date_created',
          criteria: 'desc',
          limit: 50,
        },
      });
      pagamentosParaProcessar = (searchRes.results || []) as unknown as Array<Awaited<ReturnType<typeof paymentClient.get>>>;
    }

    for (const payment of pagamentosParaProcessar) {
      relatorio.verificados++;
      const paymentId = String(payment.id);

      if (payment.status !== 'approved') {
        relatorio.detalhes.push({ id: paymentId, status: payment.status || 'desconhecido', reconciliado: false, motivo: 'Pagamento não aprovado no gateway' });
        continue;
      }

      // 2. Extração dos dados do pedido e metadados
      let orderId = payment.external_reference;
      let metadata = payment.metadata as Record<string, unknown> | undefined;

      if (orderId && !UUID_REGEX.test(orderId)) {
        try {
          const parsed = JSON.parse(orderId);
          metadata = { ...metadata, ...parsed };
          orderId = parsed.pedido_id || parsed.order_id;
        } catch {
          // Ignora
        }
      }

      let pedido = null;
      if (orderId && UUID_REGEX.test(orderId)) {
        const { data: p } = await supabase.from('pedidos').select('*').eq('id', orderId).maybeSingle();
        pedido = p;
      }

      // 3. Checagem de Idempotência: Já existe ingresso ou pagamento com esse ID?
      const { data: pagExistente } = await supabase
        .from('pagamentos')
        .select('id')
        .eq('gateway_transaction_id', paymentId)
        .maybeSingle();

      if (pagExistente || (pedido && pedido.status === 'aprovado')) {
        relatorio.ja_existentes++;
        relatorio.detalhes.push({ id: paymentId, reconciliado: false, motivo: 'Já registrado e aprovado no banco de dados' });
        continue;
      }

      const eventoId = pedido?.evento_id || String(metadata?.evento_id || '');
      const loteId = pedido?.lote_id || String(metadata?.lote_id || '');
      const compradorId = pedido?.comprador_id || String(metadata?.comprador_id || '');
      const quantidade = pedido?.quantidade || parseInt(String(metadata?.quantidade || '1'), 10);
      const valorUnitario = pedido?.valor_unitario !== undefined ? Number(pedido.valor_unitario) : (Number(payment.transaction_amount || 0) / quantidade);
      const metodoPagamento = payment.payment_method_id || 'mercadopago';

      if (!eventoId || !loteId || !compradorId || isNaN(quantidade) || quantidade < 1) {
        relatorio.detalhes.push({ id: paymentId, status: 'approved', reconciliado: false, motivo: 'Metadados ausentes ou incompletos' });
        continue;
      }

      const qrHashes: string[] = [];
      for (let i = 0; i < quantidade; i++) {
        qrHashes.push(gerarHashIngresso(`${eventoId}-${paymentId}-${i}-${Date.now()}`, eventoId));
      }

      try {
        let finalOrderId = pedido?.id;

        // Se o pedido não existia na tabela 'pedidos', cria-o agora
        if (!finalOrderId) {
          const { data: novoPed } = await supabase
            .from('pedidos')
            .insert({
              comprador_id: compradorId,
              evento_id: eventoId,
              lote_id: loteId,
              quantidade,
              valor_unitario: valorUnitario,
              valor_total: Number(payment.transaction_amount || 0),
              status: 'aprovado',
              gateway_payment_id: paymentId,
              metodo_pagamento: metodoPagamento,
              pago_em: payment.date_approved || new Date().toISOString(),
            })
            .select('id')
            .single();

          finalOrderId = novoPed?.id;
        } else {
          await supabase
            .from('pedidos')
            .update({
              status: 'aprovado',
              gateway_payment_id: paymentId,
              metodo_pagamento: metodoPagamento,
              pago_em: payment.date_approved || new Date().toISOString(),
            })
            .eq('id', finalOrderId);
        }

        // Insere Ingressos e Pagamentos
        const ingressosIds: string[] = [];
        for (let i = 0; i < quantidade; i++) {
          const { data: ing, error: errIng } = await supabase
            .from('ingressos')
            .insert({
              evento_id: eventoId,
              lote_id: loteId,
              comprador_id: compradorId,
              qr_code_hash: qrHashes[i],
              status: 'valido',
              data_compra: payment.date_approved || new Date().toISOString(),
            })
            .select('id')
            .single();

          if (errIng || !ing) {
            throw new Error(errIng?.message || 'Falha ao inserir ingresso na reconciliação');
          }

          ingressosIds.push(ing.id);

          await supabase.from('pagamentos').insert({
            ingresso_id: ing.id,
            valor: valorUnitario,
            status: 'aprovado',
            gateway_transaction_id: paymentId,
            metodo_pagamento: metodoPagamento,
            criado_em: payment.date_approved || new Date().toISOString(),
          });
        }

        enviarNotificacaoIngressoLiberado({
          comprador_id: compradorId,
          quantidade,
          gateway_transaction_id: paymentId,
          email_comprador: payment.payer?.email,
        });

        relatorio.recuperados++;
        relatorio.detalhes.push({
          id: paymentId,
          reconciliado: true,
          pedido_id: finalOrderId,
          ingressos_ids: ingressosIds,
          motivo: 'Ingressos gerados e creditados com sucesso!',
        });
      } catch (errRec: unknown) {
        relatorio.erros++;
        relatorio.detalhes.push({ id: paymentId, erro: errRec instanceof Error ? errRec.message : String(errRec) });
      }
    }

    logger.info('Reconciliação administrativa concluída', relatorio);

    return NextResponse.json({
      sucesso: true,
      relatorio,
    });
  } catch (error) {
    logger.error('Erro na reconciliação administrativa de pagamentos', error);
    return NextResponse.json({ erro: 'Erro interno durante a reconciliação' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    descricao: 'Envie um POST autenticado como admin para rodar a reconciliação',
  });
}
