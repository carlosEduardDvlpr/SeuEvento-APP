import type {
  AdminBooking,
  AdminBookingsPage,
  AdminBookingsQuery,
  BookingStatus,
  CreateAdminBookingBody,
  UpdateBookingNotesBody,
  UpdateBookingStatusBody,
} from '@chacara/shared';
import { formatBRL, formatDateRange } from '@chacara/shared';
import { env } from '../../config/env.js';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { parseISODate, toISODate } from '../../lib/dates.js';
import { AppError } from '../../lib/errors.js';
import { bookingCancelledTemplate, bookingConfirmedTemplate } from '../../lib/mail/templates.js';
import { sendMail } from '../../lib/mailer.js';
import { createBooking } from '../bookings/service.js';
import { createAdminCustomer } from './customers-service.js';

/**
 * Reservas pelo painel (§11.2, §13.4).
 *
 * Aqui o dono **decide**: confirma, recusa e anota. O que esta camada garante é
 * que a decisão siga a máquina de estados da §9.2 e que o cliente saiba dela por
 * e-mail (§17) — nessa ordem, e só depois da escrita ter dado certo.
 */

/**
 * Para onde o dono pode levar uma reserva, a partir de onde ela está (§9.2).
 *
 * Esta é a **única** implementação: a resposta a usa para dizer quais botões
 * aparecem, e a mudança de status a usa para recusar. Duas cópias divergiriam, e
 * o sintoma seria um botão que existe e não funciona — o mesmo raciocínio do
 * `cancelPermission` da §13.3.
 */
export function allowedAdminTransitions(status: BookingStatus): BookingStatus[] {
  switch (status) {
    // Pedido: confirmar é o caminho normal; recusar também é decisão do dono.
    case 'PENDING':
      return ['CONFIRMED', 'CANCELLED'];

    /*
     * Confirmada pode ser cancelada pelo dono **sem prazo** — o limite de
     * `freeCancelUntilDays` é do cliente (§9.2) — e pode ser concluída à mão,
     * sem esperar o job diário.
     */
    case 'CONFIRMED':
      return ['CANCELLED', 'COMPLETED'];

    // Cancelada e concluída são finais: reabrir uma delas liberaria data que a
    // disponibilidade já devolveu ao calendário.
    default:
      return [];
  }
}

type BookingRow = Prisma.BookingGetPayload<{
  include: { items: true; user: { select: { id: true; name: true; email: true; phone: true } } };
}>;

const detailInclude = {
  items: true,
  user: { select: { id: true, name: true, email: true, phone: true } },
} as const;

function toAdminBooking(row: BookingRow): AdminBooking {
  /*
   * `dailyBreakdown` e `appliedCombos` são `Json` no banco. Foram gravados pelo
   * service de reservas a partir do `computeQuote`, e a conversão confia nisso:
   * validar de novo aqui transformaria dado corrompido em erro 500 numa leitura.
   */
  const days = (row.dailyBreakdown ?? []) as AdminBooking['days'];
  const combos = (row.appliedCombos ?? []) as AdminBooking['combos'];

  return {
    id: row.id,
    startDate: toISODate(row.startDate),
    endDate: toISODate(row.endDate),
    eventType: row.eventType,
    guestCount: row.guestCount,
    status: row.status,
    holdExpiresAt: row.holdExpiresAt?.toISOString() ?? null,

    days,
    dailyTotalCents: row.dailyTotalCents,
    items: row.items.map((item) => ({
      itemId: item.itemId,
      name: item.itemName,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      totalCents: item.quantity * item.unitPriceCents,
    })),
    itemsTotalCents: row.itemsTotalCents,
    combos,
    discountTotalCents: row.discountTotalCents,
    totalCents: row.totalCents,

    customerNotes: row.customerNotes,
    adminNotes: row.adminNotes,
    cancelReason: row.cancelReason,
    cancelledBy: row.cancelledBy,
    createdByAdmin: row.createdByAdmin,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),

    customer: {
      id: row.user.id,
      name: row.user.name,
      email: row.user.email,
      phone: row.user.phone,
    },
    allowedTransitions: allowedAdminTransitions(row.status),
  };
}

/**
 * Lista paginada com busca e filtros (§11.2).
 *
 * O período filtra por **sobreposição**: quem procura uma semana quer ver a festa
 * de três dias que começou antes e atravessa. Filtrar pelo dia de início a
 * esconderia exatamente quando ela mais importa.
 */
export async function listAdminBookings(
  prisma: PrismaClient,
  query: AdminBookingsQuery,
): Promise<AdminBookingsPage> {
  const where: Prisma.BookingWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    // As duas pontas do período no mesmo objeto, senão uma sobrescreve a outra.
    ...(query.to ? { startDate: { lte: parseISODate(query.to) } } : {}),
    ...(query.from ? { endDate: { gte: parseISODate(query.from) } } : {}),
    ...(query.q
      ? {
          user: {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { email: { contains: query.q, mode: 'insensitive' } },
              // Telefone é guardado só com dígitos, então a busca tira a
              // pontuação que o dono digitou ao copiar de algum lugar.
              { phone: { contains: query.q.replace(/\D/g, '') || query.q } },
            ],
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: detailInclude,
      /*
       * Mais recente primeiro, pela data da festa. O id desempata para a lista
       * não dançar entre páginas — sem segundo critério, duas reservas no mesmo
       * dia podem trocar de lugar e uma delas aparecer em duas páginas.
       */
      orderBy: [{ startDate: 'desc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.booking.count({ where }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      startDate: toISODate(row.startDate),
      endDate: toISODate(row.endDate),
      status: row.status,
      eventType: row.eventType,
      guestCount: row.guestCount,
      totalCents: row.totalCents,
      holdExpiresAt: row.holdExpiresAt?.toISOString() ?? null,
      createdByAdmin: row.createdByAdmin,
      createdAt: row.createdAt.toISOString(),
      customer: {
        id: row.user.id,
        name: row.user.name,
        email: row.user.email,
        phone: row.user.phone,
      },
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function getAdminBooking(prisma: PrismaClient, id: string): Promise<AdminBooking> {
  const row = await prisma.booking.findUnique({ where: { id }, include: detailInclude });

  if (!row) throw new AppError('NOT_FOUND', 404, 'Não encontramos esta reserva.');

  return toAdminBooking(row);
}

/** Nota interna (§13.4). Nunca sai para o cliente, e não dispara e-mail. */
export async function updateAdminBookingNotes(
  prisma: PrismaClient,
  id: string,
  { adminNotes }: UpdateBookingNotesBody,
): Promise<AdminBooking> {
  const existing = await prisma.booking.findUnique({ where: { id }, select: { id: true } });

  if (!existing) throw new AppError('NOT_FOUND', 404, 'Não encontramos esta reserva.');

  const row = await prisma.booking.update({
    where: { id },
    data: { adminNotes },
    include: detailInclude,
  });

  return toAdminBooking(row);
}

/**
 * Confirma, recusa ou conclui (§9.2).
 *
 * A escrita carrega o status esperado no `WHERE`, pelo mesmo motivo do
 * cancelamento do cliente: entre ler e gravar, o próprio cliente pode ter
 * cancelado o pedido, e sem a condição o painel sobrescreveria isso em silêncio.
 *
 * O e-mail sai **depois** do commit, nunca dentro dele: falha de envio não pode
 * desfazer uma confirmação que o dono já deu (§17).
 */
export async function updateAdminBookingStatus(
  prisma: PrismaClient,
  id: string,
  { status, reason }: UpdateBookingStatusBody,
): Promise<AdminBooking> {
  const current = await prisma.booking.findUnique({
    where: { id },
    select: { id: true, status: true },
  });

  if (!current) throw new AppError('NOT_FOUND', 404, 'Não encontramos esta reserva.');

  if (!allowedAdminTransitions(current.status).includes(status)) {
    throw new AppError(
      'INVALID_TRANSITION',
      422,
      current.status === status
        ? 'Esta reserva já está nesse estado.'
        : 'Esta reserva não pode mudar para esse estado.',
      { from: current.status, to: status },
    );
  }

  const changed = await prisma.booking.updateMany({
    where: { id, status: current.status },
    data: {
      status,
      /*
       * Confirmar limpa o prazo (§9.2): a reserva passa a ocupar a data por ser
       * confirmada, e deixar o prazo correndo faria o job de expiração cancelar
       * uma reserva que o dono acabou de aceitar.
       */
      holdExpiresAt: null,
      ...(status === 'CANCELLED' ? { cancelledBy: 'ADMIN', cancelReason: reason } : {}),
    },
  });

  if (changed.count === 0) {
    throw new AppError(
      'INVALID_TRANSITION',
      422,
      'Esta reserva mudou enquanto você olhava. Recarregue a página.',
    );
  }

  const row = await prisma.booking.findUniqueOrThrow({ where: { id }, include: detailInclude });

  await notifyCustomer(prisma, row, status, reason);

  return toAdminBooking(row);
}

async function notifyCustomer(
  prisma: PrismaClient,
  row: BookingRow,
  status: BookingStatus,
  reason: string | null,
): Promise<void> {
  // Cliente lançado pelo painel pode não ter e-mail (§9.8); o dono avisa por fora.
  if (!row.user.email) return;

  const dates = formatDateRange(toISODate(row.startDate), toISODate(row.endDate));

  const settings = await prisma.venueSettings.findUnique({
    where: { id: 1 },
    select: {
      checkInTime: true,
      checkOutTime: true,
      address: true,
      houseRules: true,
      whatsapp: true,
    },
  });

  if (status === 'CONFIRMED' && settings) {
    await sendMail({
      to: row.user.email,
      ...bookingConfirmedTemplate({
        name: row.user.name,
        dates,
        checkInTime: settings.checkInTime,
        checkOutTime: settings.checkOutTime,
        totalFormatted: formatBRL(row.totalCents),
        address: settings.address,
        houseRules: settings.houseRules,
        whatsapp: settings.whatsapp,
        bookingUrl: `${env.APP_URL}/reservas/${row.id}`,
      }),
    });
    return;
  }

  if (status === 'CANCELLED') {
    await sendMail({
      to: row.user.email,
      ...bookingCancelledTemplate({
        name: row.user.name,
        dates,
        reason,
        whatsapp: settings?.whatsapp ?? null,
      }),
    });
  }

  /*
   * `COMPLETED` não manda e-mail, e a §17 não prevê um: a festa aconteceu, a
   * pessoa sabe. Avisar que "sua reserva foi concluída" seria ruído.
   */
}

/**
 * Reserva lançada pelo painel (§9.8).
 *
 * Reaproveita o `createBooking` do módulo de reservas, e isso é o ponto: o núcleo
 * transacional — exclusion constraint das datas, trava e contagem de estoque,
 * preço recalculado — é o que garante zero dupla reserva (§8.1, §9.3). Uma
 * segunda implementação aqui seria um segundo caminho para furar a agenda.
 *
 * O que esta função faz além disso é resolver **de quem** é a reserva: cliente
 * escolhido da lista, ou criado agora com nome e telefone.
 *
 * O cliente novo é criado **antes** da reserva, fora da transação dela. Se a data
 * cair, o cliente fica cadastrado — e isso é o comportamento desejado: o dono
 * acabou de digitar os dados de alguém real, e perdê-los por conflito de data o
 * faria digitar tudo de novo. O que ele precisa é escolher outra data.
 */
export async function createManualBooking(
  prisma: PrismaClient,
  body: CreateAdminBookingBody,
): Promise<AdminBooking> {
  const userId = body.customerId ?? (await createAdminCustomer(prisma, body.customer!)).id;

  const created = await createBooking({
    prisma,
    userId,
    body: {
      startDate: body.startDate,
      endDate: body.endDate,
      eventType: body.eventType,
      guestCount: body.guestCount,
      items: body.items,
      customerNotes: body.customerNotes,
      expectedTotalCents: body.expectedTotalCents,
    },
    asAdmin: { confirmed: body.confirmed },
  });

  /*
   * A nota interna entra depois: ela não pertence ao corpo que o cliente envia, e
   * enfiá-la no `createBooking` obrigaria aquele caminho a conhecer um campo que
   * nunca vai receber.
   */
  if (body.adminNotes) {
    return updateAdminBookingNotes(prisma, created.id, { adminNotes: body.adminNotes });
  }

  return getAdminBooking(prisma, created.id);
}
