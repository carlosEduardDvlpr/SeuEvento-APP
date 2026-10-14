import { afterAll, describe, expect, it } from 'vitest';
import {
  addMonths,
  dayCount,
  firstDayOfMonth,
  lastDayOfMonth,
  toCalendarDate,
  toISODate,
} from './calendar-dates';

/**
 * Os casos rodam em três fusos: o do negócio (UTC-3), um positivo e um a oeste.
 *
 * É a única forma de provar a §7.3 aqui. Com o fuso da máquina, uma conversão
 * errada passa despercebida — o engano aparece justamente em fuso positivo, onde
 * a meia-noite local de um dia cai no dia anterior em UTC.
 */
const ORIGINAL_TZ = process.env.TZ;

const ZONES = ['America/Sao_Paulo', 'Asia/Tokyo', 'Pacific/Honolulu'] as const;

afterAll(() => {
  process.env.TZ = ORIGINAL_TZ;
});

describe.each(ZONES)('conversões de data no fuso %s', (zone) => {
  function inZone<T>(run: () => T): T {
    process.env.TZ = zone;
    try {
      return run();
    } finally {
      process.env.TZ = ORIGINAL_TZ;
    }
  }

  it('devolve o mesmo dia na ida e na volta', () => {
    const result = inZone(() => toISODate(toCalendarDate('2026-12-10')));

    expect(result).toBe('2026-12-10');
  });

  it('não desloca o dia na virada do mês', () => {
    const result = inZone(() =>
      ['2026-12-01', '2026-12-31'].map((iso) => toISODate(toCalendarDate(iso))),
    );

    expect(result).toEqual(['2026-12-01', '2026-12-31']);
  });

  it('não desloca o dia na virada do ano', () => {
    const result = inZone(() => toISODate(toCalendarDate('2027-01-01')));

    expect(result).toBe('2027-01-01');
  });

  it('aponta o primeiro e o último dia do mês do dia escolhido', () => {
    const { first, last } = inZone(() => {
      const day = toCalendarDate('2026-12-10');
      return { first: firstDayOfMonth(day), last: lastDayOfMonth(day) };
    });

    expect(first).toBe('2026-12-01');
    expect(last).toBe('2026-12-31');
  });

  it('acha o fim de fevereiro em ano bissexto', () => {
    const result = inZone(() => lastDayOfMonth(toCalendarDate('2028-02-03')));

    expect(result).toBe('2028-02-29');
  });

  it('avança de mês sem escorregar para o anterior', () => {
    const result = inZone(() => firstDayOfMonth(addMonths(toCalendarDate('2026-12-01'), 1)));

    expect(result).toBe('2027-01-01');
  });

  it('avança de dezembro para janeiro do ano seguinte', () => {
    const result = inZone(() => lastDayOfMonth(addMonths(toCalendarDate('2026-12-31'), 1)));

    expect(result).toBe('2027-01-31');
  });
});

describe('dayCount', () => {
  it('conta as duas pontas: de 05 a 06 são dois dias', () => {
    expect(dayCount('2026-12-05', '2026-12-06')).toBe(2);
  });

  it('conta um dia quando as pontas são iguais (§7.3)', () => {
    expect(dayCount('2026-12-05', '2026-12-05')).toBe(1);
  });

  it('atravessa a virada do mês', () => {
    expect(dayCount('2026-11-30', '2026-12-02')).toBe(3);
  });

  /*
   * O Brasil não tem mais horário de verão, mas a conta não pode depender disso:
   * entre duas meia-noites locais nesse dia há 23 ou 25 horas, o que daria 2,04
   * ou 1,96 dia se a conta usasse `Date` local.
   */
  it('não se perde num dia de troca de horário de verão', () => {
    process.env.TZ = 'Europe/Lisbon';
    try {
      expect(dayCount('2027-03-27', '2027-03-29')).toBe(3);
      expect(dayCount('2027-10-30', '2027-11-01')).toBe(3);
    } finally {
      process.env.TZ = ORIGINAL_TZ;
    }
  });
});
