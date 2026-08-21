'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { usarAutenticacao } from '@/contextos/ContextoAutenticacao';
import type { ProdutoLoja } from '@/tipos';

export interface ItemCarrinhoLocal {
  id: string; // id do item no banco ou id temporário local
  product_id: string;
  produto: ProdutoLoja;
  tamanho: string | null;
  quantidade: number;
  precoUnitario: number; // em centavos
}

interface ContextoCarrinhoType {
  itens: ItemCarrinhoLocal[];
  totalItens: number;
  totalValorCentavos: number;
  carregando: boolean;
  adicionarItem: (produto: ProdutoLoja, tamanho?: string | null, quantidade?: number) => Promise<boolean>;
  atualizarQuantidade: (itemId: string, novaQuantidade: number) => Promise<void>;
  removerItem: (itemId: string) => Promise<void>;
  limparCarrinho: () => Promise<void>;
  recarregarCarrinho: () => Promise<void>;
}

const STORAGE_KEY = 'meuingrss_carrinho_loja_v1';
const ContextoCarrinho = createContext<ContextoCarrinhoType | null>(null);

export function usarCarrinho() {
  const ctx = useContext(ContextoCarrinho);
  if (!ctx) {
    throw new Error('usarCarrinho deve ser utilizado dentro de ProvedorCarrinho');
  }
  return ctx;
}

export function ProvedorCarrinho({ children }: { children: React.ReactNode }) {
  const { usuario, carregando: authCarregando } = usarAutenticacao();
  const [itens, setItens] = useState<ItemCarrinhoLocal[]>([]);
  const [carregando, setCarregando] = useState(true);

  // 1. Carrega carrinho inicial do banco ou do localStorage
  const carregarItens = useCallback(async () => {
    if (authCarregando) return;

    if (usuario) {
      try {
        // Verifica se há itens locais para sincronizar
        const localData = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
        if (localData) {
          try {
            const parsed = JSON.parse(localData) as ItemCarrinhoLocal[];
            if (Array.isArray(parsed) && parsed.length > 0) {
              await fetch('/api/loja/carrinho', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  sync_items: parsed.map((it) => ({
                    product_id: it.product_id,
                    size: it.tamanho,
                    quantity: it.quantidade,
                  })),
                }),
              });
              localStorage.removeItem(STORAGE_KEY);
            }
          } catch {
            localStorage.removeItem(STORAGE_KEY);
          }
        }

        // Busca carrinho ativo do banco
        const res = await fetch('/api/loja/carrinho');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.items)) {
            const formatados: ItemCarrinhoLocal[] = data.items.map((it: any) => ({
              id: it.id,
              product_id: it.product_id,
              produto: it.product,
              tamanho: it.size,
              quantidade: it.quantity,
              precoUnitario: it.unit_price_snapshot || it.product?.price || 0,
            }));
            setItens(formatados);
          }
        }
      } catch (err) {
        console.error('Erro ao buscar carrinho do banco:', err);
      } finally {
        setCarregando(false);
      }
    } else {
      // Usuário deslogado: lê do localStorage
      if (typeof window !== 'undefined') {
        const localData = localStorage.getItem(STORAGE_KEY);
        if (localData) {
          try {
            const parsed = JSON.parse(localData);
            setItens(Array.isArray(parsed) ? parsed : []);
          } catch {
            setItens([]);
          }
        } else {
          setItens([]);
        }
      }
      setCarregando(false);
    }
  }, [usuario, authCarregando]);

  useEffect(() => {
    carregarItens();
  }, [carregarItens]);

  // Salva no localStorage quando deslogado
  useEffect(() => {
    if (!authCarregando && !usuario && typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(itens));
    }
  }, [itens, usuario, authCarregando]);

  // Adiciona item ao carrinho
  const adicionarItem = useCallback(async (
    produto: ProdutoLoja,
    tamanho: string | null = null,
    quantidade: number = 1
  ): Promise<boolean> => {
    const qtdDesejada = Math.max(1, quantidade);

    if (usuario) {
      try {
        const res = await fetch('/api/loja/carrinho', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product_id: produto.id,
            size: tamanho,
            quantity: qtdDesejada,
          }),
        });

        if (res.ok) {
          await carregarItens();
          return true;
        }
        return false;
      } catch {
        return false;
      }
    } else {
      // Offline / Local
      setItens((prev) => {
        const indexExistente = prev.findIndex(
          (it) => it.product_id === produto.id && it.tamanho === tamanho
        );

        if (indexExistente >= 0) {
          const atual = prev[indexExistente];
          const novaQtd = Math.min(atual.quantidade + qtdDesejada, produto.stock_quantity);
          const novos = [...prev];
          novos[indexExistente] = { ...atual, quantidade: novaQtd };
          return novos;
        } else {
          const novoItem: ItemCarrinhoLocal = {
            id: `local_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            product_id: produto.id,
            produto,
            tamanho,
            quantidade: Math.min(qtdDesejada, produto.stock_quantity),
            precoUnitario: produto.price,
          };
          return [...prev, novoItem];
        }
      });
      return true;
    }
  }, [usuario, carregarItens]);

  // Atualiza quantidade
  const atualizarQuantidade = useCallback(async (itemId: string, novaQuantidade: number) => {
    if (usuario) {
      try {
        await fetch('/api/loja/carrinho', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            item_id: itemId,
            quantity: novaQuantidade,
          }),
        });
        await carregarItens();
      } catch (err) {
        console.error('Erro ao atualizar quantidade do carrinho:', err);
      }
    } else {
      setItens((prev) => {
        if (novaQuantidade <= 0) {
          return prev.filter((it) => it.id !== itemId);
        }
        return prev.map((it) => {
          if (it.id === itemId) {
            const max = it.produto?.stock_quantity ?? 99;
            return { ...it, quantidade: Math.min(novaQuantidade, max) };
          }
          return it;
        });
      });
    }
  }, [usuario, carregarItens]);

  // Remove item
  const removerItem = useCallback(async (itemId: string) => {
    if (usuario) {
      try {
        await fetch(`/api/loja/carrinho?item_id=${itemId}`, { method: 'DELETE' });
        await carregarItens();
      } catch (err) {
        console.error('Erro ao remover item do carrinho:', err);
      }
    } else {
      setItens((prev) => prev.filter((it) => it.id !== itemId));
    }
  }, [usuario, carregarItens]);

  // Limpa carrinho
  const limparCarrinho = useCallback(async () => {
    if (usuario) {
      try {
        await fetch('/api/loja/carrinho?limpar=true', { method: 'DELETE' });
        setItens([]);
      } catch (err) {
        console.error('Erro ao limpar carrinho:', err);
      }
    } else {
      setItens([]);
      if (typeof window !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, [usuario]);

  const totalItens = itens.reduce((acc, it) => acc + it.quantidade, 0);
  const totalValorCentavos = itens.reduce((acc, it) => acc + (it.precoUnitario * it.quantidade), 0);

  return (
    <ContextoCarrinho.Provider
      value={{
        itens,
        totalItens,
        totalValorCentavos,
        carregando,
        adicionarItem,
        atualizarQuantidade,
        removerItem,
        limparCarrinho,
        recarregarCarrinho: carregarItens,
      }}
    >
      {children}
    </ContextoCarrinho.Provider>
  );
}
