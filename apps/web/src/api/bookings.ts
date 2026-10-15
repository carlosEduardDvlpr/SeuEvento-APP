import type { Booking, CreateBookingBody, Quote, QuoteRequest } from '@chacara/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';

/**
 * Orçamento e reservas do cliente (§11.2, §11.3).
 *
 * O orçamento é público; criar, listar e cancelar exigem sessão. As duas coisas
 * moram no mesmo arquivo porque são o mesmo fluxo da ponta da pessoa: ela pede o
 * valor e então manda o pedido.
 */

const bookingKeys = {
  mine: ['bookings', 'me'] as const,
  one: (id: string) => ['bookings', id] as const,
  quote: ['quote'] as const,
};

/**
 * Valor do pedido (§9.7).
 *
 * É `useQuery` porque a rota não tem efeito: o resultado entra em cache por
 * composição de datas e itens, e desfazer uma escolha reaproveita o valor já
 * calculado em vez de pedir de novo.
 *
 * **O preço não pode ficar velho em silêncio**, então o `staleTime` é zero e a
 * query revalida ao voltar para a aba: a data pode ter sido tomada enquanto a
 * pessoa olhava outra coisa.
 *
 * `enabled` guarda o caso sem datas, que a API recusaria com 400.
 */
export function useQuote(request: QuoteRequest | null) {
  return useQuery({
    queryKey: [...bookingKeys.quote, request],
    queryFn: () =>
      apiFetch<Quote>('/pricing/quote', { method: 'POST', body: request ?? undefined }),
    enabled: request !== null,
  });
}

/**
 * Envia o pedido de reserva.
 *
 * Nada de otimismo aqui, e a §13.2 é explícita: a reserva só é tratada como feita
 * depois do `201`. Quem decide se as datas estão livres é o banco, na transação.
 *
 * O cache de "minhas reservas" é invalidado no sucesso, e o do orçamento também:
 * as datas acabaram de ficar ocupadas, e um orçamento guardado para elas passou a
 * estar errado.
 */
export function useCreateBooking() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateBookingBody) =>
      apiFetch<Booking>('/bookings', { method: 'POST', body, auth: true }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: bookingKeys.mine });
      void client.invalidateQueries({ queryKey: bookingKeys.quote });
      void client.invalidateQueries({ queryKey: ['availability'] });
    },
  });
}

export function useMyBookings() {
  return useQuery({
    queryKey: bookingKeys.mine,
    queryFn: () => apiFetch<Booking[]>('/bookings/me', { auth: true }),
  });
}

export function useBooking(id: string | null) {
  return useQuery({
    queryKey: bookingKeys.one(id ?? ''),
    queryFn: () => apiFetch<Booking>(`/bookings/${id}`, { auth: true }),
    enabled: id !== null,
  });
}
