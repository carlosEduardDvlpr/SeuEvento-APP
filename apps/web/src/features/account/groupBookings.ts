import type { Booking, ISODate } from '@chacara/shared';

/**
 * Agrupamento da lista de reservas (§13.3).
 *
 * Três grupos, na ordem em que interessam: o que vem, o que já foi, o que não vai
 * acontecer. Quem abre esta tela quase sempre quer a próxima festa, então ela fica
 * em cima.
 *
 * O corte é por **data**, não por status: uma reserva confirmada cujo dia já
 * passou pertence ao passado mesmo que o job de conclusão ainda não tenha rodado
 * (§9.9). Depender do status faria a lista mostrar como "próxima" uma festa de
 * ontem até o job passar.
 */

export type BookingGroups = {
  upcoming: Booking[];
  past: Booking[];
  cancelled: Booking[];
};

export function groupBookings(bookings: Booking[], today: ISODate): BookingGroups {
  const groups: BookingGroups = { upcoming: [], past: [], cancelled: [] };

  for (const booking of bookings) {
    if (booking.status === 'CANCELLED') groups.cancelled.push(booking);
    else if (booking.endDate >= today) groups.upcoming.push(booking);
    else groups.past.push(booking);
  }

  // As próximas sobem da mais perto para a mais distante; a API devolve
  // decrescente, que é a ordem certa para o passado e a errada para o futuro.
  groups.upcoming.reverse();

  return groups;
}
