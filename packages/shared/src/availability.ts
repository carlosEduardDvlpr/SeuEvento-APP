import { z } from 'zod';
import { optionalText } from './catalog.js';
import { dayStatusSchema, isoDateSchema } from './schemas.js';

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

export const availabilityQuerySchema = z
  .object({ from: isoDateSchema, to: isoDateSchema })
  .refine(({ from, to }) => from <= to, {
    error: 'A data final não pode ser anterior à inicial.',
    path: ['to'],
  });

export const dayAvailabilitySchema = z.object({
  date: isoDateSchema,
  status: dayStatusSchema,
});

export const availabilitySchema = z.object({ days: z.array(dayAvailabilitySchema) });

export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;
export type DayAvailability = z.infer<typeof dayAvailabilitySchema>;
export type Availability = z.infer<typeof availabilitySchema>;

// ---------------------------------------------------------------------------
// Bloqueios (§11.2)
// ---------------------------------------------------------------------------

export const blockedDateSchema = z.object({
  date: isoDateSchema,
  reason: z.string().nullable(),
});

export const createBlockedDateBodySchema = z.object({
  date: isoDateSchema,
  reason: optionalText(200).default(null),
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
