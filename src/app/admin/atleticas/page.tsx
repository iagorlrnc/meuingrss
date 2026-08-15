'use client';

import { useState, useEffect } from 'react';
import Cartao from '@/componentes/ui/Cartao';
import Botao from '@/componentes/ui/Botao';
import EstadoVazio from '@/componentes/ui/EstadoVazio';
import Distintivo from '@/componentes/ui/Distintivo';
import CampoTexto from '@/componentes/ui/CampoTexto';
import Modal from '@/componentes/ui/Modal';
import Carregando from '@/componentes/ui/Carregando';
import { criarClienteNavegador } from '@/lib/supabase/cliente';
import { useNotificacao } from '@/componentes/ui/Notificacao';
import type { Atletica } from '@/tipos';
import { Plus, Shield, Check, X } from 'lucide-react';

export default function PaginaGestaoAtleticas() {
  const [atleticas, setAtleticas] = useState<Atletica[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [nome, setNome] = useState('');
  const [faculdade, setFaculdade] = useState('');
  const [cidade, setCidade] = useState('');
  const [salvando, setSalvando] = useState(false);
  const supabase = criarClienteNavegador();
  const { sucesso, erro } = useNotificacao();

  async function buscar() {
    const { data } = await supabase.from('atleticas').select('*').order('criado_em', { ascending: false });
    if (data) setAtleticas(data as Atletica[]);
    setCarregando(false);
  }

  useEffect(() => { buscar(); }, []);

  async function criarAtletica(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);

    const { error: err } = await supabase.from('atleticas').insert({ nome, faculdade, cidade, status: 'ativa' });
    if (err) { erro('Erro', 'Não foi possível criar'); setSalvando(false); return; }

    sucesso('Atlética criada!');
    setModalAberto(false);
    setNome(''); setFaculdade(''); setCidade('');
    setSalvando(false);
    buscar();
  }

  async function alterarStatus(id: string, status: 'ativa' | 'inativa') {
    await supabase.from('atleticas').update({ status }).eq('id', id);
    sucesso('Status atualizado');
    buscar();
  }

  if (carregando) return <div className="flex items-center justify-center h-96"><Carregando tamanho="lg" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black font-titulo">Gestão de <span className="gradiente-texto">Atléticas</span></h1>
          <p className="text-texto-secundario mt-1">{atleticas.length} atléticas cadastradas</p>
        </div>
        <Botao onClick={() => setModalAberto(true)} icone={<Plus size={16} />}>Nova Atlética</Botao>
      </div>

      {atleticas.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {atleticas.map(a => (
            <Cartao key={a.id} variante="vidro">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg" style={{ background: `linear-gradient(135deg, ${a.cor_primaria}, ${a.cor_secundaria})` }}>
                  {a.nome[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold texto-limitado-1">{a.nome}</h3>
                  <p className="text-xs text-texto-terciario">{a.faculdade}</p>
                  <p className="text-xs text-texto-terciario">{a.cidade}</p>
                </div>
              </div>
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-borda-sutil">
                <Distintivo status={a.status} />
                {a.status === 'ativa' ? (
                  <Botao variante="perigo" tamanho="sm" onClick={() => alterarStatus(a.id, 'inativa')}><X size={14} /> Desativar</Botao>
                ) : (
                  <Botao variante="sucesso" tamanho="sm" onClick={() => alterarStatus(a.id, 'ativa')}><Check size={14} /> Ativar</Botao>
                )}
              </div>
            </Cartao>
          ))}
        </div>
      ) : (
        <EstadoVazio
          titulo="Nenhuma atlética cadastrada no momento"
          descricao="A plataforma ainda não possui atléticas registradas. Clique no botão acima para adicionar a primeira atlética."
          icone={<Shield className="w-7 h-7" />}
          acao={
            <Botao onClick={() => setModalAberto(true)} icone={<Plus size={16} />}>Cadastrar Primeira Atlética</Botao>
          }
        />
      )}

      <Modal aberto={modalAberto} aoFechar={() => setModalAberto(false)} titulo="Nova Atlética">
        <form onSubmit={criarAtletica} className="space-y-4">
          <CampoTexto rotulo="Nome da atlética" value={nome} onChange={e => setNome((e.target as HTMLInputElement).value)} required />
          <CampoTexto rotulo="Faculdade" value={faculdade} onChange={e => setFaculdade((e.target as HTMLInputElement).value)} required />
          <CampoTexto rotulo="Cidade" value={cidade} onChange={e => setCidade((e.target as HTMLInputElement).value)} />
          <Botao type="submit" larguraTotal carregando={salvando}>Criar Atlética</Botao>
        </form>
      </Modal>
    </div>
  );
}
