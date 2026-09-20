import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayOfWeek,
  daysBetweenInclusive,
  eachDay,
  parseISODate,
  toISODate,
  todayInSaoPaulo,
} from './dates.js';

describe('parseISODate e toISODate', () => {
  it('faz ida e volta sem deslocar o dia', () => {
    expect(toISODate(parseISODate('2026-12-24'))).toBe('2026-12-24');
  });

  it('ancora o dia em meia-noite UTC', () => {
    // Se a data fosse montada no fuso local (UTC-3), o driver gravaria 23/12.
    expect(parseISODate('2026-12-24').toISOString()).toBe('2026-12-24T00:00:00.000Z');
  });

  it('recusa formato fora de AAAA-MM-DD', () => {
    expect(() => parseISODate('24/12/2026')).toThrow(/formato/);
    expect(() => parseISODate('2026-12-24T10:00:00Z')).toThrow(/formato/);
  });

  it('recusa dia que não existe no calendário', () => {
    // O JS "consertaria" estes para 01/05 e 01/03 em vez de reclamar.
    expect(() => parseISODate('2026-04-31')).toThrow(/inexistente/);
    expect(() => parseISODate('2027-02-29')).toThrow(/inexistente/);
  });

  it('aceita 29 de fevereiro em ano bissexto', () => {
    expect(toISODate(parseISODate('2028-02-29'))).toBe('2028-02-29');
  });
});

describe('todayInSaoPaulo', () => {
  // O caso que justifica a função: às 02:00 UTC o calendário do mundo já virou,
  // mas na chácara ainda é o dia anterior. Usar o dia em UTC liberaria para
  // reserva um dia que, para o cliente, já passou.
  it('usa o dia do fuso do negócio, não o de UTC', () => {
    expect(todayInSaoPaulo(new Date('2026-09-20T02:00:00.000Z'))).toBe('2026-09-19');
    expect(todayInSaoPaulo(new Date('2026-09-20T03:00:00.000Z'))).toBe('2026-09-20');
  });

  it('devolve o dia com zero à esquerda', () => {
    expect(todayInSaoPaulo(new Date('2026-01-05T15:00:00.000Z'))).toBe('2026-01-05');
  });

  it('vira o ano corretamente', () => {
    expect(todayInSaoPaulo(new Date('2027-01-01T02:00:00.000Z'))).toBe('2026-12-31');
  });
});

describe('addDays', () => {
  it('soma dias atravessando o mês', () => {
    expect(addDays('2026-01-30', 3)).toBe('2026-02-02');
  });

  it('soma dias atravessando o ano', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('subtrai com valor negativo', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('devolve o mesmo dia ao somar zero', () => {
    expect(addDays('2026-09-20', 0)).toBe('2026-09-20');
  });
});

describe('dayOfWeek', () => {
  // Convenção de PriceRule.dayOfWeek: 0 é domingo, 6 é sábado.
  it('usa domingo como zero', () => {
    expect(dayOfWeek('2026-09-20')).toBe(0);
    expect(dayOfWeek('2026-09-19')).toBe(6);
    expect(dayOfWeek('2026-09-21')).toBe(1);
  });
});

describe('daysBetweenInclusive', () => {
  it('conta um dia quando entrada e saída são iguais', () => {
    expect(daysBetweenInclusive('2026-12-05', '2026-12-05')).toBe(1);
  });

  it('conta as duas pontas', () => {
    expect(daysBetweenInclusive('2026-12-05', '2026-12-06')).toBe(2);
    expect(daysBetweenInclusive('2026-12-05', '2026-12-07')).toBe(3);
  });

  it('recusa intervalo invertido', () => {
    expect(() => daysBetweenInclusive('2026-12-07', '2026-12-05')).toThrow(/invertido/);
  });
});

describe('eachDay', () => {
  it('inclui as duas pontas', () => {
    expect(eachDay('2026-12-05', '2026-12-07')).toEqual(['2026-12-05', '2026-12-06', '2026-12-07']);
  });

  it('devolve um único dia quando as pontas são iguais', () => {
    expect(eachDay('2026-12-05', '2026-12-05')).toEqual(['2026-12-05']);
  });

  it('atravessa a virada de mês', () => {
    expect(eachDay('2026-01-30', '2026-02-02')).toEqual([
      '2026-01-30',
      '2026-01-31',
      '2026-02-01',
      '2026-02-02',
    ]);
  });

  it('atravessa a virada de ano', () => {
    expect(eachDay('2026-12-30', '2027-01-02')).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
  });

  it('inclui 29 de fevereiro em ano bissexto', () => {
    expect(eachDay('2028-02-28', '2028-03-01')).toEqual(['2028-02-28', '2028-02-29', '2028-03-01']);
  });

  it('cobre um mês inteiro com a quantidade certa de dias', () => {
    expect(eachDay('2026-02-01', '2026-02-28')).toHaveLength(28);
    expect(eachDay('2026-01-01', '2026-12-31')).toHaveLength(365);
  });
});
