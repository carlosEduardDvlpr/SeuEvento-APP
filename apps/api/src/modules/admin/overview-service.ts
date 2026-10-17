import type {
  AdminBookingSummary,
  AdminCalendar,
  AdminCalendarQuery,
  AdminDashboard,
  MonthOccupancy,
} from '@chacara/shared';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import {
  type ISODate,
  addDays,
  eachDay,
  parseISODate,
  toISODate,
  todayInSaoPaulo,
} from '../../lib/dates.js';
import {
  activeBookingsFilter,
  getDayStatuses,
  overlappingRangeFilter,
} from '../availability/service.js';

/**
 * Calendário e visão geral do painel (§13.4).
 *
 * Mora em `modules/admin/` porque não há equivalente público: as duas respostas
 * são agregações de reservas, bloqueios e disponibilidade feitas para a tela de
 * quem administra. O cálculo de status de dia, que **tem** equivalente público, é
 * reaproveitado do módulo de disponibilidade (§4) em vez de recontado aqui.
 */

/** Primeiro e último dia de um mês `YYYY-MM`. */
export function monthRange(month: string): { from: ISODate; to: ISODate } {
  const from = `${month}-01`;
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];

  // Dia 0 do mês seguinte é o último do atual, em UTC para não depender do fuso.
  const last = new Date(Date.UTC(year, monthNumber, 0));

  return { from, to: toISODate(last) };
}

type BookingRow = Prisma.BookingGetPayload<{
  select: {
    id: true;
    startDate: true;
    endDate: true;
    status: true;
    eventType: true;
    guestCount: true;
    totalCents: true;
    holdExpiresAt: true;
    createdByAdmin: true;
    user: { select: { id: true; name: true; email: true; phone: true } };
  };
}>;

/** Campos do resumo, num lugar só: o calendário e a visão geral usam o mesmo. */
const summarySelect = {
  id: true,
  startDate: true,
  endDate: true,
  status: true,
  eventType: true,
  guestCount: true,
  totalCents: true,
  holdExpiresAt: true,
  createdByAdmin: true,
  user: { select: { id: true, name: true, email: true, phone: true } },
} as const;

function toSummary(row: BookingRow): AdminBookingSummary {
  return {
    id: row.id,
    startDate: toISODate(row.startDate),
    endDate: toISODate(row.endDate),
    status: row.status,
    eventType: row.eventType,
    guestCount: row.guestCount,
    totalCents: row.totalCents,
    holdExpiresAt: row.holdExpiresAt?.toISOString() ?? null,
    createdByAdmin: row.createdByAdmin,
    customer: {
      id: row.user.id,
      name: row.user.name,
      email: row.user.email,
      phone: row.user.phone,
    },
  };
}

/**
 * Grade do mês com as reservas de cada dia (§11.2).
 *
 * Traz reservas **ativas**, com o mesmo filtro da disponibilidade: pedido vencido
 * não ocupa data e também não deve aparecer no calendário como se ocupasse. As
 * canceladas ficam de fora — quem as procura vai à lista de reservas.
 */
export async function getAdminCalendar(
  prisma: PrismaClient,
  { month }: AdminCalendarQuery,
  now: Date = new Date(),
): Promise<AdminCalendar> {
  const { from, to } = monthRange(month);

  const [days, rows, blocks] = await Promise.all([
    getDayStatuses(prisma, { from, to, now }),
    prisma.booking.findMany({
      where: { ...activeBookingsFilter(now), ...overlappingRangeFilter(from, to) },
      select: summarySelect,
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
    }),
    prisma.blockedDate.findMany({
      where: { date: { gte: parseISODate(from), lte: parseISODate(to) } },
      select: { date: true, reason: true },
    }),
  ]);

  // Índice dia → reservas, montado uma vez: a reserva de três dias entra nos três.
  const byDay = new Map<ISODate, string[]>();
  for (const row of rows) {
    for (const day of eachDay(toISODate(row.startDate), toISODate(row.endDate))) {
      const list = byDay.get(day);
      if (list) list.push(row.id);
      else byDay.set(day, [row.id]);
    }
  }

  const reasons = new Map(blocks.map((block) => [toISODate(block.date), block.reason]));

  return {
    month,
    from,
    to,
    days: days.map((day) => ({
      date: day.date,
      status: day.status,
      bookingIds: byDay.get(day.date) ?? [],
      blockReason: reasons.get(day.date) ?? null,
    })),
    bookings: rows.map(toSummary),
  };
}

/**
 * Ocupação do mês, em dias (§13.4).
 *
 * Reaproveita o status de cada dia em vez de contar reservas: uma reserva de três
 * dias ocupa três, e um dia com reserva **e** bloqueio é contado uma vez — pelo
 * bloqueio, que é o que a §9.1 diz que vence.
 */
export async function getMonthOccupancy(
  prisma: PrismaClient,
  month: string,
  now: Date = new Date(),
): Promise<MonthOccupancy> {
  const { from, to } = monthRange(month);
  const days = await getDayStatuses(prisma, { from, to, now });

  const bookedDays = days.filter((day) => day.status === 'booked').length;
  const blockedDays = days.filter((day) => day.status === 'blocked').length;
  const totalDays = days.length;

  return {
    month,
    totalDays,
    bookedDays,
    blockedDays,
    /*
     * `past` não é dia livre nem ocupado: é dia que já não pode ser vendido. Fica
     * fora do livre para o número não prometer uma agenda que não existe mais.
     */
    freeDays: days.filter((day) => day.status === 'free').length,
    bookedPercent: totalDays === 0 ? 0 : Math.round((bookedDays / totalDays) * 100),
  };
}

/**
 * Quantos pedidos e eventos o dono tem na frente (§13.4).
 *
 * Três recortes, porque são três decisões diferentes: o que precisa de resposta
 * hoje (pedidos aguardando), o que vai acontecer logo (próximos dias) e como o mês
 * está indo (ocupação).
 */
const UPCOMING_WINDOW_DAYS = 30;

/**
 * Teto das listas.
 *
 * Com `maxPendingPerUser` em 3 e uma chácara só, passar disso não acontece na
 * prática — e se acontecer, o dono precisa da lista de reservas com filtro, não de
 * uma visão geral de mil linhas.
 */
const OVERVIEW_LIMIT = 50;

export async function getAdminDashboard(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<AdminDashboard> {
  // "Hoje" é o dia na chácara (§7.3), não no fuso do servidor: a Render roda em
  // UTC, e depois das 21h de Brasília o dia já teria virado lá.
  const start = todayInSaoPaulo(now);
  const horizon = addDays(start, UPCOMING_WINDOW_DAYS);
  const week = addDays(start, 7);

  const [pendingRows, pendingCount, upcomingRows, next7, next30, occupancy] = await Promise.all([
    /*
     * Ordem pelo prazo, não pela data da festa: o que vence primeiro é o que o
     * dono perde se não responder. Pedido sem prazo vem antes, porque é anomalia
     * (§9.2 sempre define `holdExpiresAt`) e merece ser vista.
     */
    prisma.booking.findMany({
      where: { status: 'PENDING', OR: [{ holdExpiresAt: null }, { holdExpiresAt: { gt: now } }] },
      select: summarySelect,
      orderBy: [{ holdExpiresAt: 'asc' }, { id: 'asc' }],
      take: OVERVIEW_LIMIT,
    }),

    // Contagem separada da lista: `take` limita o que é exibido, e o número no
    // cartão precisa dizer quantos existem, não quantos couberam.
    prisma.booking.count({
      where: { status: 'PENDING', OR: [{ holdExpiresAt: null }, { holdExpiresAt: { gt: now } }] },
    }),

    prisma.booking.findMany({
      where: {
        ...activeBookingsFilter(now),
        startDate: { gte: parseISODate(start), lte: parseISODate(horizon) },
      },
      select: summarySelect,
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
      take: OVERVIEW_LIMIT,
    }),

    prisma.booking.count({
      where: {
        ...activeBookingsFilter(now),
        startDate: { gte: parseISODate(start), lte: parseISODate(week) },
      },
    }),

    prisma.booking.count({
      where: {
        ...activeBookingsFilter(now),
        startDate: { gte: parseISODate(start), lte: parseISODate(horizon) },
      },
    }),

    getMonthOccupancy(prisma, start.slice(0, 7), now),
  ]);

  return {
    pending: pendingRows.map(toSummary),
    upcoming: upcomingRows.map(toSummary),
    counts: { pending: pendingCount, next7, next30 },
    occupancy,
  };
}
