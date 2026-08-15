'use client';

import React from 'react';
import Cartao from '@/componentes/ui/Cartao';
import { Inbox } from 'lucide-react';

interface EstadoVazioProps {
  titulo?: string;
  descricao?: string;
  icone?: React.ReactNode;
  acao?: React.ReactNode;
  className?: string;
}

export default function EstadoVazio({
  titulo = 'Nenhuma informação no momento',
  descricao = 'Não há dados disponíveis para exibição nesta seção.',
  icone,
  acao,
  className,
}: EstadoVazioProps) {
  return (
    <Cartao variante="vidro" className={`text-center py-12 px-6 ${className || ''}`}>
      <div className="w-14 h-14 rounded-2xl bg-fundo-input border border-borda-sutil flex items-center justify-center mx-auto mb-4 text-texto-terciario">
        {icone || <Inbox className="w-7 h-7" />}
      </div>
      <h3 className="text-lg font-bold font-titulo text-texto-principal mb-1">
        {titulo}
      </h3>
      <p className="text-sm text-texto-secundario max-w-sm mx-auto mb-6">
        {descricao}
      </p>
      {acao && <div className="flex justify-center">{acao}</div>}
    </Cartao>
  );
}
