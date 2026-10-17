import type { ISODate } from '@chacara/shared';
import { dayOfWeek, eachDay } from '@chacara/shared';

/**
 * Grade mensal do painel (§13.4).
 *
 * Trabalha sobre strings `YYYY-MM-DD` e não sobre `Date`, pelo mesmo motivo da
 * §7.3: dia de calendário não tem fuso, e montar a grade com `Date` local faria o
 * mês começar no dia errado para quem abre o painel de outro fuso.
 *
 * A semana começa no **domingo**, que é a convenção de calendário em pt-BR e a
 * mesma de `PriceRule.dayOfWeek` (0 = domingo).
 */

/** Célula vazia é `null`: completa a primeira e a última semana da grade. */
export type MonthCell = ISODate | null;

export const WEEKDAY_LABELS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;

/** Mês `YYYY-MM` em semanas de sete células. */
export function monthGrid(month: string): MonthCell[][] {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];

  const first = `${month}-01`;
  // Dia 0 do mês seguinte é o último do atual.
  const last = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);

  const cells: MonthCell[] = [
    // Vazias antes do dia 1, até alinhar com a coluna do dia da semana dele.
    ...Array.from<MonthCell>({ length: dayOfWeek(first) }).fill(null),
    ...eachDay(first, last),
  ];

  // Completa a última semana para a grade não ficar com linha curta.
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: MonthCell[][] = [];
  for (let start = 0; start < cells.length; start += 7) {
    weeks.push(cells.slice(start, start + 7));
  }

  return weeks;
}

/** Mês vizinho, em `YYYY-MM`. Aceita negativo para voltar. */
export function shiftMonth(month: string, months: number): string {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];

  // `Date.UTC` normaliza a virada de ano sozinho: mês 0 vira dezembro anterior.
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + months, 1));

  return shifted.toISOString().slice(0, 7);
}

/** Mês de hoje na chácara, em `YYYY-MM`. */
export function monthOf(isoDate: ISODate): string {
  return isoDate.slice(0, 7);
}

const monthName = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC',
  month: 'long',
  year: 'numeric',
});

/** "novembro de 2026", para o título da grade. */
export function formatMonth(month: string): string {
  return monthName.format(new Date(`${month}-01T00:00:00.000Z`));
}
