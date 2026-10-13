import type { DayStatus } from '@chacara/shared';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { type ISODate, addDays, eachDay, parseISODate, toISODate } from '../../lib/dates.js';
import { todayInSaoPaulo } from '../../lib/dates.js';

/**
 * Disponibilidade de datas (§9.1).
 *
 * Um dia é `blocked`, `booked`, `past` ou `free`, nessa ordem de precedência. A
 * ordem é a da §9.1 e importa: um dia pode cair em mais de um caso, e é o
 * primeiro que a interface mostra.
 *
 * Nada aqui expõe quem reservou — a resposta pública diz apenas que o dia está
 * ocupado (§2.3).
 */

export type DayAvailability = { date: ISODate; status: DayStatus };

/**
 * Reservas que **ocupam** data (§9.1).
 *
 * `PENDING` com `holdExpiresAt` no passado não ocupa: a consulta já a ignora, em
 * vez de depender do job de expiração ter rodado. `holdExpiresAt` nulo numa
 * `PENDING` não deveria existir (§9.2 sempre o define), mas se existir conta como
 * ocupando — errar para o lado de segurar a data é melhor que errar para o lado
 * da dupla reserva.
 */
export function activeBookingsFilter(now: Date): Prisma.BookingWhereInput {
  return {
    OR: [
      { status: 'CONFIRMED' },
      {
        status: 'PENDING',
        OR: [{ holdExpiresAt: null }, { holdExpiresAt: { gt: now } }],
      },
    ],
  };
}

/** Reservas que cobrem algum dia do intervalo. Inclusivo nas duas pontas (§7.3). */
export function overlappingRangeFilter(from: ISODate, to: ISODate): Prisma.BookingWhereInput {
  return {
    startDate: { lte: parseISODate(to) },
    endDate: { gte: parseISODate(from) },
  };
}

/** Primeiro dia que ainda pode ser reservado: hoje + antecedência mínima (§9.1). */
export function firstBookableDay(minLeadDays: number, now: Date = new Date()): ISODate {
  return addDays(todayInSaoPaulo(now), minLeadDays);
}

async function loadMinLeadDays(prisma: PrismaClient): Promise<number> {
  const settings = await prisma.venueSettings.findUnique({
    where: { id: 1 },
    select: { minLeadDays: true },
  });

  // Sem a linha de configuração o seed não rodou; tratar como sem antecedência
  // liberaria datas que o negócio não aceita, então o padrão é o do schema.
  return settings?.minLeadDays ?? 2;
}

/**
 * Conjunto de dias tomados por reserva ativa ou bloqueio, no intervalo pedido.
 *
 * Uma consulta para reservas e uma para bloqueios, e a expansão dia a dia é feita
 * em memória: o intervalo é sempre curto (a rota limita o período), e deixar o
 * Postgres gerar a série exigiria SQL manual sem ganho.
 */
async function loadTakenDays(
  prisma: PrismaClient,
  from: ISODate,
  to: ISODate,
  now: Date,
): Promise<{ booked: Set<ISODate>; blocked: Set<ISODate> }> {
  const [bookings, blocks] = await Promise.all([
    prisma.booking.findMany({
      where: { ...activeBookingsFilter(now), ...overlappingRangeFilter(from, to) },
      select: { startDate: true, endDate: true },
    }),
    prisma.blockedDate.findMany({
      where: { date: { gte: parseISODate(from), lte: parseISODate(to) } },
      select: { date: true },
    }),
  ]);

  const booked = new Set<ISODate>();
  for (const booking of bookings) {
    for (const day of eachDay(toISODate(booking.startDate), toISODate(booking.endDate))) {
      booked.add(day);
    }
  }

  return { booked, blocked: new Set(blocks.map((block) => toISODate(block.date))) };
}

export type DayStatusesInput = {
  from: ISODate;
  to: ISODate;
  now?: Date;
};

/** Estado de cada dia do intervalo, para o calendário (§11.3). */
export async function getDayStatuses(
  prisma: PrismaClient,
  { from, to, now = new Date() }: DayStatusesInput,
): Promise<DayAvailability[]> {
  const [{ booked, blocked }, minLeadDays] = await Promise.all([
    loadTakenDays(prisma, from, to, now),
    loadMinLeadDays(prisma),
  ]);

  const earliest = firstBookableDay(minLeadDays, now);

  return eachDay(from, to).map((date) => ({ date, status: statusOf(date) }));

  function statusOf(date: ISODate): DayStatus {
    // Ordem da §9.1: bloqueio vence reserva, que vence antecedência.
    if (blocked.has(date)) return 'blocked';
    if (booked.has(date)) return 'booked';
    if (date < earliest) return 'past';
    return 'free';
  }
}

/**
 * Quais dos dias pedidos não estão livres.
 *
 * Devolve a lista em vez de um booleano porque a §11.3 manda dizer **quais** datas
 * caíram: "24 e 25/12 não estão mais disponíveis" resolve, "a data não está
 * disponível" obriga a pessoa a descobrir qual.
 */
export async function findUnavailableDates(
  prisma: PrismaClient,
  { from, to, now = new Date() }: DayStatusesInput,
): Promise<ISODate[]> {
  const days = await getDayStatuses(prisma, { from, to, now });

  return days.filter((day) => day.status !== 'free').map((day) => day.date);
}
