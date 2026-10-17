import type {
  AdminCalendar,
  AdminDashboard,
  BlockedDate,
  CreateBlockedDateBody,
} from '@chacara/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';

/**
 * Calendário e visão geral do painel (§11.2, §12.2).
 *
 * Sem `staleTime`: o dono abre estas telas para decidir o que responder, e um
 * pedido que entrou há dez segundos precisa aparecer. É o oposto do catálogo, que
 * muda raramente e ganha cache generoso.
 */

const adminKeys = {
  calendar: ['admin', 'calendar'] as const,
  dashboard: ['admin', 'dashboard'] as const,
};

export function useAdminCalendar(month: string) {
  return useQuery({
    queryKey: [...adminKeys.calendar, month],
    queryFn: () => apiFetch<AdminCalendar>(`/admin/calendar?month=${month}`, { auth: true }),
  });
}

export function useAdminDashboard() {
  return useQuery({
    queryKey: adminKeys.dashboard,
    queryFn: () => apiFetch<AdminDashboard>('/admin/dashboard', { auth: true }),
  });
}

/**
 * Bloquear e desbloquear dia (§11.2).
 *
 * As duas invalidam o calendário **e** a visão geral, porque bloqueio muda a
 * ocupação do mês. A disponibilidade pública também: o dia que o dono acabou de
 * fechar não pode continuar sendo oferecido no site.
 */
function useBlockedDateMutation<TVariables>(
  mutationFn: (variables: TVariables) => Promise<unknown>,
) {
  const client = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: adminKeys.calendar });
      void client.invalidateQueries({ queryKey: adminKeys.dashboard });
      void client.invalidateQueries({ queryKey: ['availability'] });
    },
  });
}

export function useBlockDate() {
  return useBlockedDateMutation((body: CreateBlockedDateBody) =>
    apiFetch<BlockedDate>('/admin/blocked-dates', { method: 'POST', body, auth: true }),
  );
}

export function useUnblockDate() {
  return useBlockedDateMutation((date: string) =>
    apiFetch<void>(`/admin/blocked-dates/${date}`, { method: 'DELETE', auth: true }),
  );
}
