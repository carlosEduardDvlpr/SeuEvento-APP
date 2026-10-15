import type { Booking, BookingStatus } from '@chacara/shared';
import { describe, expect, it } from 'vitest';
import { groupBookings } from './groupBookings';

/** Só o que o agrupamento olha; o resto da reserva não participa da decisão. */
function booking(
  id: string,
  status: BookingStatus,
  startDate: string,
  endDate = startDate,
): Booking {
  return {
    id,
    status,
    startDate,
    endDate,
    eventType: 'BABY_SHOWER',
    guestCount: 40,
    holdExpiresAt: null,
    canCancel: false,
    cancelUntil: null,
    days: [],
    dailyTotalCents: 0,
    items: [],
    itemsTotalCents: 0,
    combos: [],
    discountTotalCents: 0,
    totalCents: 0,
    customerNotes: null,
    cancelReason: null,
    createdAt: '2026-10-01T12:00:00.000Z',
  };
}

const TODAY = '2026-10-14';

describe('groupBookings', () => {
  it('separa próximas, passadas e canceladas', () => {
    const groups = groupBookings(
      [
        booking('futura', 'CONFIRMED', '2026-12-05'),
        booking('passada', 'COMPLETED', '2026-09-10'),
        booking('cancelada', 'CANCELLED', '2026-11-20'),
      ],
      TODAY,
    );

    expect(groups.upcoming.map((b) => b.id)).toEqual(['futura']);
    expect(groups.past.map((b) => b.id)).toEqual(['passada']);
    expect(groups.cancelled.map((b) => b.id)).toEqual(['cancelada']);
  });

  /*
   * O corte é por data, não por status: depender do status faria uma festa de
   * ontem aparecer como "próxima" até o job de conclusão rodar (§9.9).
   */
  it('põe no passado a confirmada cujo dia já passou, mesmo sem o job ter rodado', () => {
    const groups = groupBookings([booking('ontem', 'CONFIRMED', '2026-10-13')], TODAY);

    expect(groups.past.map((b) => b.id)).toEqual(['ontem']);
    expect(groups.upcoming).toEqual([]);
  });

  it('a festa de hoje ainda é próxima', () => {
    const groups = groupBookings([booking('hoje', 'CONFIRMED', TODAY)], TODAY);

    expect(groups.upcoming.map((b) => b.id)).toEqual(['hoje']);
  });

  it('reserva que começou ontem e termina amanhã continua próxima', () => {
    const groups = groupBookings(
      [booking('em-curso', 'CONFIRMED', '2026-10-13', '2026-10-15')],
      TODAY,
    );

    expect(groups.upcoming.map((b) => b.id)).toEqual(['em-curso']);
  });

  it('cancelada fica no grupo de canceladas mesmo sendo futura', () => {
    const groups = groupBookings([booking('x', 'CANCELLED', '2027-01-10')], TODAY);

    expect(groups.cancelled.map((b) => b.id)).toEqual(['x']);
    expect(groups.upcoming).toEqual([]);
  });

  it('pedido aguardando confirmação entra nas próximas', () => {
    const groups = groupBookings([booking('pendente', 'PENDING', '2026-11-01')], TODAY);

    expect(groups.upcoming.map((b) => b.id)).toEqual(['pendente']);
  });

  /* A API devolve decrescente, que serve ao passado e atrapalha o futuro. */
  it('ordena as próximas da mais perto para a mais distante', () => {
    const groups = groupBookings(
      [
        booking('dezembro', 'CONFIRMED', '2026-12-20'),
        booking('novembro', 'CONFIRMED', '2026-11-10'),
        booking('outubro', 'CONFIRMED', '2026-10-25'),
      ],
      TODAY,
    );

    expect(groups.upcoming.map((b) => b.id)).toEqual(['outubro', 'novembro', 'dezembro']);
  });

  it('mantém o passado da mais recente para a mais antiga', () => {
    const groups = groupBookings(
      [
        booking('setembro', 'COMPLETED', '2026-09-20'),
        booking('agosto', 'COMPLETED', '2026-08-10'),
      ],
      TODAY,
    );

    expect(groups.past.map((b) => b.id)).toEqual(['setembro', 'agosto']);
  });

  it('devolve três grupos vazios quando não há reserva', () => {
    expect(groupBookings([], TODAY)).toEqual({ upcoming: [], past: [], cancelled: [] });
  });
});
