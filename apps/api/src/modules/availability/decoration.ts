import type { Availability, AvailabilityQuery, DayStatus } from '@chacara/shared';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { ISODate } from '../../lib/dates.js';
import { AppError } from '../../lib/errors.js';
import { freeStockPerDay } from '../items/stock.js';
import { assertAvailabilityPeriod, findBlockedDaysIn, getDayStatuses } from './service.js';

/**
 * Agenda de uma decoração (novembro de 2026).
 *
 * É o calendário de quem chegou à reserva pelo cartão de uma decoração na
 * landing: além da agenda do produto (a chácara, ou a saída de decoração), o dia
 * precisa dizer se **aquela** decoração está livre. Por cima da agenda do
 * produto entram duas regras:
 *
 * - Dia em que a decoração está fechada (bloqueio `DECORATION` ou `BOTH`) fica
 *   `blocked`, também na agenda da chácara: nenhum item sai naquele dia (§9.10),
 *   e a festa que conta com esta decoração não cabe nele.
 * - Dia em que todo o estoque dela já saiu para outra festa, por reserva de
 *   qualquer um dos dois produtos, fica `booked`. É a mesma palavra da data
 *   tomada porque, para quem escolheu a decoração, o efeito é o mesmo.
 *
 * A precedência da §9.1 continua valendo: bloqueio, depois ocupado, depois
 * antecedência. E nada aqui diz quem levou a decoração, só que ela não está
 * livre (§2.3).
 */
export async function getDecorationAvailability(
  prisma: PrismaClient,
  { from, to, kind, itemId }: Omit<AvailabilityQuery, 'itemId'> & { itemId: string },
  now: Date = new Date(),
): Promise<Availability> {
  assertAvailabilityPeriod(from, to);

  // Decoração desativada saiu da vitrine: não há calendário dela para mostrar.
  const item = await prisma.item.findFirst({
    where: { id: itemId, active: true },
    select: { id: true },
  });

  if (!item) throw new AppError('NOT_FOUND', 404, 'Não encontramos esta decoração.');

  const [agenda, free, closedDays] = await Promise.all([
    getDayStatuses(prisma, { from, to, now, kind }),
    freeStockPerDay(prisma, { itemIds: [itemId], from, to, now }),
    findBlockedDaysIn(prisma, from, to, 'DECORATION'),
  ]);

  const closed = new Set(closedDays);
  const freeOn = free.get(itemId);

  return { days: agenda.map(({ date, status }) => ({ date, status: statusOf(date, status) })) };

  function statusOf(date: ISODate, agendaStatus: DayStatus): DayStatus {
    if (agendaStatus === 'blocked' || closed.has(date)) return 'blocked';
    if (agendaStatus === 'booked' || (freeOn?.get(date) ?? 0) === 0) return 'booked';
    return agendaStatus;
  }
}
