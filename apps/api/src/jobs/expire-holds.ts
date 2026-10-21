import { HOLD_EXPIRED_REASON, formatDateRange } from '@chacara/shared';
import { env } from '../config/env.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { toISODate } from '../lib/dates.js';
import { holdExpiredTemplate } from '../lib/mail/templates.js';
import { sendMail } from '../lib/mailer.js';

/**
 * Derruba os pedidos cujo prazo venceu (§9.9).
 *
 * Roda a cada 15 minutos. O que ele faz **não** é liberar a data: a consulta de
 * disponibilidade já ignora pedido vencido (§9.1), e a criação de reserva cancela
 * o que atrapalha na própria transação (T19). O trabalho deste job é fechar o
 * registro e **avisar o cliente**, que de outro jeito descobriria sozinho que
 * perdeu as datas.
 *
 * Idempotente: na segunda execução não há mais `PENDING` vencida, então ele não
 * encontra nada e não manda e-mail de novo.
 */

export type ExpireHoldsSummary = {
  /** Quantos pedidos estavam vencidos quando o job olhou. */
  found: number;
  /** Quantos ele realmente cancelou. Menor que `found` se alguém mudou no meio. */
  cancelled: number;
  /** Quantos clientes foram avisados. Menor quando a conta não tem e-mail. */
  notified: number;
};

export type ExpireHoldsInput = {
  prisma: PrismaClient;
  now?: Date;
};

export async function runExpireHolds({
  prisma,
  now = new Date(),
}: ExpireHoldsInput): Promise<ExpireHoldsSummary> {
  const expired = await prisma.booking.findMany({
    where: { status: 'PENDING', holdExpiresAt: { lt: now } },
    select: {
      id: true,
      kind: true,
      startDate: true,
      endDate: true,
      user: { select: { name: true, email: true } },
    },
  });

  const summary: ExpireHoldsSummary = { found: expired.length, cancelled: 0, notified: 0 };

  if (expired.length === 0) return summary;

  const settings = await prisma.venueSettings.findUnique({
    where: { id: 1 },
    select: { holdHours: true },
  });

  for (const booking of expired) {
    /*
     * Uma escrita por pedido, com o status esperado no `WHERE`.
     *
     * Um `updateMany` em lote seria uma consulta só, mas devolve apenas a
     * contagem — e aí não há como saber **quais** foram cancelados para avisar
     * exatamente esses. Pior: se o dono confirmou um deles entre a leitura e a
     * escrita, o lote o cancelaria por cima de uma confirmação. A guarda no
     * `WHERE` resolve os dois, e a quantidade por rodada é pequena.
     */
    const changed = await prisma.booking.updateMany({
      where: { id: booking.id, status: 'PENDING', holdExpiresAt: { lt: now } },
      data: {
        status: 'CANCELLED',
        cancelReason: HOLD_EXPIRED_REASON,
        holdExpiresAt: null,
        /*
         * `cancelledBy` fica nulo de propósito: o job não é `CLIENT` nem `ADMIN`
         * (§8). Nulo com `cancelReason = HOLD_EXPIRED` é como se lê "o prazo
         * acabou", sem precisar de um papel novo no enum.
         */
      },
    });

    if (changed.count === 0) continue;

    summary.cancelled += 1;

    if (!booking.user.email) continue;

    await sendMail({
      to: booking.user.email,
      ...holdExpiredTemplate({
        name: booking.user.name,
        dates: formatDateRange(toISODate(booking.startDate), toISODate(booking.endDate)),
        holdHours: settings?.holdHours ?? 48,
        bookingUrl: `${env.APP_URL}/reservar`,
        kind: booking.kind,
      }),
    });

    summary.notified += 1;
  }

  return summary;
}
