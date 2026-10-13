import type { Quote, QuoteIssue, QuoteRequest } from '@chacara/shared';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { type ISODate, daysBetweenInclusive, eachDay } from '../../lib/dates.js';
import { AppError, fieldError } from '../../lib/errors.js';
import { findUnavailableDates } from '../availability/service.js';
import { findStockShortages } from '../items/stock.js';
import { type CartLine, type ComboDef, computeQuote } from './quote.js';
import { loadActivePriceRules } from './rules.js';

/**
 * Orçamento a partir do banco (§9.7).
 *
 * Esta função é a única ponte entre o Prisma e o `computeQuote` puro, e é ela que
 * `POST /pricing/quote` e `POST /bookings` compartilham. O cliente nunca paga um
 * valor que não viu porque os dois caminhos somam exatamente do mesmo jeito.
 *
 * Indisponibilidade **não** é erro aqui: volta em `issues` com 200, para o wizard
 * mostrar o problema sem perder o pedido que a pessoa montou (§11.3).
 */

type VenueLimits = {
  baseDailyPriceCents: number;
  minDays: number;
  maxDays: number;
};

async function loadVenueLimits(prisma: PrismaClient): Promise<VenueLimits> {
  const settings = await prisma.venueSettings.findUnique({
    where: { id: 1 },
    select: { baseDailyPriceCents: true, minDays: true, maxDays: true },
  });

  if (!settings) {
    // Banco sem a linha de configuração significa seed não executado.
    throw new AppError('INTERNAL', 500, 'Configuração da chácara não encontrada.');
  }

  return settings;
}

/**
 * Limite de dias é `VALIDATION_ERROR`, não `issue`.
 *
 * A interface recebe `minDays` e `maxDays` em `/public/venue` e não deveria ter
 * deixado a pessoa escolher fora da faixa; quando isso chega, o pedido está
 * malformado. `issues` fica reservado ao que muda enquanto a pessoa decide: a data
 * ser tomada e o item acabar.
 */
function assertDayCount(days: number, { minDays, maxDays }: VenueLimits): void {
  if (days < minDays) {
    throw fieldError(
      'endDate',
      minDays === 1
        ? 'Escolha ao menos um dia.'
        : `A reserva é de no mínimo ${minDays} dias seguidos.`,
    );
  }

  if (days > maxDays) {
    throw fieldError(
      'endDate',
      `A reserva é de no máximo ${maxDays} ${maxDays === 1 ? 'dia' : 'dias seguidos'}.`,
    );
  }
}

/**
 * Carrega os itens do pedido com o preço de agora.
 *
 * O preço vem do banco, nunca da requisição (§2.3). Item inexistente ou
 * desativado derruba a requisição: a vitrine não oferece item inativo, então isso
 * é aba velha ou pedido adulterado, e seguir com ele daria um orçamento por um
 * item que a chácara não aluga mais.
 */
async function loadCartLines(
  prisma: PrismaClient,
  items: QuoteRequest['items'],
): Promise<CartLine[]> {
  if (items.length === 0) return [];

  const rows = await prisma.item.findMany({
    where: { id: { in: items.map((item) => item.itemId) }, active: true },
    select: { id: true, name: true, priceCents: true },
  });

  const byId = new Map(rows.map((row) => [row.id, row]));

  return items.map((item) => {
    const row = byId.get(item.itemId);

    if (!row) {
      throw fieldError(
        'items',
        'Um dos itens escolhidos saiu do catálogo. Recarregue a página e monte o pedido de novo.',
      );
    }

    return {
      itemId: row.id,
      name: row.name,
      quantity: item.quantity,
      unitPriceCents: row.priceCents,
    };
  });
}

/**
 * Combos ativos, com a composição.
 *
 * Carrega todos, sem filtrar por estilo: o cliente pode montar um pedido que
 * atravessa estilos, e o desconto é do pedido, não da seleção de filtro. Combo que
 * contém item desativado simplesmente não encaixa, porque item desativado nunca
 * entra no carrinho.
 */
async function loadActiveCombos(prisma: PrismaClient): Promise<ComboDef[]> {
  const rows = await prisma.combo.findMany({
    where: { active: true },
    select: {
      id: true,
      name: true,
      discountType: true,
      discountValue: true,
      items: { select: { itemId: true, quantity: true } },
    },
  });

  return rows;
}

/** Problemas que dependem do estado do banco neste instante (§11.3). */
async function collectIssues(
  prisma: PrismaClient,
  { from, to, lines, now }: { from: ISODate; to: ISODate; lines: CartLine[]; now: Date },
): Promise<QuoteIssue[]> {
  const [dates, shortages] = await Promise.all([
    findUnavailableDates(prisma, { from, to, now }),
    findStockShortages(prisma, { from, to, lines, now }),
  ]);

  const issues: QuoteIssue[] = [];

  if (dates.length > 0) issues.push({ code: 'DATE_UNAVAILABLE', dates });

  for (const shortage of shortages) {
    issues.push({
      code: 'STOCK_INSUFFICIENT',
      itemId: shortage.itemId,
      available: shortage.available,
    });
  }

  return issues;
}

export async function quoteFromDatabase(
  prisma: PrismaClient,
  request: QuoteRequest,
  now: Date = new Date(),
): Promise<Quote> {
  const { startDate, endDate } = request;

  const limits = await loadVenueLimits(prisma);
  assertDayCount(daysBetweenInclusive(startDate, endDate), limits);

  const [lines, rules, combos] = await Promise.all([
    loadCartLines(prisma, request.items),
    loadActivePriceRules(prisma),
    loadActiveCombos(prisma),
  ]);

  const quote = computeQuote({
    days: eachDay(startDate, endDate),
    rules,
    baseDailyPriceCents: limits.baseDailyPriceCents,
    lines,
    combos,
  });

  const issues = await collectIssues(prisma, { from: startDate, to: endDate, lines, now });

  return {
    available: issues.length === 0,
    issues,
    days: quote.days,
    dailyTotalCents: quote.dailyTotalCents,
    lines: quote.lines,
    itemsTotalCents: quote.itemsTotalCents,
    combos: quote.combos,
    discountTotalCents: quote.discountTotalCents,
    totalCents: quote.totalCents,
  };
}
