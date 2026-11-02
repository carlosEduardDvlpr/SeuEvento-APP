import { z } from 'zod';
import {
  adminBookingSummarySchema,
  adminCustomerSummarySchema,
  monthSchema,
} from './admin-overview.js';
import {
  bookingKindSchema,
  bookingStatusSchema,
  centsSchema,
  isoDateSchema,
  paymentKindSchema,
  paymentStatusSchema,
} from './schemas.js';

/**
 * Plano de pagamento e financeiro do painel (§9.11, §11.2, §13.4).
 *
 * É um controle do dono, não um pagamento online: o cliente paga por fora (Pix,
 * dinheiro) e o dono anota aqui o sinal, as parcelas e o que já recebeu. O site
 * nunca mostra nada disto ao cliente.
 *
 * O plano é salvo inteiro, como um documento: o painel manda o sinal e todas as
 * parcelas, e a API troca as linhas da reserva numa transação. Casar linha por
 * linha pelo id seria mais código para o mesmo resultado num formulário de no
 * máximo treze linhas.
 */

/** Parcelas de um plano, além do sinal. */
export const MAX_INSTALLMENTS = 12;

/** Um recebimento salvo, como a API devolve. */
export const adminPaymentSchema = z.object({
  id: z.string(),
  kind: paymentKindSchema,
  /** 0 no sinal; de 1 a 12 nas parcelas, na ordem de vencimento. */
  number: z.number().int(),
  dueDate: isoDateSchema,
  amountCents: centsSchema,
  /** Dia em que o dono recebeu. Nulo enquanto não recebeu. */
  paidOn: isoDateSchema.nullable(),
  /** Calculada pela API com o dia de hoje e o status da reserva. */
  status: paymentStatusSchema,
  /** "Sinal", "À vista", "Restante", "Parcela 2 de 3" (`paymentLabel`). */
  label: z.string(),
});

/**
 * O plano de uma reserva, com as somas que o cartão do detalhe mostra.
 *
 * `canEdit` e `canDelete` vêm do servidor pelo mesmo motivo do
 * `allowedTransitions`: são regra de negócio, e uma cópia na tela divergiria.
 */
export const paymentPlanSchema = z.object({
  bookingId: z.string(),
  /** Total contratado (snapshot da reserva). A soma do plano tem de bater com ele. */
  totalCents: centsSchema,
  /** Sinal primeiro, depois as parcelas pelo número. Vazio sem plano. */
  payments: z.array(adminPaymentSchema),
  /** Já recebido, inclusive numa reserva cancelada: o dinheiro entrou. */
  paidCents: centsSchema,
  /** A receber: zero na reserva cancelada, que deixou de ser cobrada. */
  pendingCents: centsSchema,
  /** A parte do que falta receber que já venceu. */
  overdueCents: centsSchema,
  /** Pode salvar um plano: falso na reserva cancelada. */
  canEdit: z.boolean(),
  /** Pode excluir: há plano e nada foi recebido. */
  canDelete: z.boolean(),
});

/** Valor de uma linha do plano: centavos, e nunca zero. */
const paymentAmountSchema = centsSchema.min(1, { error: 'O valor precisa ser maior que zero.' });

/** Uma linha do plano como o painel a envia. */
export const paymentDraftSchema = z.object({
  dueDate: isoDateSchema,
  amountCents: paymentAmountSchema,
  /** Dia do recebimento, se já recebeu. A API recusa dia no futuro. */
  paidOn: isoDateSchema.nullable().default(null),
});

/**
 * Plano inteiro, como o editor o salva (§9.11).
 *
 * A forma é validada aqui; o que depende da reserva (a soma bater com o total, a
 * reserva não estar cancelada) e do relógio (recebimento não ser no futuro) é a
 * API que confere. As parcelas podem vir em qualquer ordem: a API as numera pelo
 * vencimento.
 */
export const savePaymentPlanBodySchema = z
  .object({
    deposit: paymentDraftSchema.nullable().default(null),
    installments: z
      .array(paymentDraftSchema)
      .max(MAX_INSTALLMENTS, { error: `Divida em no máximo ${MAX_INSTALLMENTS} parcelas.` })
      .default([]),
  })
  .refine((body) => body.deposit !== null || body.installments.length > 0, {
    error: 'Informe o sinal ou pelo menos uma parcela.',
    path: ['installments'],
  });

/** Registra (`paidOn` com o dia) ou desfaz (`null`) um recebimento. */
export const markPaymentBodySchema = z.object({
  paidOn: isoDateSchema.nullable(),
});

export const adminFinanceQuerySchema = z.object({ month: monthSchema });

/** A reserva de onde vem o recebimento, como as listas do financeiro a mostram. */
export const financeBookingSchema = z.object({
  id: z.string(),
  kind: bookingKindSchema,
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  status: bookingStatusSchema,
  totalCents: centsSchema,
  customer: adminCustomerSummarySchema,
});

export const financePaymentSchema = adminPaymentSchema.extend({ booking: financeBookingSchema });

/**
 * Somas de um conjunto de recebimentos.
 *
 * `dueCents` é tudo o que vence no período, recebido ou não, e é sempre
 * `paidCents + pendingCents`.
 */
export const financeTotalsSchema = z.object({
  dueCents: centsSchema,
  paidCents: centsSchema,
  pendingCents: centsSchema,
});

/** Um dia da grade com vencimentos. Dia sem vencimento não aparece. */
export const financeDaySchema = financeTotalsSchema.extend({
  date: isoDateSchema,
  count: z.number().int(),
  /** Tem valor vencido e não recebido. */
  overdue: z.boolean(),
});

/**
 * O mês do financeiro.
 *
 * Os valores do mês contam pelo **vencimento**: a parcela de dezembro recebida
 * em novembro entra em dezembro. A parcela em aberto de reserva cancelada não
 * entra em nada; a que foi recebida continua contando, porque o dinheiro entrou.
 */
export const adminFinanceSchema = z.object({
  month: monthSchema,
  summary: financeTotalsSchema,
  /** Em ordem de data. */
  days: z.array(financeDaySchema),
  /** Os recebimentos que vencem no mês, por data de vencimento. */
  payments: z.array(financePaymentSchema),
  /** Vencido e não recebido, de qualquer mês, do mais antigo para o mais novo. */
  overdue: z.object({
    totalCents: centsSchema,
    payments: z.array(financePaymentSchema),
  }),
  /**
   * Reservas confirmadas ou concluídas que começam no mês, com valor a receber,
   * e sem nenhum recebimento anotado: é o que o dono ainda não registrou.
   */
  unplanned: z.array(adminBookingSummarySchema),
});

export type AdminPayment = z.infer<typeof adminPaymentSchema>;
export type PaymentPlan = z.infer<typeof paymentPlanSchema>;
export type PaymentDraft = z.infer<typeof paymentDraftSchema>;
export type SavePaymentPlanBody = z.infer<typeof savePaymentPlanBodySchema>;
export type MarkPaymentBody = z.infer<typeof markPaymentBodySchema>;
export type AdminFinanceQuery = z.infer<typeof adminFinanceQuerySchema>;
export type FinanceBooking = z.infer<typeof financeBookingSchema>;
export type FinancePayment = z.infer<typeof financePaymentSchema>;
export type FinanceTotals = z.infer<typeof financeTotalsSchema>;
export type FinanceDay = z.infer<typeof financeDaySchema>;
export type AdminFinance = z.infer<typeof adminFinanceSchema>;
