import { useMemo } from 'react';
import type { DayStatus } from '@chacara/shared';
import { useAvailability } from '@/api/storefront';
import { addMonths, firstDayOfMonth, lastDayOfMonth } from './calendar-dates';

/**
 * Estado dos dias do período visível no calendário (§9.1, §13.2).
 *
 * O calendário precisa de duas coisas que a resposta da API não dá direto: um
 * jeito rápido de perguntar "este dia está livre?" e a lista de dias
 * indisponíveis **dentro** de um intervalo, para explicar qual dia atrapalha em
 * vez de só recusar a escolha.
 */

export type AvailableDays = {
  isLoading: boolean;
  error: unknown;
  statusOf: (isoDate: string) => DayStatus | undefined;
  /** Dias do intervalo que não estão livres, em ordem. */
  unavailableWithin: (startISO: string, endISO: string) => string[];
};

/**
 * Carrega dois meses de uma vez: o visível e o seguinte.
 *
 * O calendário mostra dois meses no desktop, e quem está escolhendo data de festa
 * costuma avançar um mês por vez. Pedir mês a mês deixaria a troca piscando
 * "carregando" a cada clique na seta.
 */
export function useAvailableDays(visibleMonth: Date): AvailableDays {
  const from = firstDayOfMonth(visibleMonth);
  const to = lastDayOfMonth(addMonths(visibleMonth, 1));

  const { data, isPending, error } = useAvailability({ from, to });

  const byDate = useMemo(() => {
    const map = new Map<string, DayStatus>();
    for (const day of data?.days ?? []) map.set(day.date, day.status);
    return map;
  }, [data]);

  return useMemo(
    () => ({
      isLoading: isPending,
      error,
      statusOf: (isoDate) => byDate.get(isoDate),

      unavailableWithin: (startISO, endISO) => {
        const blocked: string[] = [];

        for (const [date, status] of byDate) {
          if (date >= startISO && date <= endISO && status !== 'free') blocked.push(date);
        }

        return blocked.sort();
      },
    }),
    [byDate, isPending, error],
  );
}
