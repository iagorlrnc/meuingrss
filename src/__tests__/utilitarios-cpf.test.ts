import { describe, it, expect } from 'vitest';
import { mascararCPF } from '../lib/utilitarios';

describe('Mascaramento de CPF para Ingressos e Painel', () => {
  it('deve mascarar um CPF válido de 11 dígitos mantendo os dígitos centrais e ocultando os demais', () => {
    // Exemplo do usuário: ***.084.49*-**
    const cpfCru = '12308449567';
    expect(mascararCPF(cpfCru)).toBe('***.084.49*-**');
  });

  it('deve mascarar um CPF que já possui formatação prévia com pontos e traço', () => {
    const cpfFormatado = '123.084.495-67';
    expect(mascararCPF(cpfFormatado)).toBe('***.084.49*-**');
  });

  it('deve retornar string vazia para valores nulos, undefined ou vazios', () => {
    expect(mascararCPF(null)).toBe('');
    expect(mascararCPF(undefined)).toBe('');
    expect(mascararCPF('')).toBe('');
  });

  it('deve retornar o próprio valor se a quantidade de dígitos for diferente de 11', () => {
    expect(mascararCPF('12345')).toBe('12345');
  });
});
