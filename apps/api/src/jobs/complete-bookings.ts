import type { PrismaClient } from '../generated/prisma/client.js';
import { parseISODate, todayInSaoPaulo } from '../lib/dates.js';

/**
 * Marca como concluída a reserva confirmada que já aconteceu (§9.9).
 *
 * Roda uma vez por dia. Não manda e-mail: a §17 não prevê aviso de conclusão, e
 * com razão — a festa acabou, e um e-mail dizendo isso não serve para nada.
 *
 * Idempotente: `COMPLETED` não está no filtro, então a segunda execução não
 * encontra nada.
 */

export type CompleteBookingsSummary = { completed: number };

export type CompleteBookingsInput = {
  prisma: PrismaClient;
  now?: Date;
};

export async function runCompleteBookings({
  prisma,
  now = new Date(),
}: CompleteBookingsInput): Promise<CompleteBookingsSummary> {
  /*
   * "Hoje" no fuso do negócio (§7.3), não no fuso do servidor: o job roda num
   * contêiner em UTC, e perto da meia-noite os dois discordam de um dia.
   *
   * A comparação é `endDate < hoje`, estritamente. Reserva que **termina hoje**
   * fica de fora: a festa pode estar acontecendo agora, e o horário de saída da
   * chácara é às 22h.
   */
  const today = todayInSaoPaulo(now);

  const changed = await prisma.booking.updateMany({
    where: { status: 'CONFIRMED', endDate: { lt: parseISODate(today) } },
    data: { status: 'COMPLETED' },
  });

  /*
   * Lote, e sem guarda por linha, ao contrário do `expire-holds`: aqui não há
   * e-mail para mandar, então não é preciso saber quais mudaram — e o `status`
   * no `WHERE` já impede passar por cima de uma reserva cancelada no meio.
   */
  return { completed: changed.count };
}
