import type {
  AdminBooking,
  AdminBookingsPage,
  AdminBookingsQuery,
  UpdateBookingNotesBody,
  UpdateBookingStatusBody,
} from '@chacara/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';

/**
 * Reservas no painel (§11.2, §12.2).
 *
 * Sem `staleTime`: o dono abre estas telas para decidir, e um pedido que entrou
 * agora precisa aparecer.
 */

const keys = {
  list: ['admin', 'bookings'] as const,
  one: (id: string) => ['admin', 'booking', id] as const,
};

/** Filtros da lista, já sem as chaves vazias que virariam `?status=`. */
export type BookingFilters = Partial<Pick<AdminBookingsQuery, 'status' | 'from' | 'to' | 'q'>> & {
  page?: number;
};

function toSearch(filters: BookingFilters): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `?${query}` : '';
}

export function useAdminBookings(filters: BookingFilters) {
  return useQuery({
    queryKey: [...keys.list, filters],
    queryFn: () =>
      apiFetch<AdminBookingsPage>(`/admin/bookings${toSearch(filters)}`, { auth: true }),
  });
}

export function useAdminBooking(id: string | null) {
  return useQuery({
    queryKey: keys.one(id ?? ''),
    queryFn: () => apiFetch<AdminBooking>(`/admin/bookings/${id}`, { auth: true }),
    enabled: id !== null,
  });
}

/**
 * Mudanças no detalhe.
 *
 * A resposta é a reserva atualizada, então ela entra direto no cache do detalhe:
 * sem isso a tela mostraria o estado antigo por um instante, logo depois de uma
 * ação que o dono precisa ver surtir efeito.
 *
 * A lista, o calendário e a visão geral são invalidados porque confirmar ou
 * cancelar muda o que aparece nos três. A disponibilidade pública também: a data
 * acabou de sair ou de voltar para o calendário do site.
 */
function useBookingMutation<TVariables>(
  mutationFn: (variables: TVariables) => Promise<AdminBooking>,
) {
  const client = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: (booking) => {
      client.setQueryData(keys.one(booking.id), booking);
      void client.invalidateQueries({ queryKey: keys.list });
      void client.invalidateQueries({ queryKey: ['admin', 'calendar'] });
      void client.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
      void client.invalidateQueries({ queryKey: ['availability'] });
    },
  });
}

export function useUpdateBookingStatus() {
  return useBookingMutation(({ id, body }: { id: string; body: UpdateBookingStatusBody }) =>
    apiFetch<AdminBooking>(`/admin/bookings/${id}/status`, { method: 'PATCH', body, auth: true }),
  );
}

export function useUpdateBookingNotes() {
  return useBookingMutation(({ id, body }: { id: string; body: UpdateBookingNotesBody }) =>
    apiFetch<AdminBooking>(`/admin/bookings/${id}/notes`, { method: 'PATCH', body, auth: true }),
  );
}
