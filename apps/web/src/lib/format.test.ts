import { describe, expect, it } from 'vitest';
import {
  formatBRL,
  formatDateLong,
  formatDateRange,
  formatDateShort,
  formatWeekdayAndDay,
} from './format';

/**
 * O `Intl` separa o símbolo da moeda com espaço não separável (U+00A0), e isso é
 * desejável: impede que "R$" quebre linha longe do valor. O teste precisa
 * comparar com o caractere de verdade.
 */
const NBSP = '\u00A0';

describe('formatBRL', () => {
  it('formata centavos em reais', () => {
    expect(formatBRL(180000)).toBe(`R$${NBSP}1.800,00`);
    expect(formatBRL(4500)).toBe(`R$${NBSP}45,00`);
    expect(formatBRL(0)).toBe(`R$${NBSP}0,00`);
  });

  it('mantém os centavos que não são redondos', () => {
    expect(formatBRL(12345)).toBe(`R$${NBSP}123,45`);
    expect(formatBRL(1)).toBe(`R$${NBSP}0,01`);
  });

  it('usa ponto para milhar e vírgula para centavo', () => {
    expect(formatBRL(123456789)).toBe(`R$${NBSP}1.234.567,89`);
  });
});

describe('formatação de dia de reserva', () => {
  // A armadilha da §7.3 no front: '2026-12-05' é meia-noite UTC, e formatar no
  // fuso do navegador (UTC-3) mostraria 04/12. Os formatadores fixam UTC.
  it('não desloca o dia por causa do fuso do navegador', () => {
    expect(formatDateShort('2026-12-05')).toBe('05/12/2026');
    expect(formatDateLong('2026-12-05')).toBe('5 de dezembro de 2026');
  });

  it('formata a virada de ano sem escorregar', () => {
    expect(formatDateShort('2027-01-01')).toBe('01/01/2027');
    expect(formatDateLong('2026-12-31')).toBe('31 de dezembro de 2026');
  });

  it('nomeia o dia da semana', () => {
    // 20/09/2026 é domingo.
    expect(formatWeekdayAndDay('2026-09-20')).toMatch(/^domingo/);
  });
});

describe('formatDateRange', () => {
  it('não repete a data numa reserva de um dia', () => {
    expect(formatDateRange('2026-12-05', '2026-12-05')).toBe('5 de dezembro de 2026');
  });

  it('não repete o mês quando o intervalo fica no mesmo mês', () => {
    expect(formatDateRange('2026-12-05', '2026-12-07')).toBe('5 a 7 de dezembro de 2026');
  });

  it('escreve os dois meses quando o intervalo atravessa', () => {
    expect(formatDateRange('2026-11-30', '2026-12-01')).toBe(
      '30 de novembro de 2026 a 1 de dezembro de 2026',
    );
  });
});
