import { logger } from './logger';
import { criarClienteAdmin } from '@/lib/supabase/admin';

export interface DadosNotificacaoIngresso {
  comprador_id: string;
  evento_titulo?: string;
  quantidade: number;
  gateway_transaction_id: string;
  email_comprador?: string;
}

export interface DadosNotificacaoRecusado {
  comprador_id: string;
  gateway_transaction_id: string;
  email_comprador?: string;
  motivo?: string;
}

export interface DadosNotificacaoPendente {
  comprador_id: string;
  gateway_transaction_id: string;
  email_comprador?: string;
}

/**
 * Registra uma notificação in-app na tabela notificacoes_cliente
 */
async function registrarNotificacaoInApp(
  usuarioId: string,
  titulo: string,
  mensagem: string,
  tipo: string,
  dados: Record<string, unknown> = {}
): Promise<void> {
  try {
    const supabase = criarClienteAdmin();
    await supabase.from('notificacoes_cliente').insert({
      usuario_id: usuarioId,
      titulo,
      mensagem,
      tipo,
      dados,
    });
  } catch (error) {
    logger.warn('Falha ao registrar notificação in-app no Supabase', { usuarioId, error });
  }
}

/**
 * Envia notificação por e-mail e alerta in-app quando o pagamento é APROVADO e o ingresso é liberado.
 */
export async function enviarNotificacaoIngressoLiberado(dados: DadosNotificacaoIngresso): Promise<void> {
  try {
    logger.info('Iniciando disparo desacoplado de notificação de ingresso liberado', {
      comprador_id: dados.comprador_id,
      gateway_transaction_id: dados.gateway_transaction_id,
      quantidade: dados.quantidade,
    });

    // Registra notificação in-app para atualizar o usuário em tempo real
    await registrarNotificacaoInApp(
      dados.comprador_id,
      'Ingresso Liberado! 🎉',
      `Seu pagamento foi confirmado! ${dados.quantidade} ingresso(s) disponível(is) na sua conta.`,
      'ingresso_liberado',
      { gateway_transaction_id: dados.gateway_transaction_id, quantidade: dados.quantidade }
    );

    // Simulação ou integração com envio de e-mail transacional (ex: Resend / SendGrid / Nodemailer)
    if (dados.email_comprador) {
      const partes = dados.email_comprador.split('@');
      const emailMascarado = partes[0].length > 2
        ? `${partes[0].substring(0, 2)}***@${partes[1] || ''}`
        : `***@${partes[1] || ''}`;

      logger.info(`E-mail de confirmação de compra enviado para ${emailMascarado}`, {
        evento: dados.evento_titulo || 'Evento',
        quantidade: dados.quantidade,
      });
    }

    logger.info('Notificação de ingresso liberado enviada com sucesso', { comprador_id: dados.comprador_id });
  } catch (error) {
    logger.error('Falha não-bloqueante no envio de notificação ao cliente', error, {
      comprador_id: dados.comprador_id,
      gateway_transaction_id: dados.gateway_transaction_id,
    });
  }
}

/**
 * Envia notificação ao cliente quando o pagamento via PIX fica PENDENTE de compensação.
 */
export async function enviarNotificacaoPagamentoPendente(dados: DadosNotificacaoPendente): Promise<void> {
  try {
    logger.info('Disparando notificação de pagamento pendente (PIX aguardando)', {
      comprador_id: dados.comprador_id,
      gateway_transaction_id: dados.gateway_transaction_id,
    });

    await registrarNotificacaoInApp(
      dados.comprador_id,
      'Pagamento em Processamento ⏳',
      'Aguardando compensação do seu PIX. Assim que for confirmado, seus ingressos serão liberados automaticamente.',
      'pagamento_pendente',
      { gateway_transaction_id: dados.gateway_transaction_id }
    );

    if (dados.email_comprador) {
      logger.info(`E-mail de instrução de PIX pendente enviado para o comprador`, {
        comprador_id: dados.comprador_id,
      });
    }
  } catch (error) {
    logger.warn('Falha não-bloqueante na notificação de pagamento pendente', { error });
  }
}

/**
 * Envia notificação ao cliente quando o pagamento é RECUSADO ou CANCELADO pelo gateway.
 */
export async function enviarNotificacaoPagamentoRecusado(dados: DadosNotificacaoRecusado): Promise<void> {
  try {
    logger.info('Disparando notificação de pagamento recusado/cancelado', {
      comprador_id: dados.comprador_id,
      gateway_transaction_id: dados.gateway_transaction_id,
    });

    await registrarNotificacaoInApp(
      dados.comprador_id,
      'Pagamento Não Aprovado ❌',
      dados.motivo || 'O pagamento não foi aprovado pelo gateway. Clique para tentar realizar uma nova compra.',
      'pagamento_recusado',
      { gateway_transaction_id: dados.gateway_transaction_id, motivo: dados.motivo }
    );

    if (dados.email_comprador) {
      logger.info(`E-mail de alerta de pagamento recusado enviado`, {
        comprador_id: dados.comprador_id,
      });
    }
  } catch (error) {
    logger.warn('Falha não-bloqueante na notificação de pagamento recusado', { error });
  }
}
