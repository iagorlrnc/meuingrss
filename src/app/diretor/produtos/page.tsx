'use client';

import React, { useState, useEffect } from 'react';
import { criarClienteNavegador } from '@/lib/supabase/cliente';
import { usarAutenticacao } from '@/contextos/ContextoAutenticacao';
import { formatarMoeda } from '@/lib/utilitarios';
import { usarNotificacao } from '@/componentes/ui/Notificacao';
import Botao from '@/componentes/ui/Botao';
import Cartao from '@/componentes/ui/Cartao';
import Modal from '@/componentes/ui/Modal';
import CampoTexto from '@/componentes/ui/CampoTexto';
import Carregando from '@/componentes/ui/Carregando';
import type { ProdutoLoja, CategoriaProdutoLoja } from '@/tipos';
import {
  ShoppingCart,
  Plus,
  Search,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  Package,
  Layers,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  Upload,
  X,
  ExternalLink,
} from 'lucide-react';

const CATEGORIAS: { id: CategoriaProdutoLoja; rotulo: string }[] = [
  { id: 'caneca', rotulo: 'Caneca' },
  { id: 'copo', rotulo: 'Copo' },
  { id: 'tirante', rotulo: 'Tirante' },
  { id: 'camisa', rotulo: 'Camisa' },
  { id: 'shorts', rotulo: 'Shorts' },
  { id: 'acessorio', rotulo: 'Acessório' },
  { id: 'outros', rotulo: 'Outros' },
];

const TAMANHOS_PADRAO = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'Único'];

export default function PaginaProdutosDiretor() {
  const { perfil } = usarAutenticacao();
  const { mostrarNotificacao } = usarNotificacao();
  const supabase = criarClienteNavegador();

  const [produtos, setProdutos] = useState<ProdutoLoja[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('todas');
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'ativos' | 'inativos'>('todos');

  // Modal de Criação / Edição
  const [modalAberto, setModalAberto] = useState(false);
  const [produtoEditando, setProdutoEditando] = useState<ProdutoLoja | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Campos do Formulário
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [categoria, setCategoria] = useState<CategoriaProdutoLoja>('caneca');
  const [precoReais, setPrecoReais] = useState('');
  const [estoque, setEstoque] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [tamanhos, setTamanhos] = useState<string[]>([]);
  const [novoTamanho, setNovoTamanho] = useState('');
  const [imagens, setImagens] = useState<string[]>([]);
  const [urlImagemInput, setUrlImagemInput] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);

  // Busca produtos da atlética
  async function carregarProdutos() {
    if (!perfil?.atletica_id && perfil?.role !== 'admin') {
      setCarregando(false);
      return;
    }

    setCarregando(true);
    try {
      let query = supabase
        .from('store_products')
        .select('*')
        .order('created_at', { ascending: false });

      if (perfil?.atletica_id) {
        query = query.eq('atletica_id', perfil.atletica_id);
      }

      const { data, error } = await query;
      if (!error && data) {
        setProdutos(data as ProdutoLoja[]);
      }
    } catch (err) {
      console.error('Erro ao carregar produtos:', err);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarProdutos();
  }, [perfil]);

  function abrirModalCriar() {
    setProdutoEditando(null);
    setNome('');
    setDescricao('');
    setCategoria('caneca');
    setPrecoReais('');
    setEstoque('');
    setAtivo(true);
    setTamanhos([]);
    setImagens([]);
    setUrlImagemInput('');
    setModalAberto(true);
  }

  function abrirModalEditar(prod: ProdutoLoja) {
    setProdutoEditando(prod);
    setNome(prod.name);
    setDescricao(prod.description || '');
    setCategoria(prod.category);
    setPrecoReais((prod.price / 100).toFixed(2));
    setEstoque(String(prod.stock_quantity));
    setAtivo(prod.is_active);
    setTamanhos(Array.isArray(prod.sizes) ? prod.sizes : []);
    setImagens(Array.isArray(prod.images) ? prod.images : []);
    setUrlImagemInput('');
    setModalAberto(true);
  }

  function toggleTamanho(tam: string) {
    if (tamanhos.includes(tam)) {
      setTamanhos(tamanhos.filter((t) => t !== tam));
    } else {
      setTamanhos([...tamanhos, tam]);
    }
  }

  function adicionarTamanhoCustomizado() {
    const limpo = novoTamanho.trim().toUpperCase();
    if (limpo && !tamanhos.includes(limpo)) {
      setTamanhos([...tamanhos, limpo]);
      setNovoTamanho('');
    }
  }

  function adicionarImagemUrl() {
    const url = urlImagemInput.trim();
    if (url && !imagens.includes(url)) {
      setImagens([...imagens, url]);
      setUrlImagemInput('');
    }
  }

  function removerImagem(idx: number) {
    setImagens(imagens.filter((_, i) => i !== idx));
  }

  async function handleUploadArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setUploadingImage(true);

    try {
      const ext = file.name.split('.').pop() || 'png';
      const randomSuffix = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36);
      const nomeArquivo = `produto_${Date.now()}_${randomSuffix}.${ext}`;

      // 1. Tenta upload no bucket oficial 'imagens'
      let bucketEscolhido = 'imagens';
      let uploadResult = await supabase.storage
        .from('imagens')
        .upload(nomeArquivo, file, {
          cacheControl: '3600',
          upsert: true,
        });

      // 2. Se falhar, tenta no bucket 'eventos'
      if (uploadResult.error) {
        bucketEscolhido = 'eventos';
        uploadResult = await supabase.storage
          .from('eventos')
          .upload(nomeArquivo, file, {
            cacheControl: '3600',
            upsert: true,
          });
      }

      // 3. Se ainda falhar, tenta no bucket 'atleticas'
      if (uploadResult.error) {
        bucketEscolhido = 'atleticas';
        uploadResult = await supabase.storage
          .from('atleticas')
          .upload(nomeArquivo, file, {
            cacheControl: '3600',
            upsert: true,
          });
      }

      if (uploadResult.error) {
        throw uploadResult.error;
      }

      const { data: publicUrlData } = supabase.storage
        .from(bucketEscolhido)
        .getPublicUrl(uploadResult.data.path);

      if (publicUrlData?.publicUrl) {
        setImagens((prev) => [...prev, publicUrlData.publicUrl]);
        mostrarNotificacao({
          tipo: 'sucesso',
          titulo: 'Foto enviada!',
          mensagem: 'A imagem do produto foi salva com sucesso.',
        });
      }

    } catch (err: unknown) {
      console.error('Erro no upload de imagem:', err);
      const msg = err instanceof Error ? err.message : 'Não foi possível enviar o arquivo.';
      mostrarNotificacao({
        tipo: 'erro',
        titulo: 'Falha no upload',
        mensagem: msg,
      });
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  }


  // Alterna status Ativo/Inativo (Soft Delete)
  async function toggleStatusProduto(prod: ProdutoLoja) {
    const novoStatus = !prod.is_active;

    try {
      const { error } = await supabase
        .from('store_products')
        .update({ is_active: novoStatus, updated_at: new Date().toISOString() })
        .eq('id', prod.id);

      if (error) throw error;

      mostrarNotificacao({
        tipo: 'sucesso',
        titulo: novoStatus ? 'Produto Ativado' : 'Produto Inativado',
        mensagem: novoStatus
          ? `O produto "${prod.name}" agora está visível na loja pública.`
          : `O produto "${prod.name}" foi inativado e ocultado da loja pública.`,
      });

      setProdutos((prev) =>
        prev.map((p) => (p.id === prod.id ? { ...p, is_active: novoStatus } : p))
      );
    } catch (err: any) {
      mostrarNotificacao({
        tipo: 'erro',
        titulo: 'Erro ao alterar status',
        mensagem: err?.message || 'Falha ao atualizar produto.',
      });
    }
  }

  // Salvar Criação ou Edição
  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault();

    const atleticaId = perfil?.atletica_id;
    if (!atleticaId && perfil?.role !== 'admin') {
      mostrarNotificacao({
        tipo: 'erro',
        titulo: 'Atlética não encontrada',
        mensagem: 'Você precisa estar vinculado a uma atlética para gerenciar produtos.',
      });
      return;
    }

    const precoNumero = parseFloat(precoReais.replace(',', '.'));
    if (isNaN(precoNumero) || precoNumero < 0) {
      mostrarNotificacao({
        tipo: 'erro',
        titulo: 'Preço inválido',
        mensagem: 'Informe um valor de preço válido.',
      });
      return;
    }

    const precoCentavos = Math.round(precoNumero * 100);
    const qtdEstoque = parseInt(estoque, 10) || 0;

    setSalvando(true);

    try {
      const payload = {
        name: nome.trim(),
        description: descricao.trim() || null,
        category: categoria,
        price: precoCentavos,
        stock_quantity: Math.max(0, qtdEstoque),
        is_active: ativo,
        sizes: tamanhos,
        images: imagens,
        atletica_id: produtoEditando?.atletica_id || atleticaId,
        created_by: perfil?.id,
        updated_at: new Date().toISOString(),
      };


      if (produtoEditando) {
        const { error } = await supabase
          .from('store_products')
          .update(payload)
          .eq('id', produtoEditando.id);

        if (error) throw error;

        mostrarNotificacao({
          tipo: 'sucesso',
          titulo: 'Produto atualizado!',
          mensagem: `As alterações em "${nome}" foram salvas.`,
        });
      } else {
        const { error } = await supabase
          .from('store_products')
          .insert(payload);

        if (error) throw error;

        mostrarNotificacao({
          tipo: 'sucesso',
          titulo: 'Produto criado com sucesso!',
          mensagem: `"${nome}" foi adicionado ao catálogo da sua atlética.`,
        });
      }

      setModalAberto(false);
      await carregarProdutos();
    } catch (err: any) {
      mostrarNotificacao({
        tipo: 'erro',
        titulo: 'Erro ao salvar produto',
        mensagem: err?.message || 'Ocorreu um erro ao gravar os dados do produto.',
      });
    } finally {
      setSalvando(false);
    }
  }

  // Filtragem dos produtos
  const produtosFiltrados = produtos.filter((p) => {
    if (busca.trim()) {
      const termo = busca.toLowerCase().trim();
      const matchNome = p.name.toLowerCase().includes(termo);
      const matchDesc = p.description?.toLowerCase().includes(termo) ?? false;
      if (!matchNome && !matchDesc) return false;
    }

    if (filtroCategoria !== 'todas' && p.category !== filtroCategoria) {
      return false;
    }

    if (filtroStatus === 'ativos' && !p.is_active) return false;
    if (filtroStatus === 'inativos' && p.is_active) return false;

    return true;
  });

  return (
    <div className="space-y-8">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black font-titulo text-texto-principal flex items-center gap-2.5">
            <ShoppingCart className="text-primaria-400" size={28} />
            Produtos da Atlética
          </h1>
          <p className="text-texto-secundario text-xs sm:text-sm mt-1">
            Gerencie o catálogo, preços, estoque e fotos dos produtos da sua loja virtual
          </p>
        </div>

        <Botao
          variante="primario"
          tamanho="lg"
          onClick={abrirModalCriar}
          icone={<Plus size={18} />}
          className="self-start sm:self-auto shadow-lg"
        >
          Novo Produto
        </Botao>
      </div>

      {/* Barra de Filtros */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
        <div className="sm:col-span-6 relative">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-texto-terciario" />
          <input
            type="text"
            placeholder="Buscar por nome do produto..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full bg-fundo-card border border-borda-sutil rounded-2xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-texto-principal placeholder-texto-terciario outline-none focus:border-primaria-500 transition-all"
          />
        </div>

        <div className="sm:col-span-3">
          <select
            value={filtroCategoria}
            onChange={(e) => setFiltroCategoria(e.target.value)}
            className="w-full bg-fundo-card border border-borda-sutil rounded-2xl px-4 py-2.5 text-xs sm:text-sm text-texto-principal outline-none focus:border-primaria-500 transition-all cursor-pointer"
          >
            <option value="todas">Todas as Categorias</option>
            {CATEGORIAS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.rotulo}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-3">
          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value as any)}
            className="w-full bg-fundo-card border border-borda-sutil rounded-2xl px-4 py-2.5 text-xs sm:text-sm text-texto-principal outline-none focus:border-primaria-500 transition-all cursor-pointer"
          >
            <option value="todos">Todos os Status</option>
            <option value="ativos">Apenas Ativos</option>
            <option value="inativos">Apenas Inativos</option>
          </select>
        </div>
      </div>

      {/* Lista / Tabela de Produtos */}
      {carregando ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <Carregando tamanho="lg" texto="Carregando produtos da atlética..." />
        </div>
      ) : produtosFiltrados.length > 0 ? (
        <div className="grid grid-cols-1 gap-3">
          {produtosFiltrados.map((prod) => {
            const preco = prod.price / 100;
            const foto = prod.images?.[0] || '/imagens/placeholder-produto.png';

            return (
              <Cartao
                key={prod.id}
                variante="vidro"
                className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all"
              >
                {/* Imagem e Dados */}
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-fundo-input border border-borda-sutil overflow-hidden shrink-0">
                    <img src={foto} alt={prod.name} className="w-full h-full object-cover" />
                  </div>

                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm sm:text-base font-bold text-texto-principal font-titulo truncate">
                        {prod.name}
                      </h3>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-primaria-500/10 text-primaria-400 border border-primaria-500/20">
                        {prod.category}
                      </span>
                      {prod.is_active ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-sucesso/10 text-sucesso border border-sucesso/20">
                          Ativo na Loja
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-erro/10 text-erro border border-erro/20">
                          Inativo
                        </span>
                      )}
                    </div>

                    {prod.description && (
                      <p className="text-xs text-texto-terciario line-clamp-1">
                        {prod.description}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 text-xs text-texto-secundario pt-0.5">
                      <span>
                        Preço: <strong className="text-texto-principal">{formatarMoeda(preco)}</strong>
                      </span>
                      <span>•</span>
                      <span>
                        Estoque: <strong className={prod.stock_quantity <= 3 ? "text-amber-400" : "text-texto-principal"}>{prod.stock_quantity} un.</strong>
                      </span>
                      {prod.sizes && prod.sizes.length > 0 && (
                        <>
                          <span>•</span>
                          <span>Tamanhos: {prod.sizes.join(', ')}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Ações */}
                <div className="flex items-center gap-2 w-full sm:w-auto justify-end pt-3 sm:pt-0 border-t sm:border-t-0 border-borda-sutil">
                  <button
                    type="button"
                    onClick={() => toggleStatusProduto(prod)}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      prod.is_active
                        ? 'border-borda-sutil text-texto-secundario hover:text-erro hover:bg-erro/10'
                        : 'border-sucesso/30 text-sucesso bg-sucesso/10 hover:bg-sucesso/20'
                    }`}
                    title={prod.is_active ? "Inativar Produto (Ocultar da loja)" : "Ativar Produto"}
                  >
                    {prod.is_active ? <EyeOff size={16} /> : <Eye size={16} />}
                    <span className="hidden sm:inline">{prod.is_active ? 'Inativar' : 'Ativar'}</span>
                  </button>

                  <Botao
                    variante="contorno"
                    tamanho="sm"
                    onClick={() => abrirModalEditar(prod)}
                    icone={<Edit2 size={15} />}
                  >
                    Editar
                  </Botao>
                </div>
              </Cartao>
            );
          })}
        </div>
      ) : (
        <Cartao variante="vidro" className="py-16 text-center space-y-4 max-w-md mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-fundo-hover mx-auto flex items-center justify-center text-texto-terciario">
            <ShoppingCart size={28} />
          </div>
          <h3 className="text-lg font-bold text-texto-principal font-titulo">Nenhum produto cadastrado</h3>
          <p className="text-xs text-texto-secundario leading-relaxed">
            Cadastre camisas, canecas, copos, tirantes e outros itens oficiais da sua atlética para disponibilizar na loja virtual.
          </p>
          <Botao variante="primario" tamanho="md" onClick={abrirModalCriar} icone={<Plus size={16} />}>
            Cadastrar Primeiro Produto
          </Botao>
        </Cartao>
      )}

      {/* Modal de Cadastro / Edição */}
      <Modal
        aberto={modalAberto}
        aoFechar={() => setModalAberto(false)}
        titulo={produtoEditando ? 'Editar Produto' : 'Novo Produto da Atlética'}
        descricao="Preencha os detalhes do produto que ficará disponível na vitrine da loja."
        tamanho="lg"
      >
        <form onSubmit={handleSalvar} className="space-y-5">
          <CampoTexto
            rotulo="Nome do Produto *"
            placeholder="Ex: Caneca Alumínio 500ml Atlética Furiosa"
            value={nome}
            onChange={(e) => setNome((e.target as HTMLInputElement).value)}
            required
          />

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-texto-secundario">
              Descrição do Produto
            </label>
            <textarea
              rows={3}
              placeholder="Descreva o material, dimensões, cores e instruções de retirada..."
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className="w-full bg-fundo-input border border-borda-sutil rounded-xl px-4 py-3 text-xs sm:text-sm text-texto-principal placeholder-texto-terciario outline-none focus:border-primaria-500 transition-all resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-texto-secundario">
                Categoria *
              </label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value as CategoriaProdutoLoja)}
                className="w-full bg-fundo-input border border-borda-sutil rounded-xl px-3 py-3 text-xs sm:text-sm text-texto-principal outline-none focus:border-primaria-500 transition-all cursor-pointer"
                required
              >
                {CATEGORIAS.map((c) => (
                  <option key={c.id} value={c.id} className="bg-[#080c14] text-white">
                    {c.rotulo}
                  </option>
                ))}
              </select>
            </div>

            <CampoTexto
              rotulo="Preço (R$) *"
              type="text"
              placeholder="45,00"
              value={precoReais}
              onChange={(e) => setPrecoReais((e.target as HTMLInputElement).value)}
              required
            />

            <CampoTexto
              rotulo="Estoque Disponível (un.) *"
              type="number"
              min="0"
              placeholder="50"
              value={estoque}
              onChange={(e) => setEstoque((e.target as HTMLInputElement).value)}
              required
            />
          </div>

          {/* Seleção de Tamanhos */}
          <div className="space-y-2.5 p-4 rounded-2xl bg-fundo-input border border-borda-sutil">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-texto-principal uppercase tracking-wider">
                Tamanhos Disponíveis (Opcional)
              </label>
              <span className="text-[11px] text-texto-terciario">
                Útil para camisas, shorts e calçados
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {TAMANHOS_PADRAO.map((tam) => (
                <button
                  key={tam}
                  type="button"
                  onClick={() => toggleTamanho(tam)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer border ${
                    tamanhos.includes(tam)
                      ? 'bg-primaria-500 text-white border-primaria-500 shadow-md'
                      : 'bg-fundo-card text-texto-secundario border-borda-sutil hover:border-primaria-500/50'
                  }`}
                >
                  {tam}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                placeholder="Outro tamanho (ex: 42, 44, G1)..."
                value={novoTamanho}
                onChange={(e) => setNovoTamanho(e.target.value)}
                className="flex-1 bg-fundo-card border border-borda-sutil rounded-lg px-3 py-1.5 text-xs text-texto-principal outline-none"
              />
              <button
                type="button"
                onClick={adicionarTamanhoCustomizado}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
              >
                Adicionar
              </button>
            </div>
          </div>

          {/* Upload e URLs de Fotos */}
          <div className="space-y-3 p-4 rounded-2xl bg-fundo-input border border-borda-sutil">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-texto-principal uppercase tracking-wider">
                Fotos do Produto
              </label>
              <span className="text-[11px] text-texto-terciario">
                Adicione fotos de alta qualidade
              </span>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="url"
                placeholder="Cole o link de uma imagem (https://...)..."
                value={urlImagemInput}
                onChange={(e) => setUrlImagemInput(e.target.value)}
                className="flex-1 bg-fundo-card border border-borda-sutil rounded-xl px-3 py-2 text-xs text-texto-principal outline-none"
              />
              <button
                type="button"
                onClick={adicionarImagemUrl}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
              >
                Inserir Link
              </button>

              <label className="px-4 py-2 rounded-xl bg-primaria-500/20 hover:bg-primaria-500/30 text-primaria-300 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5">
                <Upload size={14} />
                <span>{uploadingImage ? 'Enviando...' : 'Upload'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleUploadArquivo}
                  disabled={uploadingImage}
                  className="hidden"
                />
              </label>
            </div>

            {imagens.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5 pt-2">
                {imagens.map((img, idx) => (
                  <div key={idx} className="relative group aspect-square rounded-xl overflow-hidden bg-black/50 border border-borda-sutil flex items-center justify-center">
                    <img
                      src={img}
                      alt={`Foto ${idx + 1}`}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => removerImagem(idx)}
                      className="absolute top-1 right-1 p-1.5 rounded-full bg-red-600 hover:bg-red-500 text-white shadow-lg transition-all cursor-pointer z-10"
                      title="Remover foto"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

          </div>

          {/* Switch Ativo / Inativo */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-fundo-card border border-borda-sutil">
            <div>
              <p className="text-xs font-bold text-texto-principal">Produto Ativo na Loja Pública</p>
              <p className="text-[11px] text-texto-terciario">Se desmarcado, o produto ficará visível apenas aqui no painel do diretor.</p>
            </div>
            <input
              type="checkbox"
              checked={ativo}
              onChange={(e) => setAtivo(e.target.checked)}
              className="w-5 h-5 accent-primaria-500 cursor-pointer"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-borda-sutil">
            <Botao
              type="button"
              variante="fantasma"
              onClick={() => setModalAberto(false)}
            >
              Cancelar
            </Botao>
            <Botao
              type="submit"
              variante="primario"
              carregando={salvando}
              disabled={salvando}
            >
              {produtoEditando ? 'Salvar Alterações' : 'Cadastrar Produto'}
            </Botao>
          </div>
        </form>
      </Modal>
    </div>
  );
}
