import {
  type CreatePriceRuleBody,
  type PriceRule,
  type PriceSimulation,
  SIMULATION_MAX_DAYS,
  type SimulatePriceQuery,
  type UpdatePriceRuleBody,
} from '@chacara/shared';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { PriceRuleModel } from '../../generated/prisma/models.js';
import {
  type ISODate,
  daysBetweenInclusive,
  eachDay,
  parseISODate,
  toISODate,
} from '../../lib/dates.js';
import { AppError } from '../../lib/errors.js';
import { sumCents } from '../../lib/money.js';
import { type PriceRuleDef, resolveDailyPrice } from './quote.js';

/**
 * Regras de variação da diária (§9.4) e o simulador do painel (§13).
 *
 * O cálculo em si mora no `quote.ts`, que é função pura. Este arquivo só traduz
 * entre o banco e aquele formato, para o simulador e o orçamento do cliente
 * nunca responderem valores diferentes para o mesmo dia.
 */

/** Ordem de leitura do painel: a regra que vence primeiro aparece primeiro. */
const RULE_ORDER = [{ priority: 'desc' as const }, { name: 'asc' as const }];

function toPriceRule(row: PriceRuleModel): PriceRule {
  return {
    id: row.id,
    name: row.name,
    dayOfWeek: row.dayOfWeek,
    // `@db.Date` chega como Date; o contrato trafega 'YYYY-MM-DD' (§7.3).
    startDate: row.startDate === null ? null : toISODate(row.startDate),
    endDate: row.endDate === null ? null : toISODate(row.endDate),
    priceCents: row.priceCents,
    priority: row.priority,
    active: row.active,
  };
}

/** O contrato trafega 'YYYY-MM-DD'; a coluna é `@db.Date` (§7.3). */
function toDateColumn(value: ISODate | null): Date | null {
  return value === null ? null : parseISODate(value);
}

function toCreateData(body: CreatePriceRuleBody) {
  return {
    name: body.name,
    dayOfWeek: body.dayOfWeek,
    startDate: toDateColumn(body.startDate),
    endDate: toDateColumn(body.endDate),
    priceCents: body.priceCents,
    priority: body.priority,
    active: body.active,
  };
}

/** `undefined` em campo de update é o jeito de o Prisma dizer "não mexer". */
function toUpdateData(body: UpdatePriceRuleBody) {
  return {
    ...body,
    startDate: body.startDate === undefined ? undefined : toDateColumn(body.startDate),
    endDate: body.endDate === undefined ? undefined : toDateColumn(body.endDate),
  };
}

export async function listPriceRules(prisma: PrismaClient): Promise<PriceRule[]> {
  const rows = await prisma.priceRule.findMany({ orderBy: RULE_ORDER });
  return rows.map(toPriceRule);
}

export async function createPriceRule(
  prisma: PrismaClient,
  body: CreatePriceRuleBody,
): Promise<PriceRule> {
  const row = await prisma.priceRule.create({ data: toCreateData(body) });
  return toPriceRule(row);
}

export async function updatePriceRule(
  prisma: PrismaClient,
  id: string,
  body: UpdatePriceRuleBody,
): Promise<PriceRule> {
  await findRuleOrThrow(prisma, id);

  const row = await prisma.priceRule.update({ where: { id }, data: toUpdateData(body) });
  return toPriceRule(row);
}

/**
 * Regra de preço é apagada de verdade.
 *
 * Diferente de item, combo e estilo (§11.2), ela não é referenciada por reserva
 * nenhuma: o `dailyBreakdown` guarda o **nome** da regra que venceu, não o id,
 * então o histórico continua explicável depois da exclusão. Quem quer parar de
 * usar sem perder o registro desativa (`active = false`).
 */
export async function deletePriceRule(prisma: PrismaClient, id: string): Promise<void> {
  await findRuleOrThrow(prisma, id);
  await prisma.priceRule.delete({ where: { id } });
}

async function findRuleOrThrow(prisma: PrismaClient, id: string) {
  const row = await prisma.priceRule.findUnique({ where: { id } });

  if (!row) throw new AppError('NOT_FOUND', 404, 'Regra de preço não encontrada.');

  return row;
}

/** Só as regras ativas entram no cálculo, convertidas para o formato puro. */
export async function loadActivePriceRules(prisma: PrismaClient): Promise<PriceRuleDef[]> {
  const rows = await prisma.priceRule.findMany({ where: { active: true } });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    dayOfWeek: row.dayOfWeek,
    startDate: row.startDate === null ? null : toISODate(row.startDate),
    endDate: row.endDate === null ? null : toISODate(row.endDate),
    priceCents: row.priceCents,
    priority: row.priority,
  }));
}

export async function loadBaseDailyPrice(prisma: PrismaClient): Promise<number> {
  const settings = await prisma.venueSettings.findUnique({
    where: { id: 1 },
    select: { baseDailyPriceCents: true },
  });

  if (!settings) {
    // Banco sem a linha de configuração significa seed não executado.
    throw new AppError('INTERNAL', 500, 'Configuração da chácara não encontrada.');
  }

  return settings.baseDailyPriceCents;
}

/**
 * Simula o preço de um período, dia por dia (§13).
 *
 * Mostra qual regra venceu em cada dia, que é como o dono entende por que um
 * sábado custa diferente — e como ele descobre que criou duas regras em conflito.
 */
export async function simulatePrices(
  prisma: PrismaClient,
  { from, to }: SimulatePriceQuery,
): Promise<PriceSimulation> {
  const span = daysBetweenInclusive(from, to);

  if (span > SIMULATION_MAX_DAYS) {
    throw new AppError(
      'VALIDATION_ERROR',
      400,
      `Simule no máximo ${SIMULATION_MAX_DAYS} dias por vez.`,
      { maxDays: SIMULATION_MAX_DAYS, requestedDays: span },
    );
  }

  const [rules, baseDailyPriceCents] = await Promise.all([
    loadActivePriceRules(prisma),
    loadBaseDailyPrice(prisma),
  ]);

  const days = eachDay(from, to).map((date: ISODate) =>
    resolveDailyPrice(date, rules, baseDailyPriceCents),
  );

  return {
    days,
    totalCents: sumCents(days.map((day) => day.priceCents)),
    baseDailyPriceCents,
  };
}
