import type { Atletica, Perfil } from './index';

export type CategoriaProdutoLoja =
  | 'caneca'
  | 'copo'
  | 'tirante'
  | 'camisa'
  | 'shorts'
  | 'acessorio'
  | 'outros';

export type StatusPedidoLoja =
  | 'pending_payment'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'refunded'
  | 'stock_unavailable';

export interface ProdutoLoja {
  id: string;
  atletica_id: string;
  name: string;
  description: string | null;
  price: number; // em centavos (ex: 4990 = R$ 49,90)
  category: CategoriaProdutoLoja;
  images: string[];
  sizes: string[]; // ex: ['P', 'M', 'G', 'GG']
  stock_quantity: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;

  atletica?: Atletica;
}

export interface ItemCarrinhoLoja {
  id: string;
  cart_id: string;
  product_id: string;
  size: string | null;
  quantity: number;
  unit_price_snapshot: number; // em centavos
  created_at: string;

  product?: ProdutoLoja;
}

export interface CarrinhoLoja {
  id: string;
  user_id: string;
  status: 'active' | 'converted' | 'abandoned';
  created_at: string;
  updated_at: string;
  items?: ItemCarrinhoLoja[];
}

export interface ItemPedidoLoja {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name_snapshot: string;
  size: string | null;
  quantity: number;
  unit_price_snapshot: number; // em centavos
  subtotal: number; // em centavos
  created_at: string;

  product?: ProdutoLoja;
}

export interface PedidoLoja {
  id: string;
  user_id: string;
  atletica_id: string | null;
  status: StatusPedidoLoja;
  payment_method: string | null;
  total_amount: number; // em centavos
  mercado_pago_payment_id: string | null;
  paid_at: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;

  user?: Perfil;
  atletica?: Atletica;
  items?: ItemPedidoLoja[];
}

export interface MetricasLoja {
  faturamentoTotal: number; // em reais ou centavos
  pedidosPagos: number;
  ticketMedio: number;
  produtosVendidos: number;
  produtosMaisVendidos: {
    productId: string;
    nome: string;
    quantidadeVendida: number;
    receitaTotal: number;
    imagem?: string;
  }[];
  vendasPorPeriodo: {
    data: string;
    total: number;
    pedidos: number;
  }[];
  pedidosRecentes: PedidoLoja[];
}
