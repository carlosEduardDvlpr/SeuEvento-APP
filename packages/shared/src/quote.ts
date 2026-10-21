import { z } from 'zod';
import {
  DECORATION_NEEDS_ITEMS_ERROR,
  DECORATION_ONE_DAY_ERROR,
  hasItemsWhenDecoration,
  isOneDayWhenDecoration,
} from './booking-kind.js';
import { dailyPriceSchema } from './pricing.js';
import { bookingKindSchema, centsSchema, isoDateSchema } from './schemas.js';

/**
 * Contrato de `POST /pricing/quote` (§11.3).
 *
 * O orçamento **não falha** quando a data está ocupada ou falta estoque: ele
 * responde 200 com `available: false` e a lista de `issues`. O wizard precisa
 * mostrar o problema sem perder o que a pessoa já montou — um erro aqui
 * esvaziaria a tela.
 *
 * O mesmo cálculo serve `POST /bookings` (§9.7), então estes schemas são a
 * fonte única: se o formato mudar, as duas rotas mudam juntas.
 */

const idSchema = z.uuid({ error: 'Identificador inválido.' });

/** Linha do carrinho: um item e quantas unidades. */
export const quoteItemSchema = z.object({
  itemId: idSchema,
  quantity: z
    .number()
    .int({ error: 'A quantidade deve ser um número inteiro.' })
    .min(1, { error: 'A quantidade mínima é 1.' })
    .max(99, { error: 'A quantidade máxima é 99.' }),
});

/**
 * Itens do pedido.
 *
 * Pode ser vazio: alugar só a chácara, sem decoração, é um pedido legítimo. Cada
 * item aparece uma vez, com a quantidade na linha — o seletor de quantidade do
 * wizard trabalha assim, e duas linhas do mesmo item deixariam ambíguo se é para
 * somar ou substituir.
 */
export const quoteItemsSchema = z
  .array(quoteItemSchema)
  .max(50, { error: 'São no máximo 50 itens por pedido.' })
  .refine((items) => new Set(items.map((item) => item.itemId)).size === items.length, {
    error: 'Cada item aparece uma vez, com a quantidade na mesma linha.',
  });

/**
 * Pedido de orçamento.
 *
 * `kind` tem padrão `VENUE` para quem pedia orçamento antes de existir a
 * reserva de decoração continuar recebendo o mesmo número (T32).
 */
export const quoteRequestSchema = z
  .object({
    kind: bookingKindSchema.default('VENUE'),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    items: quoteItemsSchema.default([]),
  })
  .refine(({ startDate, endDate }) => startDate <= endDate, {
    error: 'A data de saída não pode ser anterior à de entrada.',
    path: ['endDate'],
  })
  .refine(isOneDayWhenDecoration, { error: DECORATION_ONE_DAY_ERROR, path: ['endDate'] })
  .refine(hasItemsWhenDecoration, { error: DECORATION_NEEDS_ITEMS_ERROR, path: ['items'] });

/**
 * Problema que não impede o orçamento de ser calculado (§11.3).
 *
 * São exatamente os dois casos que mudam enquanto a pessoa monta o pedido: a data
 * ser tomada por outra reserva e o item acabar. Limite de dias e item fora do
 * catálogo não entram aqui — são `VALIDATION_ERROR`, porque a interface já conhece
 * esses limites e não deveria tê-los enviado.
 */
export const quoteIssueSchema = z.discriminatedUnion('code', [
  z.object({
    code: z.literal('DATE_UNAVAILABLE'),
    dates: z.array(isoDateSchema),
  }),
  z.object({
    code: z.literal('STOCK_INSUFFICIENT'),
    itemId: z.string(),
    /** Quantas unidades ainda cabem no pior dia do intervalo. */
    available: z.number().int(),
  }),
]);

export const quoteLineSchema = z.object({
  itemId: z.string(),
  name: z.string(),
  quantity: z.number().int(),
  unitPriceCents: centsSchema,
  totalCents: centsSchema,
});

export const appliedComboSchema = z.object({
  comboId: z.string(),
  name: z.string(),
  /** Quantas vezes o combo caberia no pedido. */
  times: z.number().int(),
  discountCents: centsSchema,
});

export const quoteSchema = z.object({
  /** Falso quando há qualquer `issue`. */
  available: z.boolean(),
  issues: z.array(quoteIssueSchema),
  days: z.array(dailyPriceSchema),
  dailyTotalCents: centsSchema,
  lines: z.array(quoteLineSchema),
  itemsTotalCents: centsSchema,
  combos: z.array(appliedComboSchema),
  discountTotalCents: centsSchema,
  totalCents: centsSchema,
});

export type QuoteItem = z.infer<typeof quoteItemSchema>;
export type QuoteRequest = z.infer<typeof quoteRequestSchema>;
export type QuoteIssue = z.infer<typeof quoteIssueSchema>;
export type QuoteLine = z.infer<typeof quoteLineSchema>;
export type AppliedCombo = z.infer<typeof appliedComboSchema>;
export type Quote = z.infer<typeof quoteSchema>;
