import { describe, expect, it } from 'vitest';
import {
  formatBRL,
  formatDateLong,
  formatDateRange,
  formatDateShort,
  formatDeadline,
  formatTimeUntil,
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

describe('formatDeadline', () => {
  /*
   * O prazo é um instante, não um dia: `holdExpiresAt` chega em UTC e precisa
   * aparecer na hora da chácara (UTC-3). Formatar no fuso de quem lê diria 18h
   * para um e 23h para outro sobre o mesmo prazo.
   */
  it('mostra o prazo no horário da chácara, não no do navegador', () => {
    expect(formatDeadline('2026-10-16T18:30:00.000Z')).toBe('sexta-feira, 16 de outubro às 15:30');
  });

  it('não escorrega para o dia anterior num prazo de madrugada', () => {
    // 01:00 UTC do dia 17 ainda é 22:00 do dia 16 em São Paulo.
    expect(formatDeadline('2026-10-17T01:00:00.000Z')).toBe('sexta-feira, 16 de outubro às 22:00');
  });

  it('atravessa a virada do mês pelo fuso certo', () => {
    // 02:00 UTC de 1º de novembro é 23:00 de 31 de outubro em São Paulo.
    expect(formatDeadline('2026-11-01T02:00:00.000Z')).toBe('sábado, 31 de outubro às 23:00');
  });

  it('nomeia o dia da semana, para a pessoa não precisar do calendário', () => {
    expect(formatDeadline('2026-10-16T18:30:00.000Z')).toMatch(/^sexta-feira/);
  });
});

describe('formatTimeUntil', () => {
  const AGORA = new Date('2026-10-14T12:00:00.000Z');

  it('usa dias quando falta mais de um dia', () => {
    expect(formatTimeUntil('2026-10-16T15:00:00.000Z', AGORA)).toBe('em 2 dias');
  });

  it('usa horas abaixo de um dia', () => {
    expect(formatTimeUntil('2026-10-14T17:00:00.000Z', AGORA)).toBe('em 5 horas');
  });

  it('usa minutos abaixo de uma hora', () => {
    expect(formatTimeUntil('2026-10-14T12:40:00.000Z', AGORA)).toBe('em 40 minutos');
  });

  /*
   * Arredonda para baixo porque é prazo: dizer "em 2 horas" quando falta 1 h 50
   * daria à pessoa um tempo que ela não tem.
   */
  it('arredonda para baixo', () => {
    expect(formatTimeUntil('2026-10-14T13:50:00.000Z', AGORA)).toBe('em 1 hora');
    expect(formatTimeUntil('2026-10-16T11:00:00.000Z', AGORA)).toBe('em 1 dia');
  });

  /*
   * `numeric: 'always'`: com 'auto' o Intl diria "depois de amanhã", que não
   * responde se restam 25 ou 47 horas.
   */
  it('mantém a forma numérica em vez de "amanhã"', () => {
    expect(formatTimeUntil('2026-10-15T13:00:00.000Z', AGORA)).toBe('em 1 dia');
  });

  it('devolve a forma no passado quando o prazo já venceu', () => {
    expect(formatTimeUntil('2026-10-14T09:00:00.000Z', AGORA)).toBe('há 3 horas');
  });

  /*
   * O pt-BR usa singular para zero, e a janela em que isso aparece é de um
   * minuto. Não vale um caso especial: um prazo nesse estado já está vencendo, e
   * "em 0 minuto" diz exatamente isso.
   */
  it('trata o instante exato como zero minuto', () => {
    expect(formatTimeUntil('2026-10-14T12:00:00.000Z', AGORA)).toBe('em 0 minuto');
  });
});
