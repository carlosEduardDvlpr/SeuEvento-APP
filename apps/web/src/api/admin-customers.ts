import type {
  AdminCustomer,
  AdminCustomerDetail,
  AdminCustomersPage,
  CreateAdminBookingBody,
  AdminBooking,
  CreateCustomerBody,
  UpdateVenueSettingsBody,
  VenueSettings,
} from '@chacara/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';

/**
 * Clientes, reserva manual e configurações no painel (§11.2, §12.2).
 *
 * Os três moram juntos porque é um fluxo só na ponta do dono: ele cadastra quem
 * fechou por fora, lança a reserva e ajusta as regras da casa.
 */

const keys = {
  customers: ['admin', 'customers'] as const,
  customer: (id: string) => ['admin', 'customer', id] as const,
  settings: ['admin', 'settings'] as const,
};

export type CustomerFilters = { q?: string; page?: number };

function toSearch(filters: CustomerFilters): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `?${query}` : '';
}

export function useAdminCustomers(filters: CustomerFilters) {
  return useQuery({
    queryKey: [...keys.customers, filters],
    queryFn: () =>
      apiFetch<AdminCustomersPage>(`/admin/customers${toSearch(filters)}`, { auth: true }),
  });
}

export function useAdminCustomer(id: string | null) {
  return useQuery({
    queryKey: keys.customer(id ?? ''),
    queryFn: () => apiFetch<AdminCustomerDetail>(`/admin/customers/${id}`, { auth: true }),
    enabled: id !== null,
  });
}

export function useCreateCustomer() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateCustomerBody) =>
      apiFetch<AdminCustomer>('/admin/customers', { method: 'POST', body, auth: true }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.customers }),
  });
}

/**
 * Reserva lançada pelo painel (§9.8).
 *
 * Invalida muita coisa de propósito: a reserva entra na agenda, na visão geral, na
 * lista, no histórico do cliente e tira a data do site.
 */
export function useCreateManualBooking() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateAdminBookingBody) =>
      apiFetch<AdminBooking>('/admin/bookings', { method: 'POST', body, auth: true }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['admin', 'bookings'] });
      void client.invalidateQueries({ queryKey: ['admin', 'calendar'] });
      void client.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
      void client.invalidateQueries({ queryKey: keys.customers });
      void client.invalidateQueries({ queryKey: ['availability'] });
    },
  });
}

export function useVenueSettings() {
  return useQuery({
    queryKey: keys.settings,
    queryFn: () => apiFetch<VenueSettings>('/admin/settings', { auth: true }),
  });
}

/**
 * Salva as configurações.
 *
 * Invalida `['venue']` também: aquele cache alimenta a landing e o wizard, e o
 * dono precisa ver a mudança valendo sem recarregar a página.
 */
export function useUpdateVenueSettings() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: UpdateVenueSettingsBody) =>
      apiFetch<VenueSettings>('/admin/settings', { method: 'PUT', body, auth: true }),
    onSuccess: (settings) => {
      client.setQueryData(keys.settings, settings);
      void client.invalidateQueries({ queryKey: ['venue'] });
    },
  });
}
