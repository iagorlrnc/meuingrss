import { NextRequest, NextResponse } from 'next/server';
import { paymentClient, ehMercadoPagoConfigurado } from '@/lib/mercadopago';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { criarClienteServidor } from '@/lib/supabase/servidor';
import { logger } from '@/lib/logger';
import { gerarHashIngresso } from '@/lib/gerarQrCode';

interface DetalheReconciliacao {
  id: string | number;
  status?: string;
  reconciliado?: boolean;
  motivo?: string;
  erro?: string;
  ingressos_ids?: string[];
}

/**
 * Endpoint de Reconciliação Periódica de Pagamentos
 * Compara pagamentos aprovados no gateway com as transações registradas no banco de dados.
 * Protegido por autenticação de administrador (sessão de usuário admin).
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Verificação de Autenticação Segura via Sessão Server-side do Supabase
    const supabaseServidor = await criarClienteServidor();
    const { data: { user }, error: erroUser } = await supabaseServidor.auth.getUser();

    if (erroUser || !user) {
      logger.security('Tentativa não autorizada de acessar endpoint de reconciliação de pagamentos', {
        ip: request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1',
      });
      return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 });
    }

    // Verificar se o usuário possui a role 'admin' no seu perfil
    const { data: perfil } = await supabaseServidor
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!perfil || perfil.role !== 'admin') {
      logger.security('Acesso negado ao endpoint de reconciliação: usuário sem role de admin', {
        userId: user.id,
        role: perfil?.role,
      });
      return NextResponse.json({ erro: 'Acesso restrito a administradores' }, { status: 403 });
    }

    if (!ehMercadoPagoConfigurado()) {
      return NextResponse.json({ erro: 'Mercado Pago não está configurado' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({ ids_pagamento: [] }));
    const ids_pagamento: (string | number)[] = Array.isArray(body?.ids_pagamento) ? body.ids_pagamento : [];

    const supabase = criarClienteAdmin();

    const relatorioReconciliacao: {
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

    if (ids_pagamento.length > 0) {
      for (const id of ids_pagamento) {
        relatorioReconciliacao.verificados++;
        try {
          const payment = await paymentClient.get({ id: String(id) });
          if (!payment || payment.status !== 'approved') {
            relatorioReconciliacao.detalhes.push({ id, status: payment?.status || 'nao_encontrado', reconciliado: false });
            continue;
          }

          let metadata = payment.metadata as Record<string, unknown> | undefined;
          if ((!metadata || !metadata.evento_id) && payment.external_reference) {
            try {
              metadata = JSON.parse(payment.external_reference);
            } catch {
              // Ignora erro de parse
            }
          }

          const evento_id = typeof metadata?.evento_id === 'string' ? metadata.evento_id : null;
          const lote_id = typeof metadata?.lote_id === 'string' ? metadata.lote_id : null;
          const comprador_id = typeof metadata?.comprador_id === 'string' ? metadata.comprador_id : null;
          const quantidadeRaw = metadata?.quantidade;
          const quantidade = typeof quantidadeRaw === 'string' || typeof quantidadeRaw === 'number'
            ? parseInt(String(quantidadeRaw), 10)
            : 1;

          if (!evento_id || !lote_id || !comprador_id || isNaN(quantidade) || quantidade < 1) {
            relatorioReconciliacao.detalhes.push({ id, status: 'approved', reconciliado: false, motivo: 'Metadados ausentes ou inválidos' });
            continue;
          }

          const qrHashes: string[] = [];
          for (let i = 0; i < quantidade; i++) {
            qrHashes.push(gerarHashIngresso(`REC-${evento_id}-${payment.id}-${i}`, evento_id));
          }

          const { data: resRpc, error: errRpc } = await supabase.rpc('processar_pagamento_aprovado', {
            p_gateway_transaction_id: String(payment.id),
            p_evento_id: evento_id,
            p_lote_id: lote_id,
            p_comprador_id: comprador_id,
            p_quantidade: quantidade,
            p_valor_unitario: Number(payment.transaction_amount || 0) / quantidade,
            p_metodo_pagamento: payment.payment_method_id || 'mercadopago',
            p_qr_hashes: qrHashes,
          });

          if (errRpc) {
            relatorioReconciliacao.erros++;
            relatorioReconciliacao.detalhes.push({ id, erro: errRpc.message });
          } else if (resRpc?.ja_processado) {
            relatorioReconciliacao.ja_existentes++;
            relatorioReconciliacao.detalhes.push({ id, reconciliado: false, motivo: 'Já existia no banco' });
          } else {
            relatorioReconciliacao.recuperados++;
            relatorioReconciliacao.detalhes.push({ id, reconciliado: true, ingressos_ids: resRpc.ingressos_ids });
          }
        } catch (e: unknown) {
          relatorioReconciliacao.erros++;
          const mensagem = e instanceof Error ? e.message : String(e);
          relatorioReconciliacao.detalhes.push({ id, erro: mensagem });
        }
      }
    }

    logger.info('Reconciliação de pagamentos concluída', relatorioReconciliacao);

    return NextResponse.json({
      sucesso: true,
      relatorio: relatorioReconciliacao,
    });
  } catch (error: unknown) {
    logger.error('Erro na reconciliação de pagamentos', error);
    return NextResponse.json({ erro: 'Erro interno durante a reconciliação' }, { status: 500 });
  }
}
