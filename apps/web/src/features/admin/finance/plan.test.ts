import { describe, expect, it } from 'vitest';
import { addMonths, defaultFirstDueDate, monthlyInstallments, splitCents } from './plan';

describe('splitCents', () => {
  it('divide em partes iguais quando a conta fecha', () => {
    expect(splitCents(90000, 3)).toEqual([30000, 30000, 30000]);
  });

  it('põe a sobra na primeira parte, e a soma bate com o total', () => {
    const parts = splitCents(100000, 3);

    expect(parts).toEqual([33334, 33333, 33333]);
    expect(parts.reduce((sum, part) => sum + part, 0)).toBe(100000);
  });

  it('uma parte é o valor inteiro, e nenhuma parte é lista vazia', () => {
    expect(splitCents(50000, 1)).toEqual([50000]);
    expect(splitCents(50000, 0)).toEqual([]);
  });

  it('não sugere parcela negativa quando o sinal passa do total', () => {
    expect(splitCents(-1000, 2)).toEqual([0, 0]);
  });
});

describe('addMonths', () => {
  it('mantém o dia do mês', () => {
    expect(addMonths('2026-11-15', 1)).toBe('2026-12-15');
  });

  it('vira o ano', () => {
    expect(addMonths('2026-11-15', 2)).toBe('2027-01-15');
  });

  it('fica no último dia quando o mês de destino é mais curto', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-03-31', 1)).toBe('2026-04-30');
  });
});

describe('monthlyInstallments', () => {
  it('conta cada vencimento a partir do primeiro, sem perder o dia 31', () => {
    expect(monthlyInstallments(30000, 3, '2026-01-31')).toEqual([
      { dueDate: '2026-01-31', amountCents: 10000 },
      { dueDate: '2026-02-28', amountCents: 10000 },
      { dueDate: '2026-03-31', amountCents: 10000 },
    ]);
  });
});

describe('defaultFirstDueDate', () => {
  it('sugere o dia da festa', () => {
    expect(defaultFirstDueDate('2026-12-05', '2026-11-15')).toBe('2026-12-05');
  });

  it('sugere hoje quando a festa já passou', () => {
    expect(defaultFirstDueDate('2026-10-05', '2026-11-15')).toBe('2026-11-15');
  });
});
