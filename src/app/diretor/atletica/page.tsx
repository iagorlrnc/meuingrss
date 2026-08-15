'use client';

import { useState, useEffect, useRef } from 'react';
import Cartao from '@/componentes/ui/Cartao';
import Botao from '@/componentes/ui/Botao';
import CampoTexto from '@/componentes/ui/CampoTexto';
import Carregando from '@/componentes/ui/Carregando';
import Distintivo from '@/componentes/ui/Distintivo';
import { criarClienteNavegador } from '@/lib/supabase/cliente';
import { usarAutenticacao } from '@/contextos/ContextoAutenticacao';
import { useNotificacao } from '@/componentes/ui/Notificacao';
import { formatarTelefone } from '@/lib/utilitarios';
import type { Atletica } from '@/tipos';
import {
  Trophy,
  Camera,
  Upload,
  Image as ImageIcon,
  Palette,
  Save,
  Building2,
  MapPin,
  AtSign,
  Phone,
  Mail,
  QrCode,
  Trash2,
  Eye,
  RefreshCw,
  Check,
  Plus,
  FileText,
  Edit3,
  Lock,
  X,
  Info,
  ChevronDown,
} from 'lucide-react';

const PALETAS_PREDEFINIDAS = [
  { nome: 'Rosa & Roxo Neon', primaria: '#ff007a', secundaria: '#8b5cf6' },
  { nome: 'Ciano & Azul Elétrico', primaria: '#00e5ff', secundaria: '#026cdf' },
  { nome: 'Dourado & Rosa', primaria: '#ffbe00', secundaria: '#ff007a' },
  { nome: 'Verde Esmeralda', primaria: '#10b981', secundaria: '#047857' },
  { nome: 'Laranja Fogo & Vermelho', primaria: '#f97316', secundaria: '#dc2626' },
  { nome: 'Roxo Profundo & Índigo', primaria: '#7c3aed', secundaria: '#4338ca' },
];

export default function PaginaConfiguracaoAtletica() {
  const { perfil } = usarAutenticacao();
  const { sucesso, erro: notificarErro, info: notificarInfo } = useNotificacao();
  const supabase = criarClienteNavegador();

  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [atleticaId, setAtleticaId] = useState<string | null>(null);

  // Form states
  const [nome, setNome] = useState('');
  const [faculdade, setFaculdade] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('TO');
  const [descricao, setDescricao] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [capaUrl, setCapaUrl] = useState('');
  const [corPrimaria, setCorPrimaria] = useState('#ff007a');
  const [corSecundaria, setCorSecundaria] = useState('#8b5cf6');
  const [instagram, setInstagram] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [emailContato, setEmailContato] = useState('');
  const [chavePix, setChavePix] = useState('');
  const [status, setStatus] = useState<'ativa' | 'inativa' | 'pendente'>('ativa');

  // Snapshot para desfazer / cancelar edição
  const [dadosSnapshot, setDadosSnapshot] = useState<{
    nome: string;
    faculdade: string;
    cidade: string;
    descricao: string;
    logoUrl: string;
    capaUrl: string;
    corPrimaria: string;
    corSecundaria: string;
    instagram: string;
    whatsapp: string;
    emailContato: string;
    chavePix: string;
  } | null>(null);

  const [arrastandoLogo, setArrastandoLogo] = useState(false);
  const [arrastandoCapa, setArrastandoCapa] = useState(false);

  const refInputLogo = useRef<HTMLInputElement>(null);
  const refInputCapa = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (perfil) {
      carregarDadosAtletica();
    }
  }, [perfil]);

  function capturarSnapshot() {
    return {
      nome,
      faculdade,
      cidade,
      descricao,
      logoUrl,
      capaUrl,
      corPrimaria,
      corSecundaria,
      instagram,
      whatsapp,
      emailContato,
      chavePix,
    };
  }

  function iniciarEdicao() {
    setDadosSnapshot(capturarSnapshot());
    setEditando(true);
    notificarInfo('Modo de edição habilitado', 'Você pode alterar as informações da atlética.');
  }

  function cancelarEdicao() {
    if (dadosSnapshot) {
      setNome(dadosSnapshot.nome);
      setFaculdade(dadosSnapshot.faculdade);
      setCidade(dadosSnapshot.cidade);
      setDescricao(dadosSnapshot.descricao);
      setLogoUrl(dadosSnapshot.logoUrl);
      setCapaUrl(dadosSnapshot.capaUrl);
      setCorPrimaria(dadosSnapshot.corPrimaria);
      setCorSecundaria(dadosSnapshot.corSecundaria);
      setInstagram(dadosSnapshot.instagram);
      setWhatsapp(dadosSnapshot.whatsapp);
      setEmailContato(dadosSnapshot.emailContato);
      setChavePix(dadosSnapshot.chavePix);
    }
    setEditando(false);
    notificarInfo('Edição cancelada', 'As alterações não salvas foram descartadas.');
  }

  async function carregarDadosAtletica() {
    setCarregando(true);
    try {
      let idParaBuscar = perfil?.atletica_id;

      // Se não tiver atletica_id diretamente no perfil, buscar se existe alguma atletica vinculada
      if (!idParaBuscar && perfil?.id) {
        const { data: usuarioPerfil } = await supabase
          .from('profiles')
          .select('atletica_id')
          .eq('id', perfil.id)
          .maybeSingle();

        if (usuarioPerfil?.atletica_id) {
          idParaBuscar = usuarioPerfil.atletica_id;
        }
      }

      if (idParaBuscar) {
        setAtleticaId(idParaBuscar);
        const { data: atl, error } = await supabase
          .from('atleticas')
          .select('id, nome, faculdade, cidade, logo_url, capa_url, descricao, cor_primaria, cor_secundaria, instagram, whatsapp, email_contato, chave_pix, status')
          .eq('id', idParaBuscar)
          .maybeSingle();

        if (error) {
          console.error('Erro ao buscar atlética:', error);
        }

        if (atl) {
          const vNome = atl.nome || '';
          const vFaculdade = atl.faculdade || '';
          const vCidade = atl.cidade || '';
          const vDescricao = atl.descricao || '';
          const vLogoUrl = atl.logo_url || '';
          const vCapaUrl = atl.capa_url || '';
          const vCorPrimaria = atl.cor_primaria || '#ff007a';
          const vCorSecundaria = atl.cor_secundaria || '#8b5cf6';
          const vInstagram = atl.instagram || '';
          const vWhatsapp = formatarTelefone(atl.whatsapp || '');
          const vEmailContato = atl.email_contato || '';
          const vChavePix = atl.chave_pix || '';

          setNome(vNome);
          setFaculdade(vFaculdade);
          setCidade(vCidade);
          setDescricao(vDescricao);
          setLogoUrl(vLogoUrl);
          setCapaUrl(vCapaUrl);
          setCorPrimaria(vCorPrimaria);
          setCorSecundaria(vCorSecundaria);
          setInstagram(vInstagram);
          setWhatsapp(vWhatsapp);
          setEmailContato(vEmailContato);
          setChavePix(vChavePix);
          setStatus(atl.status || 'ativa');

          setDadosSnapshot({
            nome: vNome,
            faculdade: vFaculdade,
            cidade: vCidade,
            descricao: vDescricao,
            logoUrl: vLogoUrl,
            capaUrl: vCapaUrl,
            corPrimaria: vCorPrimaria,
            corSecundaria: vCorSecundaria,
            instagram: vInstagram,
            whatsapp: vWhatsapp,
            emailContato: vEmailContato,
            chavePix: vChavePix,
          });
        }
      } else {
        // Diretor ainda sem atlética cadastrada - carregar valores padrão baseados no perfil
        setNome('Sua Atlética');
        setFaculdade('Sua Faculdade');
        setCidade('Sua Cidade');
      }
    } catch (e) {
      console.error('Falha ao carregar atlética:', e);
    } finally {
      setCarregando(false);
    }
  }

  const [enviandoImagem, setEnviandoImagem] = useState(false);

  async function processarArquivoImagem(file: File, tipo: 'logo' | 'capa') {
    if (!editando) {
      notificarInfo('Modo de leitura', 'Clique em "Editar Configurações" para alterar fotos.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      notificarErro('Arquivo muito grande', 'O tamanho máximo da imagem é de 10MB.');
      return;
    }

    setEnviandoImagem(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const nomeArquivo = `${tipo}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;

      const { data, error } = await supabase.storage
        .from('atleticas')
        .upload(nomeArquivo, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (error) {
        console.error('Erro no upload para o storage:', error);
        throw error;
      }

      const { data: publicUrlData } = supabase.storage
        .from('atleticas')
        .getPublicUrl(data.path);

      if (tipo === 'logo') {
        setLogoUrl(publicUrlData.publicUrl);
      } else {
        setCapaUrl(publicUrlData.publicUrl);
      }

      sucesso('Imagem enviada!', `A foto de ${tipo === 'logo' ? 'perfil' : 'capa'} foi salva no Supabase Storage.`);
    } catch (err: unknown) {
      const mensagem = err instanceof Error ? err.message : 'Não foi possível enviar a imagem para o armazenamento.';
      notificarErro('Erro no upload', mensagem);
    } finally {
      setEnviandoImagem(false);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>, tipo: 'logo' | 'capa') {
    e.preventDefault();
    if (tipo === 'logo') setArrastandoLogo(false);
    else setArrastandoCapa(false);

    if (!editando) {
      notificarInfo('Modo de leitura', 'Clique em "Editar Configurações" para alterar fotos.');
      return;
    }

    const file = e.dataTransfer.files?.[0];
    if (file) {
      processarArquivoImagem(file, tipo);
    }
  }

  async function salvarConfiguracoes(e: React.FormEvent) {
    e.preventDefault();

    if (!nome.trim()) {
      notificarErro('Nome obrigatório', 'Informe o nome da atlética.');
      return;
    }

    setSalvando(true);

    try {
      const dadosAtletica = {
        nome: nome.trim(),
        faculdade: faculdade.trim() || 'Não informada',
        cidade: cidade.trim() || 'Não informada',
        descricao: descricao.trim() || null,
        logo_url: logoUrl.trim() || null,
        capa_url: capaUrl.trim() || null,
        cor_primaria: corPrimaria,
        cor_secundaria: corSecundaria,
        instagram: instagram.trim() || null,
        whatsapp: whatsapp.trim() || null,
        email_contato: emailContato.trim() || null,
        chave_pix: chavePix.trim() || null,
      };

      if (atleticaId) {
        // Tenta atualizar incluindo novos campos, com fallback gracioso se algum campo não existir na tabela
        let { error: errUpdate } = await supabase
          .from('atleticas')
          .update(dadosAtletica)
          .eq('id', atleticaId);

        // Se falhou por coluna inexistente, tenta update apenas com campos legados
        if (errUpdate) {
          console.warn('Tentando salvamento legados devido a incompatibilidade de colunas:', errUpdate.message);
          const { error: errFallback } = await supabase
            .from('atleticas')
            .update({
              nome: dadosAtletica.nome,
              faculdade: dadosAtletica.faculdade,
              cidade: dadosAtletica.cidade,
              logo_url: dadosAtletica.logo_url,
              cor_primaria: dadosAtletica.cor_primaria,
              cor_secundaria: dadosAtletica.cor_secundaria,
            })
            .eq('id', atleticaId);

          if (errFallback) {
            throw errFallback;
          }
        }
      } else {
        // Criar nova atlética para o diretor
        const { data: novaAtl, error: errInsert } = await supabase
          .from('atleticas')
          .insert({
            ...dadosAtletica,
            status: 'ativa',
          })
          .select()
          .single();

        if (errInsert || !novaAtl) {
          throw errInsert || new Error('Não foi possível criar a atlética.');
        }

        setAtleticaId(novaAtl.id);

        // Vincular a nova atlética ao perfil do diretor
        if (perfil?.id) {
          await supabase
            .from('profiles')
            .update({ atletica_id: novaAtl.id })
            .eq('id', perfil.id);
        }
      }

      setDadosSnapshot(capturarSnapshot());
      setEditando(false);
      sucesso('Atlética salva!', 'As configurações da atlética foram atualizadas com sucesso.');
    } catch (err: unknown) {
      const mensagem = err instanceof Error ? err.message : 'Ocorreu um erro ao salvar as alterações da atlética.';
      notificarErro('Erro ao salvar', mensagem);
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <Carregando tamanho="lg" />
        <p className="text-sm text-texto-terciario animate-pulse">Carregando perfil da atlética...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* Cabeçalho de Título */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-primaria-500/10 text-primaria-400 border border-primaria-500/20">
              <Camera className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black font-titulo">
                Configurações da <span className="gradiente-texto">Atlética</span>
              </h1>
              <p className="text-xs sm:text-sm text-texto-secundario">
                Personalize fotos, capa, identidade visual e dados que aparecem para os alunos.
              </p>
            </div>
          </div>
        </div>

        <div>
          {!editando ? (
            <div className="flex items-center gap-2">
              <span className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-fundo-hover text-texto-secundario text-xs font-semibold">
                <Lock size={13} className="text-amber-400" /> Modo de Leitura
              </span>
              <Botao
                type="button"
                onClick={iniciarEdicao}
                icone={<Edit3 size={18} />}
                variante="primario"
                tamanho="md"
              >
                Editar Configurações
              </Botao>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Botao
                type="button"
                onClick={cancelarEdicao}
                disabled={salvando}
                icone={<X size={18} />}
                variante="contorno"
                tamanho="md"
              >
                Cancelar
              </Botao>
              <Botao
                type="button"
                onClick={salvarConfiguracoes}
                carregando={salvando}
                icone={<Save size={18} />}
                variante="primario"
                tamanho="md"
              >
                Salvar Alterações
              </Botao>
            </div>
          )}
        </div>
      </div>

      {/* CARD DE PRÉ-VISUALIZAÇÃO AO VIVO (LIVE PREVIEW) */}
      <Cartao variante="vidro" className="p-0 overflow-hidden border border-borda-sutil relative">
        <div className="px-4 py-2.5 bg-fundo-card/60 border-b border-borda-sutil flex items-center justify-between">
          <span className="text-xs font-semibold text-texto-terciario flex items-center gap-2">
            <Eye size={14} className="text-primaria-400" /> Pré-Visualização do Perfil Público
          </span>
          <Distintivo status={status} />
        </div>

        {/* Banner de Capa */}
        <div
          className="h-44 sm:h-56 w-full relative transition-all duration-300 flex items-end p-4 sm:p-6"
          style={{
            background: capaUrl
              ? `linear-gradient(to bottom, rgba(0,0,0,0.2), rgba(8,12,20,0.85)), url('${capaUrl}') center/cover no-repeat`
              : `linear-gradient(135deg, ${corPrimaria}, ${corSecundaria}, #080c14)`,
          }}
        >
          <div className="flex flex-col sm:flex-row sm:items-end gap-4 w-full z-10">
            {/* Foto de Perfil (Logo Avatar) */}
            <div className="relative group">
              <div
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl border-4 border-fundo-principal shadow-xl overflow-hidden flex items-center justify-center text-white font-black text-2xl sm:text-3xl flex-shrink-0 transition-transform duration-300 group-hover:scale-105"
                style={{
                  background: logoUrl ? 'transparent' : `linear-gradient(135deg, ${corPrimaria}, ${corSecundaria})`,
                }}
              >
                {logoUrl ? (
                  <img src={logoUrl} alt={nome} className="w-full h-full object-cover" />
                ) : (
                  <span>{nome ? nome[0].toUpperCase() : 'A'}</span>
                )}
              </div>
            </div>

            {/* Informações no Banner */}
            <div className="text-white min-w-0 flex-1">
              <h2 className="text-xl sm:text-3xl font-black font-titulo drop-shadow-md truncate">
                {nome || 'Nome da Atlética'}
              </h2>
              <div className="flex flex-wrap items-center gap-3 mt-1 text-xs sm:text-sm text-gray-200">
                <span className="flex items-center gap-1 opacity-90">
                  <Building2 size={14} /> {faculdade || 'Faculdade'}
                </span>
                <span className="opacity-40">•</span>
                <span className="flex items-center gap-1 opacity-90">
                  <MapPin size={14} /> {cidade || 'Cidade'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Biografia e Redes Sociais no Preview */}
        <div className="p-4 sm:p-6 bg-fundo-card/80 flex flex-col md:flex-row md:items-center justify-between gap-4 border-t border-borda-sutil">
          <p className="text-xs sm:text-sm text-texto-secundario max-w-2xl">
            {descricao || 'Sua bio aparecerá aqui. Conte aos alunos sobre a história, modalidades e conquistas da sua atlética!'}
          </p>

          <div className="flex items-center gap-3 text-xs text-texto-terciario flex-shrink-0">
            {/* Definição de Gradiente SVG para o Ícone do Instagram */}
            <svg width="0" height="0" className="absolute w-0 h-0 pointer-events-none">
              <defs>
                <linearGradient id="grad-instagram" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ff007a" />
                  <stop offset="50%" stopColor="#e1306c" />
                  <stop offset="100%" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
            </svg>

            {instagram && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fundo-hover text-texto-principal">
                <AtSign size={14} style={{ stroke: 'url(#grad-instagram)' }} className="shrink-0 font-bold" /> {instagram}
              </span>
            )}
            {whatsapp && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fundo-hover text-texto-principal">
                <Phone size={14} className="text-emerald-400" /> {whatsapp}
              </span>
            )}
          </div>
        </div>
      </Cartao>

      <form onSubmit={salvarConfiguracoes} className="space-y-8">
        {/* SEÇÃO 1: FOTOS & MÍDIA */}
        <Cartao variante="vidro" className="p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-borda-sutil gap-2">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-primaria-400" />
              <h3 className="font-bold text-lg font-titulo">Fotos & Mídia da Atlética</h3>
            </div>
            <span className="text-xs text-texto-terciario">
              Sinta-se à vontade para arrastar os arquivos ou clicar nas caixas (Máx. 5MB)
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Foto de Perfil (Logo) Dropzone */}
            <div className="lg:col-span-5 space-y-3">
              <label className="block text-sm font-semibold text-texto-principal flex items-center justify-between">
                <span>Foto de Perfil / Logo</span>
                {logoUrl ? (
                  <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                    <Check size={12} /> Personalizada
                  </span>
                ) : (
                  <span className="text-[11px] text-texto-terciario font-medium">Logo padrão</span>
                )}
              </label>

              <input
                ref={refInputLogo}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) processarArquivoImagem(file, 'logo');
                }}
                className="hidden"
              />

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  if (editando) setArrastandoLogo(true);
                }}
                onDragLeave={() => setArrastandoLogo(false)}
                onDrop={(e) => handleDrop(e, 'logo')}
                onClick={() => {
                  if (editando) refInputLogo.current?.click();
                  else notificarInfo('Modo de leitura', 'Clique em "Editar Configurações" para alterar fotos.');
                }}
                className={`group relative rounded-2xl border-2 border-dashed p-5 flex flex-col items-center justify-center text-center transition-all duration-300 min-h-[210px] overflow-hidden ${
                  !editando
                    ? 'border-borda-sutil bg-fundo-card/30 cursor-not-allowed opacity-85'
                    : arrastandoLogo
                    ? 'border-primaria-400 bg-primaria-500/15 scale-[1.02] cursor-pointer'
                    : logoUrl
                    ? 'border-primaria-500/30 bg-fundo-card/80 hover:border-primaria-500/60 cursor-pointer'
                    : 'border-borda-sutil bg-fundo-card/40 hover:bg-fundo-hover hover:border-primaria-500/50 cursor-pointer'
                }`}
              >
                {logoUrl ? (
                  <div className="relative w-full h-full flex flex-col items-center justify-center gap-3">
                    <div
                      className="w-24 h-24 rounded-2xl border-4 border-fundo-principal shadow-xl overflow-hidden relative group-hover:scale-105 transition-transform duration-300"
                      style={{
                        background: `linear-gradient(135deg, ${corPrimaria}, ${corSecundaria})`,
                      }}
                    >
                      <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-texto-secundario group-hover:text-primaria-400 font-medium transition-colors flex items-center gap-1">
                        <Camera size={13} /> {editando ? 'Clique ou arraste para substituir' : 'Logo da Atlética'}
                      </span>
                      {editando && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLogoUrl('');
                          }}
                          className="p-1.5 rounded-lg text-erro hover:bg-erro/10 transition-colors"
                          title="Remover Logo"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 py-2">
                    <div className="w-16 h-16 rounded-2xl bg-primaria-500/10 text-primaria-400 border border-primaria-500/20 mx-auto flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      <Camera className="w-8 h-8" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-texto-principal group-hover:text-primaria-400 transition-colors">
                        {editando ? 'Arraste a foto de perfil aqui' : 'Foto de perfil / logo'}
                      </p>
                      <p className="text-[11px] text-texto-terciario mt-0.5">
                        {editando ? (
                          <>ou <span className="text-primaria-400 underline font-medium">clique para selecionar o arquivo</span></>
                        ) : (
                          'Clique em "Editar Configurações" para alterar'
                        )}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Foto de Capa (Banner) Dropzone */}
            <div className="lg:col-span-7 space-y-3">
              <label className="block text-sm font-semibold text-texto-principal flex items-center justify-between">
                <span>Foto de Capa / Banner</span>
                {capaUrl ? (
                  <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                    <Check size={12} /> Imagem Personalizada
                  </span>
                ) : (
                  <span className="text-[11px] text-texto-terciario font-medium">
                    Gradiente das cores ativo
                  </span>
                )}
              </label>

              <input
                ref={refInputCapa}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) processarArquivoImagem(file, 'capa');
                }}
                className="hidden"
                disabled={!editando}
              />

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  if (editando) setArrastandoCapa(true);
                }}
                onDragLeave={() => setArrastandoCapa(false)}
                onDrop={(e) => handleDrop(e, 'capa')}
                onClick={() => {
                  if (editando) refInputCapa.current?.click();
                  else notificarInfo('Modo de leitura', 'Clique em "Editar Configurações" para alterar mídias.');
                }}
                className={`group relative rounded-2xl border-2 border-dashed p-4 flex flex-col items-center justify-center text-center transition-all duration-300 min-h-[210px] overflow-hidden ${
                  !editando
                    ? 'border-borda-sutil bg-fundo-card/30 cursor-not-allowed opacity-85'
                    : arrastandoCapa
                    ? 'border-secundaria-400 bg-secundaria-500/15 scale-[1.02] cursor-pointer'
                    : capaUrl
                    ? 'border-secundaria-500/30 bg-fundo-card/80 hover:border-secundaria-500/60 cursor-pointer'
                    : 'border-borda-sutil bg-fundo-card/40 hover:bg-fundo-hover hover:border-secundaria-500/50 cursor-pointer'
                }`}
              >
                {capaUrl ? (
                  <div className="relative w-full h-full flex flex-col justify-between p-1">
                    <div
                      className="h-28 rounded-xl border border-borda-sutil overflow-hidden relative shadow-md group-hover:scale-[1.01] transition-transform duration-300"
                      style={{
                        background: `url('${capaUrl}') center/cover no-repeat`,
                      }}
                    >
                      <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
                    </div>

                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-borda-sutil text-xs">
                      <span className="text-texto-secundario group-hover:text-secundaria-400 font-medium transition-colors flex items-center gap-1">
                        <Upload size={13} /> {editando ? 'Clique ou arraste para substituir a capa' : 'Foto de Capa Atual'}
                      </span>
                      {editando && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCapaUrl('');
                          }}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-erro hover:bg-erro/10 transition-colors"
                          title="Remover Capa"
                        >
                          <Trash2 size={14} /> Remover Capa
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 py-2">
                    <div className="w-16 h-16 rounded-2xl bg-secundaria-500/10 text-secundaria-400 border border-secundaria-500/20 mx-auto flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      <Upload className="w-8 h-8" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-texto-principal group-hover:text-secundaria-400 transition-colors">
                        {editando ? 'Arraste a foto de capa (banner) aqui' : 'Foto de capa (banner)'}
                      </p>
                      <p className="text-[11px] text-texto-terciario mt-0.5">
                        {editando ? (
                          <>ou <span className="text-secundaria-400 underline font-medium">clique para procurar imagem</span></>
                        ) : (
                          'Clique em "Editar Configurações" para alterar'
                        )}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Cartao>

        {/* SEÇÃO 2: INFORMAÇÕES GERAIS */}
        <Cartao variante="vidro" className="p-6 space-y-6">
          <div className="flex items-center gap-2 pb-3 border-b border-borda-sutil">
            <Trophy className="w-5 h-5 text-primaria-400" />
            <h3 className="font-bold text-lg font-titulo">Informações Principais</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <CampoTexto
              rotulo="Nome da Atlética *"
              placeholder="Ex: Atlética Pantera"
              value={nome}
              onChange={(e) => setNome((e.target as HTMLInputElement).value)}
              disabled={!editando}
              required
            />

            <CampoTexto
              rotulo="Faculdade / Universidade *"
              placeholder="Ex: UFT - Engenharia"
              value={faculdade}
              onChange={(e) => setFaculdade((e.target as HTMLInputElement).value)}
              disabled={!editando}
              required
            />

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <CampoTexto
                  rotulo="Cidade *"
                  placeholder="Ex: Palmas"
                  value={cidade}
                  onChange={(e) => setCidade((e.target as HTMLInputElement).value)}
                  disabled={!editando}
                  required
                />
              </div>
              <div className="space-y-1.5 w-full">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                    Estado
                  </label>
                </div>
                <div className="relative group">
                  <select
                    value={estado}
                    onChange={(e) => setEstado(e.target.value)}
                    disabled={!editando}
                    className="w-full bg-[#111a2e]/90 border border-white/10 rounded-xl px-4 py-3 pr-10 text-base sm:text-sm min-h-[44px] text-white placeholder:text-slate-500 font-normal transition-all duration-300 ease-out hover:border-white/20 hover:bg-[#16223d] focus:outline-none focus:border-[#ff007a] focus:ring-2 focus:ring-[#ff007a]/25 focus:bg-[#16223d] disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[#090e1a] appearance-none cursor-pointer"
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

          <div>
            <label className="block text-sm font-semibold text-texto-principal mb-2 flex items-center gap-2">
              <FileText size={16} className="text-secundaria-400" /> Biografia & Descrição da Atlética
            </label>
            <textarea
              rows={4}
              placeholder="Conte um pouco sobre a atlética, mascote, títulos, treinos, eventos..."
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              disabled={!editando}
              className="w-full px-4 py-3 rounded-xl bg-fundo-card border border-borda-sutil text-texto-principal placeholder-texto-terciario text-sm focus:outline-none focus:border-primaria-500/50 transition-all resize-y disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>
        </Cartao>

        {/* SEÇÃO 3: IDENTIDADE VISUAL & CORES */}
        {(() => {
          const temImagens = Boolean(logoUrl?.trim() || capaUrl?.trim());
          const desabilitarCores = !editando || temImagens;

          return (
            <Cartao variante="vidro" className="p-6 space-y-6">
              <div className="flex items-center gap-2 pb-3 border-b border-borda-sutil">
                <Palette className="w-5 h-5 text-primaria-400" />
                <h3 className="font-bold text-lg font-titulo">Identidade Visual & Cores</h3>
              </div>

              {/* Texto Informativo */}
              {temImagens ? (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-start gap-3 leading-relaxed">
                  <Lock size={16} className="mt-0.5 shrink-0 text-amber-400" />
                  <div>
                    <strong className="block text-amber-400 font-semibold mb-0.5">Seleção Manual de Cores Desabilitada</strong>
                    O campo fica desabilitado pois a atlética possui foto de perfil e/ou foto de capa cadastradas. Para personalizar as cores manualmente, remova a foto de perfil e a foto de capa da atlética.
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-primaria-500/10 border border-primaria-500/20 text-xs text-primaria-300 flex items-start gap-3 leading-relaxed">
                  <Info size={16} className="mt-0.5 shrink-0 text-primaria-400" />
                  <div>
                    <strong className="block text-primaria-400 font-semibold mb-0.5">Seleção Manual de Cores Habilitada</strong>
                    Como a atlética não possui foto de perfil ou foto de capa cadastradas, você pode personalizar manualmente a cor primária e secundária da marca ou selecionar uma das paletas predefinidas abaixo.
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-texto-principal mb-2">
                    Cor Primária da Marca
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={corPrimaria}
                      onChange={(e) => setCorPrimaria(e.target.value)}
                      disabled={desabilitarCores}
                      className="w-12 h-12 rounded-xl cursor-pointer border-0 bg-transparent p-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <CampoTexto
                      value={corPrimaria}
                      onChange={(e) => setCorPrimaria((e.target as HTMLInputElement).value)}
                      placeholder="#ff007a"
                      disabled={desabilitarCores}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-texto-principal mb-2">
                    Cor Secundária da Marca
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={corSecundaria}
                      onChange={(e) => setCorSecundaria(e.target.value)}
                      disabled={desabilitarCores}
                      className="w-12 h-12 rounded-xl cursor-pointer border-0 bg-transparent p-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <CampoTexto
                      value={corSecundaria}
                      onChange={(e) => setCorSecundaria((e.target as HTMLInputElement).value)}
                      placeholder="#8b5cf6"
                      disabled={desabilitarCores}
                    />
                  </div>
                </div>
              </div>

              {/* Paletas de cores prontas */}
              <div>
                <label className="block text-xs font-semibold text-texto-terciario uppercase tracking-wider mb-3">
                  Paletas Rápidas Predefinidas
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {PALETAS_PREDEFINIDAS.map((p) => {
                    const ativa = corPrimaria === p.primaria && corSecundaria === p.secundaria;
                    return (
                      <button
                        key={p.nome}
                        type="button"
                        disabled={desabilitarCores}
                        onClick={() => {
                          if (!desabilitarCores) {
                            setCorPrimaria(p.primaria);
                            setCorSecundaria(p.secundaria);
                          }
                        }}
                        className={`p-2.5 rounded-xl border text-left transition-all ${
                          desabilitarCores
                            ? 'opacity-50 cursor-not-allowed border-borda-sutil bg-fundo-card/30'
                            : ativa
                            ? 'border-primaria-500 bg-primaria-500/10 ring-2 ring-primaria-500/30'
                            : 'border-borda-sutil bg-fundo-card/50 hover:bg-fundo-hover'
                        }`}
                      >
                        <div
                          className="h-6 rounded-lg w-full mb-1.5 shadow-sm flex items-center justify-end px-1"
                          style={{ background: `linear-gradient(135deg, ${p.primaria}, ${p.secundaria})` }}
                        >
                          {ativa && <Check size={14} className="text-white" />}
                        </div>
                        <span className="text-[11px] font-medium text-texto-secundario block truncate">
                          {p.nome}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </Cartao>
          );
        })()}

        {/* SEÇÃO 4: REDES SOCIAIS & CONTATO */}
        <Cartao variante="vidro" className="p-6 space-y-6">
          <div className="flex items-center gap-2 pb-3 border-b border-borda-sutil">
            <AtSign className="w-5 h-5 text-primaria-400" />
            <h3 className="font-bold text-lg font-titulo">Redes Sociais & Contato</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CampoTexto
              rotulo="Instagram"
              placeholder="@atletica.exemplo"
              icone={<AtSign size={18} />}
              value={instagram}
              onChange={(e) => setInstagram((e.target as HTMLInputElement).value)}
              disabled={!editando}
            />

            <CampoTexto
              rotulo="WhatsApp / Telefone de Contato"
              placeholder="(63) 99999-9999"
              icone={<Phone size={18} />}
              value={whatsapp}
              onChange={(e) => setWhatsapp(formatarTelefone((e.target as HTMLInputElement).value))}
              disabled={!editando}
            />
          </div>
        </Cartao>

        {/* Botão de Ação no Rodapé */}
        <div className="flex justify-end pt-4">
          {!editando ? (
            <Botao
              type="button"
              onClick={iniciarEdicao}
              icone={<Edit3 size={18} />}
              variante="primario"
              tamanho="lg"
              className="w-full sm:w-auto min-w-[220px]"
            >
              Editar Configurações
            </Botao>
          ) : (
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <Botao
                type="button"
                onClick={cancelarEdicao}
                disabled={salvando}
                icone={<X size={18} />}
                variante="contorno"
                tamanho="lg"
                className="flex-1 sm:flex-none min-w-[140px]"
              >
                Cancelar
              </Botao>
              <Botao
                type="submit"
                carregando={salvando}
                icone={<Save size={18} />}
                variante="primario"
                tamanho="lg"
                className="flex-1 sm:flex-none min-w-[200px]"
              >
                Salvar Alterações
              </Botao>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
