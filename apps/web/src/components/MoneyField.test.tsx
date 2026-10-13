import { describe, expect, it } from 'vitest';
import { toCents, toReais } from './MoneyField';

/**
 * A conversão entre reais e centavos é o ponto onde um erro de arredondamento
 * viraria preço errado no catálogo, então ela é testada sozinha.
 */
describe('MoneyField', () => {
  it('converte reais digitados em centavos inteiros', () => {
    expect(toCents('1800')).toBe(180000);
    expect(toCents('1800.50')).toBe(180050);
    expect(toCents('0.07')).toBe(7);
  });

  /*
   * `19.99 * 100` dá 1998.9999999999998 em ponto flutuante. Sem `Math.round`, o
   * truncamento cobraria um centavo menos a cada item.
   */
  it('arredonda o que o ponto flutuante quebra', () => {
    expect(toCents('19.99')).toBe(1999);
    expect(toCents('2.07')).toBe(207);
    expect(toCents('8.29')).toBe(829);
  });

  /* Campo vazio é "não informado", não zero: zero é um preço válido. */
  it('trata campo vazio como ausente', () => {
    expect(toCents('')).toBeNull();
    expect(toCents('   ')).toBeNull();
    expect(toCents('abc')).toBeNull();
  });

  it('mostra centavos como reais com duas casas', () => {
    expect(toReais(180000)).toBe('1800.00');
    expect(toReais(7)).toBe('0.07');
    expect(toReais(null)).toBe('');
  });

  it('a ida e a volta preservam o valor', () => {
    for (const cents of [0, 1, 99, 1999, 180050, 350000]) {
      expect(toCents(toReais(cents))).toBe(cents);
    }
  });
});
