import { useMemo } from 'react';
import type { BookingKind, DayStatus } from '@chacara/shared';
import { useAvailability } from '@/api/storefront';
import { addMonths, firstDayOfMonth, lastDayOfMonth } from './calendar-dates';

/**
 * Agenda que o calendário do wizard consulta (§9.1, §13.2).
 *
 * A agenda é a do produto do pedido (T32) e, quando a decoração já está
 * escolhida num pedido só de decoração, a **dessa** decoração (novembro de
 * 2026): o dia em que ela saiu para outra festa não é oferecido.
 */

export type AvailableDays = {
  isLoading: boolean;
  error: unknown;
  statusOf: (isoDate: string) => DayStatus | undefined;
};

/**
 * Estado dos dias do período visível no calendário.
 *
 * Carrega dois meses de uma vez: o visível e o seguinte. O calendário mostra
 * dois meses no desktop, e quem está escolhendo data de festa costuma avançar um
 * mês por vez. Pedir mês a mês deixaria a troca piscando "carregando" a cada
 * clique na seta.
 */
export function useAvailableDays(
  visibleMonth: Date,
  kind: BookingKind,
  itemId: string | null,
): AvailableDays {
  const from = firstDayOfMonth(visibleMonth);
  const to = lastDayOfMonth(addMonths(visibleMonth, 1));

  const { data, isPending, error } = useAvailability({ from, to }, kind, itemId);

  const byDate = useMemo(() => {
    const map = new Map<string, DayStatus>();
    for (const day of data?.days ?? []) map.set(day.date, day.status);
    return map;
  }, [data]);

  return useMemo(
    () => ({ isLoading: isPending, error, statusOf: (isoDate) => byDate.get(isoDate) }),
    [byDate, isPending, error],
  );
}

/**
 * Dias do período escolhido que não estão livres, em ordem.
 *
 * Pergunta a agenda **exatamente** desses dias, e não a dos meses na tela: o
 * `react-day-picker` não impede um intervalo que pule por cima de um dia
 * ocupado, e a pessoa pode ter levado o calendário para outro mês depois de
 * escolher. É esta lista que explica qual dia atrapalha e que segura o
 * "Continuar" (§13.2).
 */
export function useUnavailableInRange(
  range: { from: string; to: string } | null,
  kind: BookingKind,
  itemId: string | null,
): string[] {
  const { data } = useAvailability(range, kind, itemId);

  return useMemo(
    () =>
      (data?.days ?? [])
        .filter((day) => day.status !== 'free')
        .map((day) => day.date)
        .sort(),
    [data],
  );
}
