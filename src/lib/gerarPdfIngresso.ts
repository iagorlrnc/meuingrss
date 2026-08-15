import { formatarData, formatarMoeda } from '@/lib/utilitarios';
import type { Ingresso, Evento, LoteIngresso, Perfil } from '@/tipos';

export interface IngressoParaPdf extends Ingresso {
  evento: Evento & {
    atletica?: {
      nome: string;
      cidade?: string;
      faculdade?: string;
    };
  };
  lote: LoteIngresso;
  comprador?: Perfil;
}

/**
 * Converte uma URL de imagem para DataURL (Base64) de forma segura.
 * Trata erros de CORS ou carregamento sem quebrar a execução.
 */
async function carregarImagemBase64(url: string): Promise<string | null> {
  if (!url) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width || 600;
        canvas.height = img.naturalHeight || img.height || 300;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        } else {
          resolve(null);
        }
      } catch (err) {
        console.warn('Não foi possível converter imagem para canvas/base64 (CORS):', err);
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Gera e realiza o download do PDF oficial do ingresso do evento.
 */
export async function gerarPdfIngresso(
  ingresso: IngressoParaPdf,
  qrCodeUrl: string,
  nomeUsuarioFallBack?: string,
  emailUsuarioFallBack?: string
): Promise<void> {
  const { default: jsPDF } = await import('jspdf');

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const larguraPagina = doc.internal.pageSize.getWidth();
  const nomeComprador = ingresso.comprador?.nome || nomeUsuarioFallBack || 'Cliente MeuIngrss';
  const emailComprador = ingresso.comprador?.email || emailUsuarioFallBack || '—';

  // 1. Cabeçalho Superior da Plataforma (Background Escuro)
  doc.setFillColor(18, 18, 28); // #12121c
  doc.rect(0, 0, larguraPagina, 28, 'F');

  // Faixa decorativa em gradiente / cor de destaque
  doc.setFillColor(255, 190, 0); // #ffbe00 (Dourado MeuIngrss)
  doc.rect(0, 26, larguraPagina, 2, 'F');

  // Marca / Logo MeuIngrss
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('MeuIngrss', 15, 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(180, 180, 200);
  doc.text('COMPROVANTE OFICIAL DE INGRESSO', larguraPagina - 15, 18, { align: 'right' });

  let posY = 36;

  // 2. Banner do Evento (se disponível)
  const bannerBase64 = await carregarImagemBase64(ingresso.evento?.imagem_url || '');

  if (bannerBase64) {
    try {
      doc.addImage(bannerBase64, 'JPEG', 15, posY, larguraPagina - 30, 60);
      posY += 66;
    } catch {
      // Caso ocorra falha ao renderizar a imagem, usa bloco estilizado
      desenharBlocoEvento(doc, ingresso, 15, posY, larguraPagina - 30, 40);
      posY += 46;
    }
  } else {
    desenharBlocoEvento(doc, ingresso, 15, posY, larguraPagina - 30, 40);
    posY += 46;
  }

  // 3. Título e Informações do Evento
  doc.setTextColor(20, 20, 30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  
  // Quebra de linha no título se for muito grande
  const tituloLinhas = doc.splitTextToSize(ingresso.evento?.titulo || 'Evento Universitário', larguraPagina - 30);
  doc.text(tituloLinhas, 15, posY);
  posY += (tituloLinhas.length * 7) + 2;

  // Atlética / Organizador
  if (ingresso.evento?.atletica?.nome) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 140, 0);
    doc.text(`Organizado por: ${ingresso.evento.atletica.nome}`, 15, posY);
    posY += 8;
  }

  // Caixa de Detalhes do Evento (Grid 2 colunas)
  doc.setFillColor(245, 246, 250);
  doc.roundedRect(15, posY, larguraPagina - 30, 32, 3, 3, 'F');

  doc.setFontSize(9);
  
  // Coluna 1: Data e Hora
  doc.setTextColor(100, 100, 115);
  doc.setFont('helvetica', 'bold');
  doc.text('DATA E HORA DO EVENTO', 22, posY + 10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 30, 45);
  doc.setFontSize(11);
  doc.text(formatarData(ingresso.evento?.data_evento), 22, posY + 17);

  // Coluna 2: Local
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 115);
  doc.setFont('helvetica', 'bold');
  doc.text('LOCAL', 115, posY + 10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 30, 45);
  doc.setFontSize(11);
  const localTexto = doc.splitTextToSize(ingresso.evento?.local || 'Local a definir', 75);
  doc.text(localTexto, 115, posY + 17);

  posY += 38;

  // 4. Seção do Ingresso / Titular e QR Code Side-by-Side
  doc.setDrawColor(220, 225, 235);
  doc.setLineWidth(0.5);
  doc.roundedRect(15, posY, larguraPagina - 30, 75, 4, 4, 'D');

  // Lado Esquerdo: Dados do Titular e Compra
  const posXDados = 22;
  let posYDados = posY + 12;

  doc.setFontSize(8);
  doc.setTextColor(120, 120, 140);
  doc.setFont('helvetica', 'bold');
  doc.text('TITULAR DO INGRESSO', posXDados, posYDados);

  doc.setFontSize(12);
  doc.setTextColor(20, 20, 35);
  doc.setFont('helvetica', 'bold');
  doc.text(nomeComprador, posXDados, posYDados + 6);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 95);
  doc.text(emailComprador, posXDados, posYDados + 12);

  posYDados += 22;

  // Lote & Preço
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 140);
  doc.setFont('helvetica', 'bold');
  doc.text('LOTE / CATEGORIA', posXDados, posYDados);

  doc.setFontSize(11);
  doc.setTextColor(20, 20, 35);
  doc.setFont('helvetica', 'bold');
  doc.text(ingresso.lote?.nome_lote || 'Lote Padrão', posXDados, posYDados + 6);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 95);
  doc.text(`Valor: ${formatarMoeda(ingresso.lote?.preco || 0)}`, posXDados, posYDados + 11);

  posYDados += 20;

  // Status Badge
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 140);
  doc.setFont('helvetica', 'bold');
  doc.text('STATUS DO INGRESSO', posXDados, posYDados);

  doc.setFillColor(34, 197, 94); // Verde
  if (ingresso.status === 'utilizado') doc.setFillColor(100, 116, 139);
  if (ingresso.status === 'cancelado') doc.setFillColor(239, 68, 68);

  doc.roundedRect(posXDados, posYDados + 3, 30, 6, 1.5, 1.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text((ingresso.status || 'valido').toUpperCase(), posXDados + 15, posYDados + 7.2, { align: 'center' });

  // Lado Direito: QR Code e Código de Autenticidade
  if (qrCodeUrl) {
    try {
      doc.addImage(qrCodeUrl, 'PNG', larguraPagina - 68, posY + 8, 48, 48);
    } catch {
      console.warn('Erro ao inserir QR Code no PDF');
    }
  }

  doc.setFontSize(7);
  doc.setTextColor(120, 120, 140);
  doc.setFont('helvetica', 'normal');
  doc.text('Código de Autenticação:', larguraPagina - 44, posY + 60, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(40, 40, 60);
  doc.text(ingresso.qr_code_hash ? ingresso.qr_code_hash.substring(0, 20) + '...' : ingresso.id, larguraPagina - 44, posY + 64, { align: 'center' });

  posY += 83;

  // 5. Bloco de Instruções & Regras do Evento
  doc.setFillColor(250, 250, 252);
  doc.roundedRect(15, posY, larguraPagina - 30, 36, 3, 3, 'F');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(40, 40, 60);
  doc.text('ORIENTAÇÕES IMPORTANTES PARA A ENTRADA:', 22, posY + 9);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(90, 90, 105);
  doc.text('• Apresente este comprovante (impresso ou no celular) juntamente com documento oficial com foto.', 22, posY + 16);
  doc.text('• Este QR Code é único e individual. A primeira leitura na portaria dará acesso ao evento.', 22, posY + 22);
  doc.text('• Proibida a entrada com bebidas em recipientes de vidro, objetos cortantes ou substâncias ilícitas.', 22, posY + 28);

  posY += 44;

  // Rodapé do Documento
  doc.setDrawColor(230, 230, 240);
  doc.line(15, posY, larguraPagina - 15, posY);

  doc.setFontSize(8);
  doc.setTextColor(150, 150, 170);
  doc.text(`MeuIngrss Plataforma de Bilheteria - Emitido em ${new Date().toLocaleDateString('pt-BR')}`, 15, posY + 6);
  doc.text(`ID do Ingresso: ${ingresso.id}`, larguraPagina - 15, posY + 6, { align: 'right' });

  // Fazer o download do arquivo PDF
  const nomeArquivo = `ingresso-${ingresso.evento?.titulo ? ingresso.evento.titulo.toLowerCase().replace(/[^a-z0-9]/g, '-') : 'evento'}-${ingresso.id.substring(0, 8)}.pdf`;
  doc.save(nomeArquivo);
}

/**
 * Desenha um bloco de evento alternativo caso não haja imagem de banner
 */
function desenharBlocoEvento(doc: InstanceType<typeof import('jspdf').default>, ingresso: IngressoParaPdf, x: number, y: number, w: number, h: number) {
  doc.setFillColor(30, 35, 55);
  doc.roundedRect(x, y, w, h, 3, 3, 'F');

  doc.setTextColor(255, 190, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(ingresso.evento?.titulo || 'EVENTO UNIVERSITÁRIO', x + 10, y + (h / 2) + 2);
}
