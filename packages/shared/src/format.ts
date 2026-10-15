/**
 * Formatação em pt-BR (§7.2, §7.3).
 *
 * Mora no pacote compartilhado porque **o e-mail e a tela precisam formatar do
 * mesmo jeito**. A API renderiza e-mail transacional (§17) e o SPA renderiza a
 * interface; duas implementações cairiam na armadilha da §7.3, em que esquecer o
 * `timeZone: 'UTC'` faz a data '2026-12-05' aparecer como 04/12 em qualquer fuso
 * negativo — e o do negócio é UTC-3.
 *
 * Cálculo não entra aqui: dinheiro trafega em centavos inteiros e vira texto só
 * nesta borda.
 */

import { BUSINESS_TIMEZONE } from './dates.js';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Centavos como `R$ 1.800,00`. */
export function formatBRL(cents: number): string {
  return brl.format(cents / 100);
}

/**
 * Dia de reserva ('YYYY-MM-DD') como Date para o Intl formatar.
 *
 * A âncora em meia-noite UTC e o `timeZone: 'UTC'` dos formatadores andam
 * juntos: sem os dois, o navegador em UTC-3 renderizaria o dia anterior.
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

/*
 * Um prazo (`holdExpiresAt`) é um instante, não um dia: trafega em UTC e precisa
 * aparecer na hora da chácara. Formatar no fuso do navegador diria 18h para quem
 * está em São Paulo e 23h para quem abriu o e-mail em Lisboa — sobre o **mesmo**
 * prazo, o que faria a pessoa achar que tem cinco horas a mais.
 */
const deadline = new Intl.DateTimeFormat('pt-BR', {
  timeZone: BUSINESS_TIMEZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
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
 * Prazo em linguagem natural, no horário da chácara (§13.2).
 *
 * "sexta-feira, 16 de outubro às 15:30". O dia da semana entra de propósito: quem
 * lê "16 de outubro" sozinho precisa consultar o calendário para saber se ainda
 * dá tempo.
 *
 * O `Intl` em pt-BR já junta data e hora com "às", então não há pós-processamento
 * aqui — remontar as partes à mão só criaria uma frase diferente a cada versão do
 * ICU.
 */
export function formatDeadline(isoTimestamp: string): string {
  return deadline.format(new Date(isoTimestamp));
}

/*
 * `numeric: 'always'` de propósito. Com `'auto'`, o Intl troca "em 2 dias" por
 * "depois de amanhã" e "em 1 dia" por "amanhã" — simpático numa agenda, ruim num
 * prazo: "depois de amanhã" não diz se restam 25 ou 47 horas, que é exatamente a
 * conta que a pessoa precisa fazer.
 */
const relative = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'always' });

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Quanto falta para um instante, em linguagem natural: "em 2 dias", "em 5 horas".
 *
 * A §13.3 pede a contagem de quando as datas deixam de ficar seguras. A unidade
 * acompanha a ordem de grandeza porque "em 2.880 minutos" não ajuda ninguém a
 * decidir se dá tempo de ligar para a chácara.
 *
 * Arredonda **para baixo**, sempre. Um prazo que falta 1 h 50 min vira "em 1
 * hora": prometer duas seria dar à pessoa um tempo que ela não tem. Já passou,
 * devolve a forma no passado ("há 3 horas"), e quem chama decide o texto.
 */
export function formatTimeUntil(isoTimestamp: string, now: Date = new Date()): string {
  const diff = new Date(isoTimestamp).getTime() - now.getTime();
  const sign = diff < 0 ? -1 : 1;
  const size = Math.abs(diff);

  if (size >= DAY) return relative.format(sign * Math.floor(size / DAY), 'day');
  if (size >= HOUR) return relative.format(sign * Math.floor(size / HOUR), 'hour');

  return relative.format(sign * Math.floor(size / MINUTE), 'minute');
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
