import { describe, expect, it } from 'vitest';
import { clampToZero, percentOfCents, sumCents } from './money.js';

describe('sumCents', () => {
  it('soma em centavos', () => {
    expect(sumCents([180000, 180000, 24000])).toBe(384000);
  });

  it('devolve zero para lista vazia', () => {
    expect(sumCents([])).toBe(0);
  });
});

describe('percentOfCents', () => {
  it('calcula percentual redondo', () => {
    expect(percentOfCents(180000, 10)).toBe(18000);
    expect(percentOfCents(24000, 15)).toBe(3600);
  });

  // O arredondamento fica no desconto, nunca no total (§7.2): mexer no total
  // mudaria o valor que o cliente já aprovou no resumo.
  it('arredonda a fração de centavo do desconto', () => {
    expect(percentOfCents(333, 50)).toBe(167);
    expect(percentOfCents(12345, 10)).toBe(1235);
    expect(percentOfCents(1, 50)).toBe(1);
    expect(percentOfCents(1, 49)).toBe(0);
  });

  it('devolve o valor inteiro em 100% e zero em valor zerado', () => {
    expect(percentOfCents(45900, 100)).toBe(45900);
    expect(percentOfCents(0, 30)).toBe(0);
  });

  it('nunca devolve fração de centavo', () => {
    for (let percent = 1; percent <= 100; percent += 1) {
      expect(Number.isInteger(percentOfCents(9_999, percent))).toBe(true);
    }
  });
});

describe('clampToZero', () => {
  it('zera desconto negativo', () => {
    // Combo de preço fechado acima da soma dos itens não vira crédito (§9.6).
    expect(clampToZero(-500)).toBe(0);
  });

  it('preserva valor positivo e zero', () => {
    expect(clampToZero(4000)).toBe(4000);
    expect(clampToZero(0)).toBe(0);
  });
});
