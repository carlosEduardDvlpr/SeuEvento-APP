import { z } from 'zod';
import { optionalText } from './catalog.js';
import { blockScopeSchema, bookingKindSchema, dayStatusSchema, isoDateSchema } from './schemas.js';

/**
 * Disponibilidade de datas (§9.1, §11.3) e bloqueios do admin.
 *
 * A resposta pública diz apenas **se** o dia está livre, nunca quem reservou
 * (§2.3): o calendário precisa de `free` / `booked` / `blocked` / `past`, e nada
 * além disso é informação do visitante.
 */

/**
 * Teto do período consultado.
 *
 * Quatro meses cobrem com folga qualquer calendário que a interface mostre de uma
 * vez. Sem teto, um pedido de cem anos viraria uma resposta de 36 mil linhas numa
 * rota pública e cacheável.
 */
export const AVAILABILITY_MAX_DAYS = 120;

/**
 * `kind` diz de qual produto é a agenda (T32).
 *
 * A chácara e a decoração têm agendas diferentes: a retirada de decoração não
 * ocupa a data da chácara, e o dono pode fechar um produto sem fechar o outro.
 * O padrão é `VENUE`, que é o que a rota respondia antes de existir decoração
 * sozinha.
 */
const isPeriodInOrder = ({ from, to }: { from: string; to: string }) => from <= to;
const PERIOD_ORDER_ERROR = 'A data final não pode ser anterior à inicial.';

/*
 * `itemId` pede a agenda **de uma decoração** (novembro de 2026): o dia em que
 * ela já saiu para outra festa, em todo o estoque, fica `booked`, e o dia em
 * que a decoração está fechada fica `blocked`. É o calendário de quem chegou à
 * reserva pelo cartão da decoração na landing. Sem `itemId`, a agenda é a do
 * produto, como antes.
 */
export const availabilityQuerySchema = z
  .object({
    from: isoDateSchema,
    to: isoDateSchema,
    kind: bookingKindSchema.default('VENUE'),
    itemId: z.uuid({ error: 'Identificador inválido.' }).optional(),
  })
  .refine(isPeriodInOrder, { error: PERIOD_ORDER_ERROR, path: ['to'] });

export const dayAvailabilitySchema = z.object({
  date: isoDateSchema,
  status: dayStatusSchema,
});

export const availabilitySchema = z.object({ days: z.array(dayAvailabilitySchema) });

/**
 * Quantas unidades de cada decoração estão livres no período (novembro de 2026).
 *
 * É o passo de decoração do pedido: quem já escolheu a data vê a decoração que
 * saiu para outra festa naquele dia, mas sem poder escolhê-la. O número é o do
 * pior dia do período, como na conta de estoque da §9.3, e zero onde a
 * decoração está fechada. Só decoração ativa entra.
 */
export const itemsAvailabilityQuerySchema = z
  .object({ from: isoDateSchema, to: isoDateSchema })
  .refine(isPeriodInOrder, { error: PERIOD_ORDER_ERROR, path: ['to'] });

export const itemAvailabilitySchema = z.object({
  itemId: z.string(),
  freeStock: z.number().int().min(0),
});

export const itemsAvailabilitySchema = z.object({ items: z.array(itemAvailabilitySchema) });

export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;
export type DayAvailability = z.infer<typeof dayAvailabilitySchema>;
export type Availability = z.infer<typeof availabilitySchema>;
export type ItemsAvailabilityQuery = z.infer<typeof itemsAvailabilityQuerySchema>;
export type ItemAvailability = z.infer<typeof itemAvailabilitySchema>;
export type ItemsAvailability = z.infer<typeof itemsAvailabilitySchema>;

// ---------------------------------------------------------------------------
// Bloqueios (§11.2)
// ---------------------------------------------------------------------------

export const blockedDateSchema = z.object({
  date: isoDateSchema,
  reason: z.string().nullable(),
  scope: blockScopeSchema,
});

/**
 * Bloqueio de um dia. Sem `scope`, fecha só a chácara: é o que bloquear
 * significava antes de a decoração sair sozinha (T32).
 */
export const createBlockedDateBodySchema = z.object({
  date: isoDateSchema,
  reason: optionalText(200).default(null),
  scope: blockScopeSchema.default('VENUE'),
});

/** O `:date` das rotas de bloqueio é um dia, não um identificador. */
export const blockedDateParamsSchema = z.object({ date: isoDateSchema });

export const blockedDatesQuerySchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

export type BlockedDate = z.infer<typeof blockedDateSchema>;
export type CreateBlockedDateBody = z.infer<typeof createBlockedDateBodySchema>;
export type BlockedDatesQuery = z.infer<typeof blockedDatesQuerySchema>;
