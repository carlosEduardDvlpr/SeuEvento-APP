import { z } from 'zod';
import { optionalImageUrlSchema, optionalText } from './catalog.js';
import { centsSchema, discountTypeSchema, isoDateSchema } from './schemas.js';

/**
 * Contratos de combos e regras de preço (§9.4, §9.6, §11.2).
 *
 * Dinheiro sempre sai calculado pelo servidor: o combo viaja com a soma dos
 * itens, a economia e o que o cliente paga. O front só formata (§2.2) — se cada
 * ponta calculasse, o cliente poderia ver uma economia e pagar outra.
 */

const idSchema = z.uuid({ error: 'Identificador inválido.' });

// ---------------------------------------------------------------------------
// Combos
// ---------------------------------------------------------------------------

const comboNameSchema = z
  .string()
  .trim()
  .min(2, { error: 'Dê um nome ao combo.' })
  .max(120, { error: 'O nome pode ter no máximo 120 caracteres.' });

/** Item do combo, com o preço já resolvido para a prévia da economia (§13). */
export const comboLineSchema = z.object({
  itemId: z.string(),
  name: z.string(),
  quantity: z.number().int(),
  unitPriceCents: centsSchema,
  totalCents: centsSchema,
});

export const adminComboLineSchema = comboLineSchema.extend({
  /** Item desativado impede o combo de ser levado; o painel precisa avisar. */
  active: z.boolean(),
});

const comboTotals = {
  /** Soma dos itens pelo preço de tabela. */
  itemsTotalCents: centsSchema,
  /** Economia do cliente ao levar o combo junto. */
  discountCents: centsSchema,
  /** O que o cliente paga levando o combo. */
  priceCents: centsSchema,
};

export const comboSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  themeId: z.string().nullable(),
  discountType: discountTypeSchema,
  discountValue: z.number().int(),
  items: z.array(comboLineSchema),
  ...comboTotals,
});

export const adminComboSchema = comboSchema.extend({
  items: z.array(adminComboLineSchema),
  active: z.boolean(),
  /**
   * Falso quando algum item do combo está desativado. A vitrine esconde o combo
   * nesse caso, porque oferecer o que não pode ser montado gera pedido recusado.
   */
  available: z.boolean(),
});

const comboItemInputSchema = z.object({
  itemId: idSchema,
  quantity: z
    .number()
    .int({ error: 'A quantidade deve ser um número inteiro.' })
    .min(1, { error: 'A quantidade mínima é 1.' })
    .max(99, { error: 'A quantidade máxima é 99.' }),
});

/**
 * Combo precisa de **pelo menos um** item.
 *
 * Combo vazio caberia em qualquer pedido e distribuiria desconto para sempre; o
 * `applyCombos` o ignora, e recusar na entrada evita o registro inútil.
 */
const comboItemsSchema = z
  .array(comboItemInputSchema)
  .min(1, { error: 'Escolha ao menos um item para o combo.' })
  .max(30, { error: 'Um combo pode ter no máximo 30 itens.' })
  .refine((items) => new Set(items.map((item) => item.itemId)).size === items.length, {
    error: 'Cada item aparece uma vez, com a quantidade na mesma linha.',
  });

/**
 * `PERCENT` vai de 1 a 100; `FIXED_PRICE` é o valor fechado em centavos.
 *
 * Os dois moram na mesma coluna (`discountValue`), então o limite depende do
 * tipo e não cabe no schema do campo isolado.
 */
function withDiscountRule<T extends z.ZodType<{ discountType?: unknown; discountValue?: unknown }>>(
  schema: T,
) {
  return schema.refine(
    (value) =>
      value.discountType !== 'PERCENT' ||
      (typeof value.discountValue === 'number' &&
        value.discountValue >= 1 &&
        value.discountValue <= 100),
    { error: 'O desconto em porcentagem vai de 1 a 100.', path: ['discountValue'] },
  );
}

export const createComboBodySchema = withDiscountRule(
  z.object({
    name: comboNameSchema,
    description: optionalText(600).default(null),
    imageUrl: optionalImageUrlSchema.default(null),
    themeId: idSchema.nullable().default(null),
    discountType: discountTypeSchema,
    discountValue: centsSchema,
    items: comboItemsSchema,
    active: z.boolean().default(true),
  }),
);

export const updateComboBodySchema = withDiscountRule(
  z.object({
    name: comboNameSchema.optional(),
    description: optionalText(600).optional(),
    imageUrl: optionalImageUrlSchema.optional(),
    themeId: idSchema.nullable().optional(),
    discountType: discountTypeSchema.optional(),
    discountValue: centsSchema.optional(),
    items: comboItemsSchema.optional(),
    active: z.boolean().optional(),
  }),
);

export const combosQuerySchema = z.object({ themeId: idSchema.optional() });

export type ComboLine = z.infer<typeof comboLineSchema>;
export type Combo = z.infer<typeof comboSchema>;
export type AdminCombo = z.infer<typeof adminComboSchema>;
export type CreateComboBody = z.infer<typeof createComboBodySchema>;
export type UpdateComboBody = z.infer<typeof updateComboBodySchema>;
export type CombosQuery = z.infer<typeof combosQuerySchema>;

// ---------------------------------------------------------------------------
// Regras de preço da diária (§9.4)
// ---------------------------------------------------------------------------

const ruleNameSchema = z
  .string()
  .trim()
  .min(2, { error: 'Dê um nome à regra.' })
  .max(80, { error: 'O nome pode ter no máximo 80 caracteres.' });

/** 0 (domingo) a 6 (sábado), igual a `PriceRule.dayOfWeek`. Nulo vale todo dia. */
const dayOfWeekSchema = z
  .number()
  .int({ error: 'Escolha um dia da semana.' })
  .min(0, { error: 'Escolha um dia da semana.' })
  .max(6, { error: 'Escolha um dia da semana.' });

/** Prioridade decide quem vence quando duas regras pegam o mesmo dia (§9.4). */
const prioritySchema = z
  .number()
  .int({ error: 'A prioridade deve ser um número inteiro.' })
  .min(0, { error: 'A prioridade não pode ser negativa.' })
  .max(999, { error: 'A prioridade máxima é 999.' });

export const priceRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  dayOfWeek: z.number().int().nullable(),
  startDate: isoDateSchema.nullable(),
  endDate: isoDateSchema.nullable(),
  priceCents: centsSchema,
  priority: z.number().int(),
  active: z.boolean(),
});

/** Período aberto nas duas pontas é válido: é a regra que vale para sempre. */
function withPeriodRule<T extends z.ZodType<{ startDate?: unknown; endDate?: unknown }>>(
  schema: T,
) {
  return schema.refine(
    (value) =>
      typeof value.startDate !== 'string' ||
      typeof value.endDate !== 'string' ||
      value.startDate <= value.endDate,
    { error: 'O fim do período não pode ser antes do início.', path: ['endDate'] },
  );
}

export const createPriceRuleBodySchema = withPeriodRule(
  z.object({
    name: ruleNameSchema,
    dayOfWeek: dayOfWeekSchema.nullable().default(null),
    startDate: isoDateSchema.nullable().default(null),
    endDate: isoDateSchema.nullable().default(null),
    priceCents: centsSchema,
    priority: prioritySchema.default(0),
    active: z.boolean().default(true),
  }),
);

export const updatePriceRuleBodySchema = withPeriodRule(
  z.object({
    name: ruleNameSchema.optional(),
    dayOfWeek: dayOfWeekSchema.nullable().optional(),
    startDate: isoDateSchema.nullable().optional(),
    endDate: isoDateSchema.nullable().optional(),
    priceCents: centsSchema.optional(),
    priority: prioritySchema.optional(),
    active: z.boolean().optional(),
  }),
);

/**
 * Simulador de preço do painel (§13).
 *
 * Mostra o valor de cada dia do período e **qual regra venceu**, que é como o
 * dono entende por que um sábado custa diferente.
 */
export const simulatePriceQuerySchema = z
  .object({ from: isoDateSchema, to: isoDateSchema })
  .refine(({ from, to }) => from <= to, {
    error: 'A data final não pode ser anterior à inicial.',
    path: ['to'],
  });

export const dailyPriceSchema = z.object({
  date: isoDateSchema,
  priceCents: centsSchema,
  /** Nulo quando nenhuma regra pegou o dia e valeu a diária base. */
  ruleName: z.string().nullable(),
});

export const priceSimulationSchema = z.object({
  days: z.array(dailyPriceSchema),
  totalCents: centsSchema,
  /** Diária usada nos dias sem regra, para o painel explicar o resultado. */
  baseDailyPriceCents: centsSchema,
});

export type PriceRule = z.infer<typeof priceRuleSchema>;
export type CreatePriceRuleBody = z.infer<typeof createPriceRuleBodySchema>;
export type UpdatePriceRuleBody = z.infer<typeof updatePriceRuleBodySchema>;
export type SimulatePriceQuery = z.infer<typeof simulatePriceQuerySchema>;
export type DailyPrice = z.infer<typeof dailyPriceSchema>;
export type PriceSimulation = z.infer<typeof priceSimulationSchema>;

/** Teto do simulador: um trimestre cobre o planejamento e limita a resposta. */
export const SIMULATION_MAX_DAYS = 92;

/** Rótulos pt-BR de `PriceRule.dayOfWeek` (§16). */
export const DAY_OF_WEEK_LABELS = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
] as const;
