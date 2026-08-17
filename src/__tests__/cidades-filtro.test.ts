import { describe, it, expect } from 'vitest';
import {
  formatarCidadeEstado,
  normalizarListaCidades,
  matchFiltroCidade,
  extrairNomeCidade,
  capitalizarNomeCidade,
} from '../lib/utilitarios';

describe('Padronização e Desduplicação de Cidades no Filtro de Pesquisa', () => {
  describe('capitalizarNomeCidade', () => {
    it('deve capitalizar corretamente nomes de cidades simples e compostos', () => {
      expect(capitalizarNomeCidade('palmas')).toBe('Palmas');
      expect(capitalizarNomeCidade('araguaína')).toBe('Araguaína');
      expect(capitalizarNomeCidade('paraíso do tocantins')).toBe('Paraíso do Tocantins');
      expect(capitalizarNomeCidade('porto nacional')).toBe('Porto Nacional');
      expect(capitalizarNomeCidade('RIO DE JANEIRO')).toBe('Rio de Janeiro');
      expect(capitalizarNomeCidade('')).toBe('');
    });
  });

  describe('extrairNomeCidade', () => {
    it('deve extrair somente o nome da cidade removendo sufixos de UF', () => {
      expect(extrairNomeCidade('Palmas - TO')).toBe('Palmas');
      expect(extrairNomeCidade('Palmas, TO')).toBe('Palmas');
      expect(extrairNomeCidade('palmas/to')).toBe('Palmas');
      expect(extrairNomeCidade('Palmas')).toBe('Palmas');
      expect(extrairNomeCidade('Araguaína - TO')).toBe('Araguaína');
      expect(extrairNomeCidade('')).toBe('');
    });
  });

  describe('formatarCidadeEstado', () => {
    it('deve sempre incluir o estado no formato "Cidade - UF"', () => {
      expect(formatarCidadeEstado('Palmas')).toBe('Palmas - TO');
      expect(formatarCidadeEstado('Palmas', 'TO')).toBe('Palmas - TO');
      expect(formatarCidadeEstado('Palmas - TO')).toBe('Palmas - TO');
      expect(formatarCidadeEstado('palmas - to')).toBe('Palmas - TO');
      expect(formatarCidadeEstado('Palmas, TO')).toBe('Palmas - TO');
      expect(formatarCidadeEstado('Palmas/TO')).toBe('Palmas - TO');
      expect(formatarCidadeEstado('Araguaína')).toBe('Araguaína - TO');
      expect(formatarCidadeEstado('São Paulo', 'SP')).toBe('São Paulo - SP');
      expect(formatarCidadeEstado('Brasília - DF')).toBe('Brasília - DF');
    });

    it('deve retornar vazio quando cidade for vazia ou nula', () => {
      expect(formatarCidadeEstado('')).toBe('');
      expect(formatarCidadeEstado(null)).toBe('');
      expect(formatarCidadeEstado(undefined)).toBe('');
      expect(formatarCidadeEstado('   ')).toBe('');
    });
  });

  describe('normalizarListaCidades', () => {
    it('deve unificar opções duplicadas deixando SOMENTE a opção com estado', () => {
      const entrada = ['Palmas', 'Palmas - TO'];
      const resultado = normalizarListaCidades(entrada);

      expect(resultado).toHaveLength(1);
      expect(resultado).toEqual(['Palmas - TO']);
    });

    it('deve unificar variações de maiúsculas/minúsculas e acentos em apenas 1 opção com estado', () => {
      const entrada = ['palmas', 'Palmas - TO', 'PALMAS - TO', 'Palmas'];
      const resultado = normalizarListaCidades(entrada);

      expect(resultado).toEqual(['Palmas - TO']);
    });

    it('deve desduplicar múltiplas cidades e ordenar alfabeticamente', () => {
      const entrada = [
        'Palmas',
        'Araguaína - TO',
        'Gurupi',
        'Palmas - TO',
        'Araguaína',
        'Gurupi - TO',
        'Porto Nacional',
      ];
      const resultado = normalizarListaCidades(entrada);

      expect(resultado).toEqual([
        'Araguaína - TO',
        'Gurupi - TO',
        'Palmas - TO',
        'Porto Nacional - TO',
      ]);
    });

    it('deve aceitar objetos misturados com strings (ex: dados vindos do Supabase)', () => {
      const entrada = [
        { cidade: 'Palmas', estado: 'TO' },
        'Palmas - TO',
        { cidade: 'Araguaína', estado: 'TO' },
        'Araguaína',
      ];
      const resultado = normalizarListaCidades(entrada);

      expect(resultado).toEqual(['Araguaína - TO', 'Palmas - TO']);
    });

    it('deve ignorar entradas nulas, vazias ou indefinidas', () => {
      const entrada = ['', null, undefined, '   ', 'Palmas - TO', null];
      const resultado = normalizarListaCidades(entrada as any);

      expect(resultado).toEqual(['Palmas - TO']);
    });
  });

  describe('matchFiltroCidade', () => {
    it('deve casar filtro com estado ("Palmas - TO") com registro legado sem estado ("Palmas")', () => {
      expect(matchFiltroCidade('Palmas', 'Palmas - TO')).toBe(true);
      expect(matchFiltroCidade('palmas', 'Palmas - TO')).toBe(true);
      expect(matchFiltroCidade('Palmas - TO', 'Palmas - TO')).toBe(true);
    });

    it('deve casar filtro sem estado com registro com estado', () => {
      expect(matchFiltroCidade('Palmas - TO', 'Palmas')).toBe(true);
    });

    it('deve ser insensível a acentos e maiúsculas/minúsculas', () => {
      expect(matchFiltroCidade('Araguaina', 'Araguaína - TO')).toBe(true);
      expect(matchFiltroCidade('ARAGUAÍNA - TO', 'araguaína - to')).toBe(true);
    });

    it('não deve casar cidades diferentes', () => {
      expect(matchFiltroCidade('Gurupi - TO', 'Palmas - TO')).toBe(false);
      expect(matchFiltroCidade('Araguaína', 'Palmas - TO')).toBe(false);
    });

    it('deve casar quando filtro for vazio ou "todas"', () => {
      expect(matchFiltroCidade('Palmas - TO', '')).toBe(true);
      expect(matchFiltroCidade('Palmas - TO', 'todas')).toBe(true);
      expect(matchFiltroCidade('Palmas - TO', 'Todas as Cidades')).toBe(true);
      expect(matchFiltroCidade('Palmas - TO', null)).toBe(true);
      expect(matchFiltroCidade('Palmas - TO', undefined)).toBe(true);
    });

    it('deve retornar false quando objeto for vazio e houver filtro ativo', () => {
      expect(matchFiltroCidade('', 'Palmas - TO')).toBe(false);
      expect(matchFiltroCidade(null, 'Palmas - TO')).toBe(false);
      expect(matchFiltroCidade(undefined, 'Palmas - TO')).toBe(false);
    });
  });
});
