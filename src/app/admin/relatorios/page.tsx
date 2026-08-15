'use client';

import { useState, useEffect } from 'react';
import Cartao from '@/componentes/ui/Cartao';
import Carregando from '@/componentes/ui/Carregando';
import { criarClienteNavegador } from '@/lib/supabase/cliente';
import { formatarMoeda } from '@/lib/utilitarios';
import { DollarSign, Ticket, Users } from 'lucide-react';

interface DadosRelatorio {
  volumeTotal: number;
  totalPagamentos: number;
  totalIngressos: number;
  ingressosValidos: number;
  ingressosUtilizados: number;
  eventosPublicados: number;
  atleticasAtivas: number;
  clientes: number;
  diretores: number;
}

export default function PaginaRelatorios() {
  const [dados, setDados] = useState<DadosRelatorio | null>(null);
  const [carregando, setCarregando] = useState(true);
  const supabase = criarClienteNavegador();

  async function buscarDados() {
    const [
      pagamentosRes,
      ingressosTotaisRes,
      ingressosValidosRes,
      ingressosUtilizadosRes,
      eventosPublicadosRes,
      atleticasAtivasRes,
      clientesRes,
      diretoresRes,
    ] = await Promise.all([
      supabase.from('pagamentos').select('valor').eq('status', 'aprovado'),
      supabase.from('ingressos').select('id', { count: 'exact', head: true }),
      supabase.from('ingressos').select('id', { count: 'exact', head: true }).eq('status', 'valido'),
      supabase.from('ingressos').select('id', { count: 'exact', head: true }).eq('status', 'utilizado'),
      supabase.from('eventos').select('id', { count: 'exact', head: true }).eq('status', 'publicado'),
      supabase.from('atleticas').select('id', { count: 'exact', head: true }).eq('status', 'ativa'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'cliente'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'diretor'),
    ]);

    const volumeTotal = pagamentosRes.data?.reduce((a: number, p: { valor?: number }) => a + Number(p.valor || 0), 0) || 0;

    setDados({
      volumeTotal,
      totalPagamentos: pagamentosRes.data?.length || 0,
      totalIngressos: ingressosTotaisRes.count || 0,
      ingressosValidos: ingressosValidosRes.count || 0,
      ingressosUtilizados: ingressosUtilizadosRes.count || 0,
      eventosPublicados: eventosPublicadosRes.count || 0,
      atleticasAtivas: atleticasAtivasRes.count || 0,
      clientes: clientesRes.count || 0,
      diretores: diretoresRes.count || 0,
    });
    setCarregando(false);
  }

  useEffect(() => { buscarDados(); }, []);

  if (carregando) return <div className="flex items-center justify-center h-96"><Carregando tamanho="lg" texto="Carregando dados..." /></div>;
  if (!dados) return null;

  return (
    <div>
      <h1 className="text-2xl sm:text-3xl font-black font-titulo mb-2">
        <span className="text-amber-400">Relatórios</span>
      </h1>
      <p className="text-texto-secundario mb-8">Visão analítica da plataforma</p>

      {}
      <h2 className="text-lg font-bold font-titulo mb-4 flex items-center gap-2">
        <DollarSign size={20} className="text-emerald-400" /> Financeiro
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        <Cartao variante="vidro">
          <p className="text-xs text-texto-terciario mb-1">Volume Total</p>
          <p className="text-3xl font-black font-titulo text-emerald-400">{formatarMoeda(dados.volumeTotal)}</p>
        </Cartao>
        <Cartao variante="vidro">
          <p className="text-xs text-texto-terciario mb-1">Receita Plataforma (10%)</p>
          <p className="text-3xl font-black font-titulo gradiente-texto">{formatarMoeda(dados.volumeTotal * 0.1)}</p>
        </Cartao>
        <Cartao variante="vidro">
          <p className="text-xs text-texto-terciario mb-1">Transações</p>
          <p className="text-3xl font-black font-titulo">{dados.totalPagamentos}</p>
        </Cartao>
      </div>

      {}
      <h2 className="text-lg font-bold font-titulo mb-4 flex items-center gap-2">
        <Ticket size={20} className="text-primaria-400" /> Ingressos
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        <Cartao variante="vidro">
          <p className="text-xs text-texto-terciario mb-1">Total Vendidos</p>
          <p className="text-3xl font-black font-titulo">{dados.totalIngressos}</p>
        </Cartao>
        <Cartao variante="vidro">
          <p className="text-xs text-texto-terciario mb-1">Válidos (não usados)</p>
          <p className="text-3xl font-black font-titulo text-emerald-400">{dados.ingressosValidos}</p>
        </Cartao>
        <Cartao variante="vidro">
          <p className="text-xs text-texto-terciario mb-1">Utilizados</p>
          <p className="text-3xl font-black font-titulo text-blue-400">{dados.ingressosUtilizados}</p>
        </Cartao>
      </div>

      {}
      <h2 className="text-lg font-bold font-titulo mb-4 flex items-center gap-2">
        <Users size={20} className="text-blue-400" /> Usuários
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-10">
        <Cartao variante="vidro">
          <p className="text-xs text-texto-terciario mb-1">Clientes</p>
          <p className="text-3xl font-black font-titulo">{dados.clientes}</p>
        </Cartao>
        <Cartao variante="vidro">
          <p className="text-xs text-texto-terciario mb-1">Diretores</p>
          <p className="text-3xl font-black font-titulo text-primaria-400">{dados.diretores}</p>
        </Cartao>
        <Cartao variante="vidro">
          <p className="text-xs text-texto-terciario mb-1">Atléticas Ativas</p>
          <p className="text-3xl font-black font-titulo text-amber-400">{dados.atleticasAtivas}</p>
        </Cartao>
        <Cartao variante="vidro">
          <p className="text-xs text-texto-terciario mb-1">Eventos Publicados</p>
          <p className="text-3xl font-black font-titulo text-secundaria-400">{dados.eventosPublicados}</p>
        </Cartao>
      </div>
    </div>
  );
}
