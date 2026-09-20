import type { PublicVenue } from '@chacara/shared';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './client';

/**
 * Dados públicos da chácara.
 *
 * Mudam raramente e são iguais para todo mundo, então vale um `staleTime` longo:
 * a landing e o wizard leem o mesmo cache em vez de repetir a requisição.
 */
export function useVenue() {
  return useQuery({
    queryKey: ['venue'],
    queryFn: () => apiFetch<PublicVenue>('/public/venue'),
    staleTime: 5 * 60 * 1000,
  });
}
