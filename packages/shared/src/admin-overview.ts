import { z } from 'zod';
import { dayStatusSchema, isoDateSchema } from './schemas.js';
import { bookingStatusSchema, centsSchema, eventTypeSchema } from './schemas.js';

/**
 * Calendário e visão geral do painel (§11.2, §13.4).
 *
 * As duas telas respondem a perguntas diferentes sobre os mesmos dados. O
 * calendário pergunta "como está este mês"; a visão geral pergunta "o que precisa
 * da minha atenção agora". Por isso são duas rotas, e não uma lista de reservas
 * que cada tela filtra: a ocupação do mês e a contagem dos próximos dias são
 * agregações, e calculá-las no painel obrigaria a baixar tudo para contar (§2.1).
 *
 * Aqui o cliente **aparece**. A resposta pública de disponibilidade esconde quem
 * reservou (§2.3), mas o dono precisa do nome e do telefone para falar com a
 * pessoa — é o que a §13.4 pede com o botão de WhatsApp.
 */

/** Mês do calendário, como a §11.2 o pede na query: `YYYY-MM`. */
export const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, { error: 'Informe o mês no formato AAAA-MM.' });

export const adminCalendarQuerySchema = z.object({ month: monthSchema });

/**
 * Cliente, do jeito que o painel precisa.
 *
 * E-mail e telefone podem ser nulos: cliente criado pelo dono para uma reserva de
 * WhatsApp tem só nome e telefone (§9.8), e o telefone em si é opcional no
 * cadastro próprio.
 */
export const adminCustomerSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
});

/**
 * Reserva resumida, como aparece em lista.
 *
 * É o mesmo resumo no calendário e na visão geral de propósito: as duas telas
 * mostram o mesmo cartão, e um segundo formato só criaria a chance de uma delas
 * esquecer um campo.
 */
export const adminBookingSummarySchema = z.object({
  id: z.string(),
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  status: bookingStatusSchema,
  eventType: eventTypeSchema,
  guestCount: z.number().int(),
  totalCents: centsSchema,
  /** Até quando o pedido segura as datas. Nulo fora de `PENDING` (§9.2). */
  holdExpiresAt: z.string().nullable(),
  /** Reserva lançada pelo painel, não pedida pelo site (§9.8). */
  createdByAdmin: z.boolean(),
  /** Quando o pedido chegou. Na lista, é por onde o dono encontra "o de ontem". */
  createdAt: z.string(),
  customer: adminCustomerSummarySchema,
});

/**
 * Um dia da grade.
 *
 * `bookingIds` em vez da reserva inteira: uma reserva de três dias apareceria três
 * vezes no payload, e a gaveta precisa justamente de "as reservas deste dia" — a
 * lista separada com os ids resolve as duas coisas sem repetição.
 */
export const adminCalendarDaySchema = z.object({
  date: isoDateSchema,
  status: dayStatusSchema,
  bookingIds: z.array(z.string()),
  /** Motivo do bloqueio, quando o dia está bloqueado. */
  blockReason: z.string().nullable(),
});

export const adminCalendarSchema = z.object({
  month: monthSchema,
  from: isoDateSchema,
  to: isoDateSchema,
  days: z.array(adminCalendarDaySchema),
  bookings: z.array(adminBookingSummarySchema),
});

/**
 * Ocupação de um mês.
 *
 * Conta **dias**, não reservas: é a pergunta que o dono faz ("quantos dias de
 * novembro já estão fechados?"). Bloqueio entra separado porque dia bloqueado não
 * é dia vendido, e somá-los inflaria a sensação de mês cheio.
 */
export const monthOccupancySchema = z.object({
  month: monthSchema,
  totalDays: z.number().int(),
  bookedDays: z.number().int(),
  blockedDays: z.number().int(),
  freeDays: z.number().int(),
  /** Dias reservados sobre o total, arredondado. */
  bookedPercent: z.number().int(),
});

export const adminDashboardSchema = z.object({
  /** Pedidos aguardando confirmação, do prazo mais curto para o mais longo. */
  pending: z.array(adminBookingSummarySchema),
  /** Reservas ativas que começam nos próximos 30 dias, em ordem de data. */
  upcoming: z.array(adminBookingSummarySchema),
  counts: z.object({
    pending: z.number().int(),
    next7: z.number().int(),
    next30: z.number().int(),
  }),
  occupancy: monthOccupancySchema,
});

export type AdminCalendarQuery = z.infer<typeof adminCalendarQuerySchema>;
export type AdminCustomerSummary = z.infer<typeof adminCustomerSummarySchema>;
export type AdminBookingSummary = z.infer<typeof adminBookingSummarySchema>;
export type AdminCalendarDay = z.infer<typeof adminCalendarDaySchema>;
export type AdminCalendar = z.infer<typeof adminCalendarSchema>;
export type MonthOccupancy = z.infer<typeof monthOccupancySchema>;
export type AdminDashboard = z.infer<typeof adminDashboardSchema>;
