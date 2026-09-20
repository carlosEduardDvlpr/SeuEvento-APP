/**
 * Datas do negócio (§7.3).
 *
 * Dia de reserva é data sem fuso: trafega como 'YYYY-MM-DD' e vive em coluna
 * `date` no Postgres. Timestamp (createdAt, holdExpiresAt) é outra coisa —
 * instante em UTC — e não passa por aqui.
 *
 * A aritmética toda acontece sobre strings ISO ancoradas em meia-noite UTC.
 * Isso é de propósito: UTC não tem horário de verão, então somar 24 h sempre
 * cai no dia seguinte. Fazer a mesma conta no fuso local erraria na virada.
 *
 * Comparar dias não precisa de função: string ISO ordena lexicograficamente do
 * mesmo jeito que cronologicamente, então `a < b` já funciona.
 */

/** Dia do calendário no formato em que a API o expõe. */
export type ISODate = string;

/** Fuso do negócio. "Hoje" é sempre calculado aqui, não no fuso do servidor. */
export const BUSINESS_TIMEZONE = 'America/Sao_Paulo';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_IN_MS = 86_400_000;

/**
 * Converte 'YYYY-MM-DD' no Date que o driver grava em coluna `date`.
 *
 * A âncora em meia-noite UTC é obrigatória: montar a data no fuso local
 * (`new Date(2026, 11, 24)`) faria o driver gravar o dia anterior em qualquer
 * fuso negativo, e o do negócio é UTC-3.
 */
export function parseISODate(value: ISODate): Date {
  if (!ISO_DATE.test(value)) {
    throw new Error(`Data fora do formato YYYY-MM-DD: ${value}`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Data inexistente no calendário: ${value}`);
  }
  // Rejeita o que o JS "conserta" sozinho (31/04 vira 01/05).
  if (date.toISOString().slice(0, 10) !== value) {
    throw new Error(`Data inexistente no calendário: ${value}`);
  }
  return date;
}

/** Volta para 'YYYY-MM-DD'. Lê os componentes em UTC, nunca no fuso da máquina. */
export function toISODate(date: Date): ISODate {
  return date.toISOString().slice(0, 10);
}

const businessDayParts = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * O dia de hoje na chácara.
 *
 * Recebe o instante por parâmetro para poder ser testado sem mexer no relógio.
 * Monta a string a partir das partes formatadas em vez de confiar no formato de
 * algum locale, que pode variar entre ambientes.
 */
export function todayInSaoPaulo(now: Date = new Date()): ISODate {
  const parts = businessDayParts.formatToParts(now);
  const valueOf = (type: 'year' | 'month' | 'day') =>
    parts.find((part) => part.type === type)?.value;

  const year = valueOf('year');
  const month = valueOf('month');
  const day = valueOf('day');
  if (!year || !month || !day) {
    throw new Error('Não foi possível determinar a data no fuso do negócio.');
  }
  return `${year}-${month}-${day}`;
}

/** Soma (ou subtrai, com valor negativo) dias de calendário. */
export function addDays(date: ISODate, days: number): ISODate {
  return toISODate(new Date(parseISODate(date).getTime() + days * DAY_IN_MS));
}

/** Dia da semana, 0 (domingo) a 6 (sábado), na convenção de `PriceRule.dayOfWeek`. */
export function dayOfWeek(date: ISODate): number {
  return parseISODate(date).getUTCDay();
}

/**
 * Quantos dias o intervalo cobre, contando as duas pontas: de 05 a 06 são dois
 * dias, e de 05 a 05 é um. É este número que a §9.1 compara com minDays/maxDays.
 */
export function daysBetweenInclusive(start: ISODate, end: ISODate): number {
  const diff = parseISODate(end).getTime() - parseISODate(start).getTime();
  if (diff < 0) {
    throw new Error(`Intervalo invertido: ${start} vem depois de ${end}.`);
  }
  return diff / DAY_IN_MS + 1;
}

/**
 * Todos os dias do intervalo, inclusive as pontas.
 *
 * Quem chama com intervalo vindo do cliente precisa limitar o tamanho antes
 * (a rota de disponibilidade valida o período), senão um pedido de cem anos
 * viraria uma lista de 36 mil itens.
 */
export function eachDay(start: ISODate, end: ISODate): ISODate[] {
  const total = daysBetweenInclusive(start, end);
  const days: ISODate[] = [];
  for (let offset = 0; offset < total; offset += 1) {
    days.push(addDays(start, offset));
  }
  return days;
}
