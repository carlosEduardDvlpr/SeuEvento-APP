import { z } from 'zod';
import { createCustomerBodySchema } from './admin-customers.js';
import { adminBookingSummarySchema, adminCustomerSummarySchema } from './admin-overview.js';
import { guestCountSchema } from './booking.js';
import {
  DECORATION_NEEDS_ITEMS_ERROR,
  DECORATION_ONE_DAY_ERROR,
  VENUE_NEEDS_GUESTS_ERROR,
  hasGuestsWhenVenue,
  hasItemsWhenDecoration,
  isOneDayWhenDecoration,
} from './booking-kind.js';
import { optionalText } from './catalog.js';
import { dailyPriceSchema } from './pricing.js';
import { appliedComboSchema, quoteItemsSchema, quoteLineSchema } from './quote.js';
import {
  bookingKindSchema,
  bookingStatusSchema,
  centsSchema,
  isoDateSchema,
  roleSchema,
} from './schemas.js';

/**
 * Reservas no painel (§11.2, §13.4).
 *
 * O detalhe do admin não é o do cliente com um campo a mais: são públicos
 * diferentes. O cliente precisa saber se **ele** pode cancelar; o dono precisa
 * saber quais transições a §9.2 permite agora, além das notas internas e de quem
 * cancelou. Reaproveitar o schema do cliente traria `canCancel`, que para o dono
 * seria enganoso — ele cancela sempre.
 */

/**
 * Transições que o dono pode fazer a partir do estado atual (§9.2).
 *
 * Vem do servidor em vez de ser deduzido na tela pelo mesmo motivo do `canCancel`
 * da §13.3: a máquina de estados é regra de negócio, e uma segunda cópia no
 * painel divergiria em algum caso — com o sintoma sendo um botão que existe e não
 * funciona.
 */
export const adminBookingSchema = z.object({
  id: z.string(),
  kind: bookingKindSchema,
  startDate: isoDateSchema,
  /** Inclusivo: `startDate === endDate` é uma reserva de um dia (§7.3). */
  endDate: isoDateSchema,
  /** Nulo na reserva de decoração (T32). */
  guestCount: z.number().int().nullable(),
  status: bookingStatusSchema,
  holdExpiresAt: z.string().nullable(),

  days: z.array(dailyPriceSchema),
  dailyTotalCents: centsSchema,
  items: z.array(quoteLineSchema),
  itemsTotalCents: centsSchema,
  combos: z.array(appliedComboSchema),
  discountTotalCents: centsSchema,
  totalCents: centsSchema,

  customerNotes: z.string().nullable(),
  /** Nota interna do dono. Nunca sai para o cliente (§13.4). */
  adminNotes: z.string().nullable(),
  cancelReason: z.string().nullable(),
  /** Quem cancelou. Nulo quando foi o job de expiração (§9.9). */
  cancelledBy: roleSchema.nullable(),
  createdByAdmin: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),

  customer: adminCustomerSummarySchema,
  allowedTransitions: z.array(bookingStatusSchema),
});

/**
 * Filtros da lista (§11.2).
 *
 * `q` busca em nome, e-mail e telefone — os três jeitos de o dono lembrar de um
 * cliente. O período filtra por **sobreposição**, não pelo dia de início: quem
 * procura "a semana que vem" quer a festa de três dias que começou antes e
 * atravessa, e filtrar só pelo início a esconderia.
 */
export const adminBookingsQuerySchema = z.object({
  status: bookingStatusSchema.optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const adminBookingsPageSchema = z.object({
  items: z.array(adminBookingSummarySchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});

/**
 * Mudança de status pelo painel (§11.3).
 *
 * O motivo é **obrigatório** para cancelar: o cliente recebe esse texto no e-mail
 * (§17), e "cancelada" sem explicação é a pior notícia possível de receber. Nas
 * outras transições o motivo não se aplica.
 */
/**
 * Reserva lançada pelo painel (§9.8).
 *
 * É o corpo do cliente mais duas coisas: de **quem** é a reserva, e se ela já
 * nasce confirmada. O `expectedTotalCents` continua obrigatório — o dono também
 * vê o valor antes de salvar, e a §9.7 vale para ele igual.
 *
 * O cliente pode ser escolhido (`customerId`) ou criado na hora (`customer`), e
 * exatamente um dos dois: aceitar os dois deixaria ambíguo qual vale.
 */
export const createAdminBookingBodySchema = z
  .object({
    customerId: z.uuid({ error: 'Escolha um cliente.' }).optional(),
    customer: createCustomerBodySchema.optional(),
    kind: bookingKindSchema.default('VENUE'),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    guestCount: guestCountSchema,
    items: quoteItemsSchema.default([]),
    customerNotes: optionalText(600).default(null),
    adminNotes: optionalText(2000).default(null),
    expectedTotalCents: centsSchema,
    /** Reserva de algo já combinado nasce confirmada; o resto fica aguardando. */
    confirmed: z.boolean().default(true),
  })
  .refine((body) => (body.customerId === undefined) !== (body.customer === undefined), {
    error: 'Escolha um cliente da lista ou cadastre um novo.',
    path: ['customerId'],
  })
  .refine(({ startDate, endDate }) => startDate <= endDate, {
    error: 'A data de saída não pode ser anterior à de entrada.',
    path: ['endDate'],
  })
  // As mesmas regras de forma do pedido do cliente (T32): o painel não tem atalho.
  .refine(isOneDayWhenDecoration, { error: DECORATION_ONE_DAY_ERROR, path: ['endDate'] })
  .refine(hasItemsWhenDecoration, { error: DECORATION_NEEDS_ITEMS_ERROR, path: ['items'] })
  .refine(hasGuestsWhenVenue, { error: VENUE_NEEDS_GUESTS_ERROR, path: ['guestCount'] });

export const updateBookingStatusBodySchema = z
  .object({
    status: bookingStatusSchema,
    reason: optionalText(300).default(null),
  })
  .refine((body) => body.status !== 'CANCELLED' || (body.reason?.trim() ?? '') !== '', {
    error: 'Diga o motivo: o cliente recebe esta explicação por e-mail.',
    path: ['reason'],
  });

/** Nota interna. Texto vazio apaga a nota, em vez de guardar string em branco. */
export const updateBookingNotesBodySchema = z.object({
  adminNotes: optionalText(2000).default(null),
});

export type AdminBooking = z.infer<typeof adminBookingSchema>;
export type CreateAdminBookingBody = z.infer<typeof createAdminBookingBodySchema>;
export type AdminBookingsQuery = z.infer<typeof adminBookingsQuerySchema>;
export type AdminBookingsPage = z.infer<typeof adminBookingsPageSchema>;
export type UpdateBookingStatusBody = z.infer<typeof updateBookingStatusBodySchema>;
export type UpdateBookingNotesBody = z.infer<typeof updateBookingNotesBodySchema>;
