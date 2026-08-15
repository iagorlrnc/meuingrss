'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Cartao from '@/componentes/ui/Cartao';
import Botao from '@/componentes/ui/Botao';
import { criarClienteNavegador } from '@/lib/supabase/cliente';
import { usarAutenticacao } from '@/contextos/ContextoAutenticacao';
import type { Evento } from '@/tipos';
import { cn, formatarDataHora } from '@/lib/utilitarios';
import {
  ScanLine,
  CheckCircle,
  XCircle,
  Camera,
  RotateCcw,
  User,
  Ticket,
  Clock,
  AlertTriangle,
} from 'lucide-react';

type ResultadoTipo = 'sucesso' | 'erro' | null;

interface ResultadoValidacao {
  tipo: ResultadoTipo;
  mensagem: string;
  nomeComprador?: string;
  nomeLote?: string;
  dataValidacao?: string;
}

export default function PaginaValidarEntrada() {
  const { perfil } = usarAutenticacao();
  const [eventos, setEventos] = useState<Pick<Evento, 'id' | 'titulo' | 'data_evento'>[]>([]);
  const [eventoSelecionado, setEventoSelecionado] = useState('');
  const [escaneando, setEscaneando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoValidacao | null>(null);
  const [processando, setProcessando] = useState(false);
  const [totalValidados, setTotalValidados] = useState(0);
  const [erroCamera, setErroCamera] = useState<string | null>(null);

  const scannerRef = useRef<any>(null);
  const scannerAtivo = useRef(false);
  const processandoRef = useRef(false);
  const ultimoHashLidoRef = useRef<string | null>(null);

  const supabase = criarClienteNavegador();

  useEffect(() => {
    if (perfil?.atletica_id) buscarEventos();
  }, [perfil]);

  // Cleanup ao desmontar
  useEffect(() => {
    return () => {
      pararScanner();
    };
  }, []);

  async function buscarEventos() {
    const { data } = await supabase
      .from('eventos')
      .select('id, titulo, data_evento')
      .eq('atletica_id', perfil!.atletica_id!)
      .in('status', ['publicado', 'encerrado'])
      .order('data_evento', { ascending: false });

    if (data) setEventos(data);
  }

  function reproduzirSom(tipo: 'sucesso' | 'erro') {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.value = 0.3;

      if (tipo === 'sucesso') {
        osc.frequency.value = 800;
        osc.start();
        setTimeout(() => { osc.frequency.value = 1200; }, 100);
        setTimeout(() => { osc.stop(); ctx.close(); }, 250);
      } else {
        osc.frequency.value = 300;
        osc.start();
        setTimeout(() => { osc.frequency.value = 200; }, 150);
        setTimeout(() => { osc.stop(); ctx.close(); }, 400);
      }
    } catch { /* Audio API indisponível */ }
  }

  function vibrar(padrao: number | number[]) {
    try {
      if ('vibrate' in navigator) {
        navigator.vibrate(padrao);
      }
    } catch { /* Vibração indisponível */ }
  }

  const handleScan = useCallback(async (textoDecodificado: string) => {
    if (processandoRef.current || ultimoHashLidoRef.current === textoDecodificado || !eventoSelecionado || !perfil?.id) return;
    
    processandoRef.current = true;
    ultimoHashLidoRef.current = textoDecodificado;
    setProcessando(true);

    // Parar a câmera para congelar o fluxo e não ler o mesmo QR repetidamente
    await pararScanner();

    try {
      const { data, error } = await supabase.rpc('validar_ingresso', {
        p_qr_hash: textoDecodificado,
        p_evento_id: eventoSelecionado,
        p_validado_por: perfil.id,
      });

      if (error || !data) {
        reproduzirSom('erro');
        vibrar([100, 50, 100]);
        setResultado({
          tipo: 'erro',
          mensagem: 'Erro ao validar ingresso no servidor.',
        });
      } else {
        const res = data as {
          sucesso: boolean;
          mensagem: string;
          nomeComprador?: string;
          nomeLote?: string;
          dataValidacao?: string;
        };

        if (res.sucesso) {
          reproduzirSom('sucesso');
          vibrar(200);
          setTotalValidados(prev => prev + 1);
          setResultado({
            tipo: 'sucesso',
            mensagem: res.mensagem,
            nomeComprador: res.nomeComprador,
            nomeLote: res.nomeLote,
            dataValidacao: res.dataValidacao,
          });
        } else {
          reproduzirSom('erro');
          vibrar([100, 50, 100]);
          setResultado({
            tipo: 'erro',
            mensagem: res.mensagem,
            nomeComprador: res.nomeComprador,
            nomeLote: res.nomeLote,
            dataValidacao: res.dataValidacao,
          });
        }
      }
    } catch {
      reproduzirSom('erro');
      vibrar([100, 50, 100]);
      setResultado({
        tipo: 'erro',
        mensagem: 'Erro de comunicação ao validar ingresso.',
      });
    }

    setProcessando(false);
    processandoRef.current = false;
  }, [eventoSelecionado, supabase, perfil]);

  async function pararScanner() {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState?.();
        // State 2 = SCANNING, State 3 = PAUSED
        if (state === 2 || state === 3) {
          await scannerRef.current.stop();
        }
      } catch { /* Ignorar erros ao parar */ }
      scannerRef.current = null;
      scannerAtivo.current = false;
    }
  }

  async function iniciarScanner() {
    setResultado(null);
    setErroCamera(null);
    setEscaneando(true);
    processandoRef.current = false;

    // Aguardar a renderização do elemento #leitor-qr no DOM
    await new Promise(resolve => setTimeout(resolve, 150));

    try {
      const { Html5Qrcode } = await import('html5-qrcode');

      // Limpar instância anterior se existir
      await pararScanner();

      const scanner = new Html5Qrcode('leitor-qr');
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        (decodedText: string) => {
          handleScan(decodedText);
        },
        () => {
          // Ignorar frames sem QR
        }
      );

      scannerAtivo.current = true;
    } catch (err: unknown) {
      const mensagemErro = err instanceof Error ? err.message : String(err || '');

      if (mensagemErro.includes('Permission') || mensagemErro.includes('NotAllowed')) {
        setErroCamera(
          'Permissão de câmera negada. Para usar o scanner, permita o acesso à câmera nas configurações do seu navegador e recarregue a página.'
        );
      } else if (mensagemErro.includes('NotFound') || mensagemErro.includes('DevicesNotFound')) {
        setErroCamera(
          'Nenhuma câmera encontrada no dispositivo. Conecte uma câmera ou use um dispositivo com câmera.'
        );
      } else if (mensagemErro.includes('NotReadable') || mensagemErro.includes('TrackStartError')) {
        setErroCamera(
          'A câmera está sendo usada por outro aplicativo. Feche outros apps que usam a câmera e tente novamente.'
        );
      } else if (mensagemErro.includes('insecure') || mensagemErro.includes('secure context')) {
        setErroCamera(
          'O acesso à câmera requer conexão segura (HTTPS). Verifique se o site está acessível via HTTPS.'
        );
      } else {
        setErroCamera(`Não foi possível acessar a câmera: ${mensagemErro}`);
      }

      setEscaneando(false);
    }
  }

  async function continuarEscaneando() {
    setResultado(null);
    setProcessando(false);
    processandoRef.current = false;
    ultimoHashLidoRef.current = null;

    await pararScanner();
    await iniciarScanner();
  }

  async function fecharScanner() {
    await pararScanner();
    setEscaneando(false);
    setResultado(null);
    setErroCamera(null);
    processandoRef.current = false;
    ultimoHashLidoRef.current = null;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-black font-titulo mb-2">
        Validar <span className="gradiente-texto">Entrada</span>
      </h1>
      <p className="text-texto-secundario mb-8">
        Escaneie o QR Code do ingresso na entrada do evento
      </p>

      {/* Seleção de Evento */}
      <Cartao variante="vidro" className="mb-6">
        <label className="text-sm font-medium text-texto-secundario mb-2 block">
          Selecione o evento
        </label>
        <select
          value={eventoSelecionado}
          onChange={(e) => {
            setEventoSelecionado(e.target.value);
            fecharScanner();
          }}
          className="w-full bg-fundo-input border border-borda-sutil rounded-xl px-4 py-3 text-base sm:text-sm min-h-[44px] text-texto-principal focus:outline-none focus:border-primaria-500"
        >
          <option value="">Escolha um evento...</option>
          {eventos.map(e => (
            <option key={e.id} value={e.id}>{e.titulo}</option>
          ))}
        </select>
      </Cartao>

      {/* Área do Scanner / Resultado */}
      {eventoSelecionado && (
        <Cartao variante="elevado" className="mb-6">
          {resultado ? (
            /* === Resultado da Validação === */
            <div className={cn(
              'text-center py-8 px-4 rounded-2xl border-2 animar-entrar-escala',
              resultado.tipo === 'sucesso'
                ? 'bg-sucesso/5 border-sucesso/30'
                : 'bg-erro/5 border-erro/30'
            )}>
              {resultado.tipo === 'sucesso' ? (
                <CheckCircle className="w-20 h-20 text-sucesso mx-auto mb-4" />
              ) : (
                <XCircle className="w-20 h-20 text-erro mx-auto mb-4" />
              )}

              <h3 className={cn(
                'text-xl font-bold font-titulo mb-2',
                resultado.tipo === 'sucesso' ? 'text-sucesso' : 'text-erro'
              )}>
                {resultado.tipo === 'sucesso' ? '✅ Acesso Liberado' : `⛔ ${resultado.mensagem}`}
              </h3>

              {resultado.tipo === 'sucesso' && (
                <p className="text-texto-secundario text-sm mb-2">{resultado.mensagem}</p>
              )}

              {resultado.nomeComprador && (
                <div className="flex items-center gap-2 justify-center text-texto-secundario mt-3">
                  <User size={16} />
                  <span className="font-semibold">{resultado.nomeComprador}</span>
                </div>
              )}

              {resultado.nomeLote && (
                <div className="flex items-center gap-2 justify-center text-texto-terciario mt-1">
                  <Ticket size={14} />
                  <span className="text-sm">{resultado.nomeLote}</span>
                </div>
              )}

              {resultado.dataValidacao && resultado.tipo === 'erro' && (
                <div className="flex items-center gap-2 justify-center text-texto-terciario mt-3 bg-fundo-card/50 rounded-lg px-3 py-2 mx-auto w-fit">
                  <Clock size={14} />
                  <span className="text-xs">
                    Utilizado em: <strong className="text-texto-secundario">{formatarDataHora(resultado.dataValidacao)}</strong>
                  </span>
                </div>
              )}

              <Botao
                onClick={continuarEscaneando}
                className="mt-6"
                tamanho="lg"
                icone={<RotateCcw size={18} />}
              >
                Escanear Próximo Ingresso
              </Botao>
            </div>
          ) : processando ? (
            /* === Estado de Processamento === */
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full border-4 border-primaria-500/30 border-t-primaria-500 animate-spin" />
              <p className="text-texto-secundario font-medium">
                Validando ingresso...
              </p>
            </div>
          ) : !escaneando ? (
            /* === Estado Inicial: Iniciar Scanner === */
            <div className="text-center py-12">
              <Camera className="w-16 h-16 text-texto-terciario mx-auto mb-4" />
              <p className="text-texto-secundario mb-6">
                Clique para ativar a câmera e escanear
              </p>
              <Botao
                onClick={iniciarScanner}
                tamanho="lg"
                icone={<ScanLine size={20} />}
              >
                Iniciar Scanner
              </Botao>
            </div>
          ) : (
            /* === Câmera Ativa === */
            <div>
              <div
                id="leitor-qr"
                className="rounded-xl overflow-hidden"
                style={{ width: '100%', maxWidth: 400, margin: '0 auto' }}
              />
              <p className="text-center text-sm text-texto-terciario mt-4">
                Aponte a câmera para o QR Code do ingresso
              </p>
              <div className="text-center mt-4">
                <button
                  onClick={fecharScanner}
                  className="text-xs text-texto-terciario hover:text-texto-secundario transition-colors underline"
                >
                  Fechar câmera
                </button>
              </div>
            </div>
          )}

          {/* Erro de Câmera */}
          {erroCamera && (
            <div className="mt-4 p-4 rounded-xl bg-erro/5 border border-erro/20 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-erro shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-erro font-medium mb-1">Erro de câmera</p>
                <p className="text-xs text-texto-terciario leading-relaxed">
                  {erroCamera}
                </p>
                <button
                  onClick={iniciarScanner}
                  className="mt-2 text-xs text-primaria-400 hover:text-primaria-300 font-semibold transition-colors"
                >
                  Tentar novamente
                </button>
              </div>
            </div>
          )}
        </Cartao>
      )}

      {/* Contador de Sessão */}
      {totalValidados > 0 && (
        <Cartao variante="vidro" className="text-center">
          <p className="text-xs text-texto-terciario">Ingressos validados nesta sessão</p>
          <p className="text-3xl font-black font-titulo gradiente-texto">{totalValidados}</p>
        </Cartao>
      )}
    </div>
  );
}
