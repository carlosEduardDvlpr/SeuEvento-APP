/**
 * Formatação para a borda da UI (§7.2 e §7.3).
 *
 * Dinheiro só vira texto aqui; o cálculo acontece no servidor e trafega em
 * centavos inteiros.
 */

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatBRL(cents: number): string {
  return brl.format(cents / 100);
}

/**
 * Dia de reserva ('YYYY-MM-DD') como Date para o Intl formatar.
 *
 * Ancorar em meia-noite UTC e formatar com `timeZone: 'UTC'` é obrigatório: sem
 * isso, o navegador em UTC-3 renderizaria 04/12 para a string '2026-12-05'.
 */
function fromISODate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

const shortDate = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', dateStyle: 'short' });

const longDate = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const weekdayAndDay = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** 05/12/2026 */
export function formatDateShort(isoDate: string): string {
  return shortDate.format(fromISODate(isoDate));
}

/** 5 de dezembro de 2026 */
export function formatDateLong(isoDate: string): string {
  return longDate.format(fromISODate(isoDate));
}

/** sábado, 5 de dezembro */
export function formatWeekdayAndDay(isoDate: string): string {
  return weekdayAndDay.format(fromISODate(isoDate));
}

/**
 * Intervalo de reserva em linguagem natural. Reserva de um dia não repete a
 * data, e intervalo no mesmo mês não repete o mês.
 */
export function formatDateRange(startISO: string, endISO: string): string {
  if (startISO === endISO) return formatDateLong(startISO);

  const start = fromISODate(startISO);
  const end = fromISODate(endISO);
  const sameMonth =
    start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth();

  if (sameMonth) {
    return `${start.getUTCDate()} a ${formatDateLong(endISO)}`;
  }
  return `${formatDateLong(startISO)} a ${formatDateLong(endISO)}`;
}
