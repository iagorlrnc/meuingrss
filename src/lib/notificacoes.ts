import { logger } from './logger';

interface DadosNotificacaoIngresso {
  comprador_id: string;
  evento_titulo?: string;
  quantidade: number;
  gateway_transaction_id: string;
  email_comprador?: string;
}

/**
 * Envia notificação por e-mail e alerta in-app de forma assíncrona desacoplada.
 * Falhas neste envio JAMAIS devem travar ou reverter o pagamento/ingresso.
 */
export async function enviarNotificacaoIngressoLiberado(dados: DadosNotificacaoIngresso): Promise<void> {
  try {
    logger.info('Iniciando disparo desacoplado de notificação de ingresso', {
      comprador_id: dados.comprador_id,
      gateway_transaction_id: dados.gateway_transaction_id,
      quantidade: dados.quantidade,
    });

    // Simulação do envio de e-mail transacional (ex: Resend, SendGrid ou Nodemailer se configurado)
    if (dados.email_comprador) {
      const partes = dados.email_comprador.split('@');
      const emailMascarado = partes[0].length > 2
        ? `${partes[0].substring(0, 2)}***@${partes[1] || ''}`
        : `***@${partes[1] || ''}`;

      logger.info(`Simulando envio de e-mail de confirmação para ${emailMascarado}`, {
        evento: dados.evento_titulo || 'Evento',
        quantidade: dados.quantidade,
      });
    }

    logger.info('Notificação enviada com sucesso', { comprador_id: dados.comprador_id });
  } catch (error) {
    // Loga o erro sem lançar exceção (garante que webhook responde 200 OK)
    logger.error('Falha não-bloqueante no envio de notificação ao cliente', error, {
      comprador_id: dados.comprador_id,
      gateway_transaction_id: dados.gateway_transaction_id,
    });
  }
}
