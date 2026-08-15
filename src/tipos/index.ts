export type PerfilUsuario = 'cliente' | 'diretor' | 'admin';

export type StatusUsuario = 'ativo' | 'bloqueado' | 'pendente';

export type StatusAtletica = 'ativa' | 'inativa' | 'pendente';

export type StatusEvento = 'rascunho' | 'publicado' | 'encerrado' | 'cancelado';

export type StatusIngresso = 'valido' | 'utilizado' | 'cancelado';

export type StatusPagamento = 'pendente' | 'aprovado' | 'recusado' | 'estornado';

export type TipoSubdominio = 'cliente' | 'diretoria' | 'dev';

export interface Perfil {
  id: string;
  nome: string;
  email: string;
  role: PerfilUsuario;
  atletica_id: string | null;
  avatar_url: string | null;
  telefone: string | null;
  cpf?: string | null;
  status: StatusUsuario;
  criado_em: string;
  atualizado_em: string;
}

export interface Atletica {
  id: string;
  nome: string;
  faculdade: string;
  cidade: string;
  logo_url: string | null;
  capa_url?: string | null;
  descricao?: string | null;
  cor_primaria: string;
  cor_secundaria: string;
  instagram?: string | null;
  whatsapp?: string | null;
  email_contato?: string | null;
  chave_pix?: string | null;
  status: StatusAtletica;
  criado_em: string;
}

export interface Evento {
  id: string;
  atletica_id: string;
  titulo: string;
  slug?: string | null;
  descricao: string;
  imagem_url: string | null;
  data_evento: string;
  local: string;
  cidade: string;
  status: StatusEvento;
  apagado_pelo_diretor?: boolean;
  criado_em: string;
  atualizado_em: string;
  
  atletica?: Atletica;
  lotes_ingresso?: LoteIngresso[];
}

export interface LoteIngresso {
  id: string;
  evento_id: string;
  nome_lote: string;
  preco: number;
  quantidade_total: number;
  quantidade_vendida: number;
  ordem: number;
  ativo: boolean;
}

export interface Ingresso {
  id: string;
  evento_id: string;
  lote_id: string;
  comprador_id: string;
  qr_code_hash: string;
  status: StatusIngresso;
  data_compra: string;
  data_validacao: string | null;
  validado_por: string | null;
  
  evento?: Evento;
  lote?: LoteIngresso;
  comprador?: Perfil;
}

export interface Pagamento {
  id: string;
  ingresso_id: string;
  valor: number;
  status: StatusPagamento;
  gateway_transaction_id: string | null;
  metodo_pagamento: string | null;
  criado_em: string;
}

export interface ResultadoValidacao {
  sucesso: boolean;
  mensagem: string;
  ingresso?: Ingresso;
  nomeComprador?: string;
  nomeLote?: string;
  dataValidacao?: string;
}

export interface EstatisticasDiretor {
  totalVendido: number;
  receitaTotal: number;
  eventosAtivos: number;
  ingressosRestantes: number;
}

export interface EstatisticasAdmin {
  totalVendas: number;
  eventosAtivos: number;
  atleticasCadastradas: number;
  volumeFinanceiro: number;
  usuariosAtivos: number;
}
