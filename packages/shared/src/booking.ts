import { z } from 'zod';
import { optionalText } from './catalog.js';
import { dailyPriceSchema } from './pricing.js';
import { appliedComboSchema, quoteItemsSchema, quoteLineSchema } from './quote.js';
import { bookingStatusSchema, centsSchema, eventTypeSchema, isoDateSchema } from './schemas.js';

/**
 * Contrato da reserva (§11.3).
 *
 * A reserva guarda o **snapshot** do que foi contratado (§2.1): preço de cada
 * dia, preço de cada item e os combos aplicados. Mudar o catálogo depois nunca
 * altera uma reserva existente, então a resposta repete esses números em vez de
 * apontar para o catálogo.
 *
 * `adminNotes` não aparece aqui de propósito: é nota interna (§13) e não sai para
 * o cliente.
 */

export const createBookingBodySchema = z
  .object({
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    eventType: eventTypeSchema,
    guestCount: z
      .number({ error: 'Informe quantas pessoas são esperadas.' })
      .int({ error: 'Informe um número inteiro de convidados.' })
      .min(1, { error: 'Informe pelo menos um convidado.' })
      .max(2000, { error: 'Confira o número de convidados.' }),
    items: quoteItemsSchema.default([]),
    customerNotes: optionalText(600).default(null),
    /**
     * Total que o cliente viu na tela (§9.7).
     *
     * Obrigatório: é o que permite a API recusar com `PRICE_CHANGED` quando o
     * valor mudou entre o orçamento e o envio, em vez de cobrar em silêncio um
     * número que a pessoa nunca aprovou.
     */
    expectedTotalCents: centsSchema,
  })
  .refine(({ startDate, endDate }) => startDate <= endDate, {
    error: 'A data de saída não pode ser anterior à de entrada.',
    path: ['endDate'],
  });

export const bookingSchema = z.object({
  id: z.string(),
  startDate: isoDateSchema,
  /** Inclusivo: `startDate === endDate` é uma reserva de um dia (§7.3). */
  endDate: isoDateSchema,
  eventType: eventTypeSchema,
  guestCount: z.number().int(),
  status: bookingStatusSchema,
  /** Até quando o pedido segura as datas. Nulo fora de `PENDING` (§9.2). */
  holdExpiresAt: z.string().nullable(),

  /**
   * O cliente pode cancelar agora, pelo site (§9.2).
   *
   * Vem do servidor em vez de ser deduzido na tela por um motivo concreto: o
   * prazo depende de "hoje" no fuso do negócio, e o relógio do navegador pode
   * estar em outro fuso ou simplesmente errado. Quem decide é a mesma função que
   * recusa o cancelamento, então o botão e a recusa nunca discordam.
   */
  canCancel: z.boolean(),
  /**
   * Último dia em que ainda dá para cancelar pelo site.
   *
   * Nulo quando não se aplica: pedido `PENDING` pode ser cancelado a qualquer
   * momento, e reserva cancelada ou concluída não tem mais prazo. A §13.3 pede
   * que a tela explique o prazo quando o botão não aparece.
   */
  cancelUntil: isoDateSchema.nullable(),

  days: z.array(dailyPriceSchema),
  dailyTotalCents: centsSchema,
  items: z.array(quoteLineSchema),
  itemsTotalCents: centsSchema,
  combos: z.array(appliedComboSchema),
  discountTotalCents: centsSchema,
  totalCents: centsSchema,

  customerNotes: z.string().nullable(),
  cancelReason: z.string().nullable(),
  createdAt: z.string(),
});

/**
 * Cancelamento pelo cliente (§11.2).
 *
 * O motivo é opcional: obrigar a justificar atrapalha quem só quer desistir, e o
 * dono costuma descobrir o porquê pelo WhatsApp de qualquer forma. Quando vem, é
 * repassado no e-mail de cancelamento (§17).
 */
export const cancelBookingBodySchema = z.object({
  reason: optionalText(300).default(null),
});

export type CreateBookingBody = z.infer<typeof createBookingBodySchema>;
export type CancelBookingBody = z.infer<typeof cancelBookingBodySchema>;
export type Booking = z.infer<typeof bookingSchema>;

/** Motivo gravado quando o prazo do pedido vence (§9.2, §9.9). */
export const HOLD_EXPIRED_REASON = 'HOLD_EXPIRED';
