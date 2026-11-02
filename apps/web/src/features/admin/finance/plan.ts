import type { ISODate } from '@chacara/shared';

/**
 * Contas do editor de plano de pagamento (§9.11).
 *
 * São sugestão, não regra: o editor usa estas funções para preencher as
 * parcelas quando o dono escolhe em quantas vezes dividir, e ele pode mudar
 * qualquer valor ou data depois. Quem decide se o plano vale é a API, que
 * confere a soma contra o total da reserva.
 */

export type InstallmentDraft = { dueDate: ISODate; amountCents: number };

/**
 * Divide os centavos em partes iguais, com a sobra na primeira.
 *
 * R$ 1.000,00 em três vira 333,34 + 333,33 + 333,33: a soma bate sempre, e o
 * centavo que sobra fica na parcela que vence primeiro. Total negativo (sinal
 * maior que a reserva) vira zero, e o editor avisa que o sinal passou do total.
 */
export function splitCents(totalCents: number, parts: number): number[] {
  if (parts <= 0) return [];

  const total = Math.max(0, totalCents);
  const base = Math.floor(total / parts);
  const remainder = total - base * parts;

  return Array.from({ length: parts }, (_, index) => (index === 0 ? base + remainder : base));
}

/**
 * O mesmo dia, alguns meses depois.
 *
 * Mês curto fica com o último dia dele: 31/01 mais um mês é 28/02, e não 03/03,
 * que é o que o `Date` faria sozinho.
 */
export function addMonths(date: ISODate, months: number): ISODate {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];

  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  // Dia 0 do mês seguinte é o último do mês de destino.
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));

  return target.toISOString().slice(0, 10);
}

/**
 * Parcelas mensais a partir do primeiro vencimento, em partes iguais.
 *
 * Cada data é contada a partir da primeira, e não da parcela anterior:
 * começando em 31/01, as seguintes são 28/02 e 31/03. Somar mês a mês deixaria
 * o dia 28 grudado no resto do plano.
 */
export function monthlyInstallments(
  totalCents: number,
  count: number,
  firstDueDate: ISODate,
): InstallmentDraft[] {
  return splitCents(totalCents, count).map((amountCents, index) => ({
    dueDate: addMonths(firstDueDate, index),
    amountCents,
  }));
}

/** Primeiro vencimento sugerido: o dia da festa, ou hoje se ela já passou. */
export function defaultFirstDueDate(startDate: ISODate, today: ISODate): ISODate {
  return startDate >= today ? startDate : today;
}
