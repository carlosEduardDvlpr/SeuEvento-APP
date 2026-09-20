import { parseISODate, type ISODate } from '../../src/lib/dates.js';
import type { BookingStatus, EventType, Role } from '../../src/generated/prisma/enums.js';
import { prisma } from './db.js';

let sequence = 0;

export function createUser(
  overrides: { name?: string; email?: string | null; phone?: string | null; role?: Role } = {},
) {
  sequence += 1;
  return prisma.user.create({
    data: {
      name: overrides.name ?? `Cliente ${sequence}`,
      email: overrides.email === undefined ? `cliente-${sequence}@exemplo.com` : overrides.email,
      phone: overrides.phone === undefined ? '11999990000' : overrides.phone,
      role: overrides.role ?? 'CLIENT',
    },
  });
}

type BookingInput = {
  userId: string;
  /** Dia de entrada, 'YYYY-MM-DD'. */
  startDate: ISODate;
  /** Dia de saída, inclusivo (§7.3). */
  endDate: ISODate;
  status?: BookingStatus;
  eventType?: EventType;
  guestCount?: number;
  holdExpiresAt?: Date | null;
};

/**
 * Reserva mínima para exercitar as regras de calendário.
 *
 * O snapshot financeiro fica zerado de propósito: aqui o que está sob teste são
 * as constraints de data. Quem precisa de valores reais é a T19, que monta a
 * reserva pelo computeQuote.
 */
export function createBooking(input: BookingInput) {
  return prisma.booking.create({
    data: {
      userId: input.userId,
      startDate: parseISODate(input.startDate),
      endDate: parseISODate(input.endDate),
      status: input.status ?? 'PENDING',
      eventType: input.eventType ?? 'BABY_SHOWER',
      guestCount: input.guestCount ?? 40,
      holdExpiresAt: input.holdExpiresAt ?? null,
      dailyBreakdown: [],
      appliedCombos: [],
      dailyTotalCents: 0,
      itemsTotalCents: 0,
      discountTotalCents: 0,
      totalCents: 0,
    },
  });
}
