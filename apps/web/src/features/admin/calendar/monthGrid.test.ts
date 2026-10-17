import { describe, expect, it } from 'vitest';
import { WEEKDAY_LABELS, formatMonth, monthGrid, monthOf, shiftMonth } from './monthGrid';

describe('monthGrid', () => {
  it('devolve semanas de sete células', () => {
    for (const week of monthGrid('2026-11')) {
      expect(week).toHaveLength(7);
    }
  });

  /* 01/11/2026 é domingo, então novembro começa na primeira coluna. */
  it('alinha o dia 1 na coluna do dia da semana', () => {
    const [first] = monthGrid('2026-11');

    expect(first?.[0]).toBe('2026-11-01');
  });

  /* 01/12/2026 é terça, então as duas primeiras colunas ficam vazias. */
  it('preenche com vazio o que vem antes do dia 1', () => {
    const [first] = monthGrid('2026-12');

    expect(first?.slice(0, 3)).toEqual([null, null, '2026-12-01']);
  });

  it('completa a última semana com vazio', () => {
    const weeks = monthGrid('2026-11');
    const last = weeks.at(-1);

    expect(last).toHaveLength(7);
    expect(last?.at(-1)).toBeNull();
  });

  it('inclui todos os dias do mês, em ordem', () => {
    const days = monthGrid('2026-11').flat().filter(Boolean);

    expect(days).toHaveLength(30);
    expect(days[0]).toBe('2026-11-01');
    expect(days.at(-1)).toBe('2026-11-30');
  });

  it('acerta fevereiro em ano bissexto', () => {
    const days = monthGrid('2028-02').flat().filter(Boolean);

    expect(days).toHaveLength(29);
    expect(days.at(-1)).toBe('2028-02-29');
  });

  it('acerta fevereiro em ano comum', () => {
    expect(monthGrid('2027-02').flat().filter(Boolean)).toHaveLength(28);
  });

  it('não repete nem perde dia em nenhum mês do ano', () => {
    for (let month = 1; month <= 12; month += 1) {
      const key = `2027-${String(month).padStart(2, '0')}`;
      const days = monthGrid(key).flat().filter(Boolean);

      expect(new Set(days).size).toBe(days.length);
      expect(days.every((day) => day?.startsWith(key))).toBe(true);
    }
  });

  it('tem um rótulo por coluna', () => {
    expect(WEEKDAY_LABELS).toHaveLength(7);
  });
});

describe('shiftMonth', () => {
  it('anda para frente e para trás', () => {
    expect(shiftMonth('2026-11', 1)).toBe('2026-12');
    expect(shiftMonth('2026-11', -1)).toBe('2026-10');
  });

  it('atravessa a virada de ano nas duas direções', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2027-01', -1)).toBe('2026-12');
  });

  it('anda vários meses de uma vez', () => {
    expect(shiftMonth('2026-11', 14)).toBe('2028-01');
    expect(shiftMonth('2026-11', -11)).toBe('2025-12');
  });
});

describe('monthOf e formatMonth', () => {
  it('extrai o mês de um dia', () => {
    expect(monthOf('2026-11-20')).toBe('2026-11');
  });

  it('escreve o mês por extenso', () => {
    expect(formatMonth('2026-11')).toBe('novembro de 2026');
    expect(formatMonth('2027-01')).toBe('janeiro de 2027');
  });
});
