import type { AdminFinance, PaymentPlan, SavePaymentPlanBody } from '@chacara/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';

/**
 * Plano de pagamento e financeiro do painel (§9.11, §11.2).
 *
 * Sem `staleTime`, como o resto do painel: quem abre o financeiro está
 * conferindo o que cobrar, e um recebimento anotado agora precisa aparecer.
 */

const keys = {
  plan: (bookingId: string) => ['admin', 'booking-payments', bookingId] as const,
  finance: ['admin', 'finance'] as const,
};

export function usePaymentPlan(bookingId: string) {
  return useQuery({
    queryKey: keys.plan(bookingId),
    queryFn: () => apiFetch<PaymentPlan>(`/admin/bookings/${bookingId}/payments`, { auth: true }),
  });
}

export function useAdminFinance(month: string) {
  return useQuery({
    queryKey: [...keys.finance, month],
    queryFn: () => apiFetch<AdminFinance>(`/admin/finance?month=${month}`, { auth: true }),
  });
}

/**
 * Mudanças no plano.
 *
 * A resposta é o plano atualizado, então ele entra direto no cache do cartão da
 * reserva. O financeiro é invalidado inteiro, e não só o mês aberto: mudar uma
 * parcela de data tira o valor de um mês e põe em outro, e a lista de atrasados
 * vale para todos.
 */
function usePlanMutation<TVariables>(mutationFn: (variables: TVariables) => Promise<PaymentPlan>) {
  const client = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: (plan) => {
      client.setQueryData(keys.plan(plan.bookingId), plan);
      void client.invalidateQueries({ queryKey: keys.finance });
    },
  });
}

export function useSavePaymentPlan() {
  return usePlanMutation(({ bookingId, body }: { bookingId: string; body: SavePaymentPlanBody }) =>
    apiFetch<PaymentPlan>(`/admin/bookings/${bookingId}/payments`, {
      method: 'PUT',
      body,
      auth: true,
    }),
  );
}

/** `paidOn` com o dia registra o recebimento; `null` desfaz. */
export function useMarkPayment() {
  return usePlanMutation(({ paymentId, paidOn }: { paymentId: string; paidOn: string | null }) =>
    apiFetch<PaymentPlan>(`/admin/payments/${paymentId}`, {
      method: 'PATCH',
      body: { paidOn },
      auth: true,
    }),
  );
}

export function useDeletePaymentPlan() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (bookingId: string) =>
      apiFetch<void>(`/admin/bookings/${bookingId}/payments`, { method: 'DELETE', auth: true }),
    onSuccess: (_result, bookingId) => {
      void client.invalidateQueries({ queryKey: keys.plan(bookingId) });
      void client.invalidateQueries({ queryKey: keys.finance });
    },
  });
}
