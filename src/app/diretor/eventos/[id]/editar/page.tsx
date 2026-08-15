'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Cartao from '@/componentes/ui/Cartao';
import Botao from '@/componentes/ui/Botao';
import CampoTexto from '@/componentes/ui/CampoTexto';
import Carregando from '@/componentes/ui/Carregando';
import { criarClienteNavegador } from '@/lib/supabase/cliente';
import { usarAutenticacao } from '@/contextos/ContextoAutenticacao';
import { useNotificacao } from '@/componentes/ui/Notificacao';
import { gerarSlugUnico } from '@/lib/utilitarios';
import {
  ArrowLeft,
  CalendarPlus,
  MapPin,
  Clock,
  ImageIcon,
  Upload,
  Trash2,
  ChevronDown,
} from 'lucide-react';
import Link from 'next/link';

export default function PaginaEditarEvento() {
  const params = useParams();
  const router = useRouter();
  const { perfil } = usarAutenticacao();
  const { sucesso, erro: notificarErro } = useNotificacao();
  const supabase = criarClienteNavegador();

  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [imagemUrl, setImagemUrl] = useState('');
  const [arrastandoImagem, setArrastandoImagem] = useState(false);
  const [dataEvento, setDataEvento] = useState('');
  const [local, setLocal] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('TO');

  // Data e horário mínimo (momento atual em fuso local)
  const dataMinima = (() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  })();
  const [status, setStatus] = useState<'rascunho' | 'publicado' | 'encerrado' | 'cancelado'>('rascunho');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  async function buscarEvento() {
    const { data, error } = await supabase
      .from('eventos')
      .select('id, titulo, descricao, imagem_url, data_evento, local, cidade, status, atletica_id, apagado_pelo_diretor')
      .eq('id', params.id)
      .single();

    if (error || !data || data.apagado_pelo_diretor) {
      notificarErro('Erro', 'Evento não encontrado');
      router.push('/diretor/eventos');
      return;
    }

    setTitulo(data.titulo || '');
    setDescricao(data.descricao || '');
    setImagemUrl(data.imagem_url || '');
    setDataEvento(data.data_evento ? new Date(data.data_evento).toISOString().slice(0, 16) : '');
    setLocal(data.local || '');
    setStatus(data.status || 'rascunho');
    setCarregando(false);
  }

  useEffect(() => {
    buscarEvento();
  }, [params.id]);

  const [enviandoImagem, setEnviandoImagem] = useState(false);

  async function processarImagem(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      notificarErro('Arquivo muito grande', 'O tamanho máximo da imagem é de 10MB.');
      return;
    }

    setEnviandoImagem(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const nomeArquivo = `evento_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;

      const { data, error } = await supabase.storage
        .from('eventos')
        .upload(nomeArquivo, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (error) {
        console.error('Erro no upload para o storage:', error);
        throw error;
      }

      const { data: publicUrlData } = supabase.storage
        .from('eventos')
        .getPublicUrl(data.path);

      setImagemUrl(publicUrlData.publicUrl);
      sucesso('Capa do evento enviada!', 'A foto de capa foi salva com sucesso no Supabase Storage.');
    } catch (err: unknown) {
      const mensagem = err instanceof Error ? err.message : 'Não foi possível enviar a imagem.';
      notificarErro('Erro no upload', mensagem);
    } finally {
      setEnviandoImagem(false);
    }
  }

  function handleDropImagem(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setArrastandoImagem(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processarImagem(file);
    }
  }

  async function aoSubmeter(e: React.FormEvent) {
    e.preventDefault();

    if (!titulo.trim()) {
      notificarErro('Título obrigatório', 'Por favor, informe o título do evento.');
      return;
    }

    if (!dataEvento) {
      notificarErro('Data obrigatória', 'Por favor, selecione a data e horário do evento.');
      return;
    }

    const dataObj = new Date(dataEvento);
    if (isNaN(dataObj.getTime())) {
      notificarErro('Data inválida', 'A data e horário selecionados não são válidos.');
      return;
    }

    if (dataObj < new Date()) {
      notificarErro('Data Inválida', 'Não é possível selecionar uma data e horário anteriores ao momento atual.');
      return;
    }

    if (!local.trim()) {
      notificarErro('Local obrigatório', 'Por favor, informe o local do evento.');
      return;
    }

    setSalvando(true);

    try {
      const eventoId = params.id as string;
      const slugGerado = await gerarSlugUnico(supabase, titulo.trim(), eventoId);

      const dadosAtualizar = {
        titulo: titulo.trim(),
        slug: slugGerado,
        descricao: descricao.trim(),
        imagem_url: imagemUrl.trim() || null,
        data_evento: dataObj.toISOString(),
        local: local.trim(),
        cidade: cidade.trim(),
        status,
        atualizado_em: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('eventos')
        .update(dadosAtualizar)
        .eq('id', eventoId);

      if (error) throw error;

      sucesso('Evento atualizado com sucesso!');
      router.push('/diretor/eventos');
    } catch {
      notificarErro('Erro ao atualizar', 'Tente novamente');
    }

    setSalvando(false);
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center h-96">
        <Carregando tamanho="lg" texto="Carregando dados do evento..." />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Link href="/diretor/eventos" className="inline-flex items-center gap-2 text-sm text-texto-secundario hover:text-texto-principal transition-colors mb-6">
        <ArrowLeft size={16} /> Voltar
      </Link>

      <h1 className="text-2xl sm:text-3xl font-black font-titulo mb-8">
        Editar <span className="gradiente-texto">Evento</span>
      </h1>

      <form onSubmit={aoSubmeter} className="space-y-6">
        {/* Foto de Capa do Evento */}
        <Cartao variante="vidro">
          <h3 className="text-lg font-bold font-titulo mb-4 flex items-center gap-2">
            <ImageIcon size={20} className="text-secundaria-400" />
            Imagem de Capa do Evento
          </h3>

          {imagemUrl ? (
            <div className="relative group rounded-xl overflow-hidden border border-borda-sutil h-52 bg-fundo-card flex items-center justify-center">
              <img src={imagemUrl} alt="Capa do evento" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                <label className="cursor-pointer bg-fundo-card/90 hover:bg-fundo-card text-texto-principal px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border border-borda-sutil transition-colors shadow-lg">
                  <Upload size={14} /> Alterar Capa
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) processarImagem(f);
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setImagemUrl('')}
                  className="bg-erro/90 hover:bg-erro text-white px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors shadow-lg"
                >
                  <Trash2 size={14} /> Remover
                </button>
              </div>
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setArrastandoImagem(true);
              }}
              onDragLeave={() => setArrastandoImagem(false)}
              onDrop={handleDropImagem}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-all flex flex-col items-center justify-center ${
                arrastandoImagem ? 'border-primaria-500 bg-primaria-500/10' : 'border-borda-sutil hover:border-primaria-500/50 bg-fundo-input/50'
              }`}
            >
              <div className="w-12 h-12 rounded-full bg-primaria-500/10 text-primaria-400 flex items-center justify-center mb-3">
                <Upload size={22} />
              </div>
              <p className="text-sm font-semibold text-texto-principal mb-1">
                Arraste e solte a imagem de capa do evento aqui
              </p>
              <p className="text-xs text-texto-terciario mb-4">
                Formatos aceitos: JPG, PNG, WebP (até 10MB). Esta imagem aparecerá no card público.
              </p>
              <label className="cursor-pointer bg-primaria-500 hover:bg-primaria-600 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg shadow-primaria-500/20">
                Selecionar Imagem
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) processarImagem(f);
                  }}
                />
              </label>
            </div>
          )}
        </Cartao>

        <Cartao variante="vidro">
          <h3 className="text-lg font-bold font-titulo mb-4 flex items-center gap-2">
            <CalendarPlus size={20} className="text-primaria-400" />
            Informações do Evento
          </h3>
          <div className="space-y-4">
            <CampoTexto rotulo="Título do evento" placeholder="Ex: Calourada de Verão 2026" value={titulo} onChange={(e) => setTitulo((e.target as HTMLInputElement).value)} required />
            <CampoTexto rotulo="Descrição" placeholder="Descreva o evento..." value={descricao} onChange={(e) => setDescricao((e.target as HTMLTextAreaElement).value)} multilinha />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <CampoTexto
                rotulo="Data e horário"
                type="datetime-local"
                min={dataMinima}
                value={dataEvento}
                onChange={(e) => setDataEvento((e.target as HTMLInputElement).value)}
                icone={<Clock size={18} />}
                required
              />
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <CampoTexto
                    rotulo="Cidade"
                    placeholder="Palmas"
                    value={cidade}
                    onChange={(e) => setCidade((e.target as HTMLInputElement).value)}
                    icone={<MapPin size={18} />}
                  />
                </div>
                <div className="space-y-1.5 w-full">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                      UF
                    </label>
                  </div>
                  <div className="relative group">
                    <select
                      value={estado}
                      onChange={(e) => setEstado(e.target.value)}
                      className="w-full bg-[#111a2e]/90 border border-white/10 rounded-xl px-4 py-3 pr-10 text-base sm:text-sm min-h-[44px] text-white placeholder:text-slate-500 font-normal transition-all duration-300 ease-out hover:border-white/20 hover:bg-[#16223d] focus:outline-none focus:border-[#ff007a] focus:ring-2 focus:ring-[#ff007a]/25 focus:bg-[#16223d] appearance-none cursor-pointer"
                    >
                      <option value="TO" className="bg-[#0d1322] text-white">
                        TO
                      </option>
                    </select>
                    <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                      <ChevronDown size={18} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <CampoTexto rotulo="Local" placeholder="Nome do espaço / endereço" value={local} onChange={(e) => setLocal((e.target as HTMLInputElement).value)} icone={<MapPin size={18} />} required />
            
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-texto-secundario">Status do Evento</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'rascunho' | 'publicado' | 'encerrado' | 'cancelado')}
                className="w-full bg-fundo-input border border-borda-sutil rounded-xl px-4 py-3 text-texto-principal focus:outline-none focus:border-primaria-500 text-sm"
              >
                <option value="rascunho">Rascunho</option>
                <option value="publicado">Publicado</option>
                <option value="encerrado">Encerrado</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
          </div>
        </Cartao>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link href="/diretor/eventos" className="flex-1">
            <Botao type="button" variante="contorno" tamanho="lg" larguraTotal>
              Cancelar
            </Botao>
          </Link>
          <Botao type="submit" tamanho="lg" carregando={salvando} className="flex-1">
            Salvar Alterações
          </Botao>
        </div>
      </form>
    </div>
  );
}
