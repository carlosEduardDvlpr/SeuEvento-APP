import type {
  AdminCustomer,
  AdminCustomerDetail,
  AdminCustomersPage,
  AdminCustomersQuery,
  CreateCustomerBody,
} from '@chacara/shared';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { toISODate } from '../../lib/dates.js';
import { AppError } from '../../lib/errors.js';

/**
 * Clientes no painel (§11.2, §13.4).
 *
 * Cadastro **sem senha** (§9.8): o dono registra quem fechou pelo WhatsApp, e
 * essa pessoa pode nunca usar o site. A conta nasce sem `passwordHash` e sem
 * `googleId`, que é exatamente o estado que o cadastro próprio sabe assumir
 * depois, se ela aparecer com o mesmo e-mail.
 */

type CustomerRow = Prisma.UserGetPayload<{
  select: {
    id: true;
    name: true;
    email: true;
    phone: true;
    passwordHash: true;
    googleId: true;
    emailVerifiedAt: true;
    createdAt: true;
    _count: { select: { bookings: true } };
  };
}>;

const listSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  passwordHash: true,
  googleId: true,
  emailVerifiedAt: true,
  createdAt: true,
  _count: { select: { bookings: true } },
} as const;

function toCustomer(row: CustomerRow): AdminCustomer {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    /*
     * "Tem acesso" é ter com que entrar: senha ou Google. A tela usa isto para
     * não prometer um login que a pessoa não consegue fazer — e o hash em si
     * nunca sai daqui.
     */
    hasAccess: row.passwordHash !== null || row.googleId !== null,
    emailVerified: row.emailVerifiedAt !== null,
    createdAt: row.createdAt.toISOString(),
    bookingCount: row._count.bookings,
  };
}

/**
 * Lista paginada, com busca por nome, e-mail ou telefone.
 *
 * Só papel `CLIENT`: a conta do próprio dono não é cliente, e aparecer na lista
 * dele seria confuso — além de abrir o caminho de lançar uma reserva em nome da
 * administração sem querer.
 */
export async function listAdminCustomers(
  prisma: PrismaClient,
  query: AdminCustomersQuery,
): Promise<AdminCustomersPage> {
  const where: Prisma.UserWhereInput = {
    role: 'CLIENT',
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' } },
            { email: { contains: query.q, mode: 'insensitive' } },
            // O telefone é guardado só com dígitos; o dono cola com pontuação.
            { phone: { contains: query.q.replace(/\D/g, '') || query.q } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: listSelect,
      // Nome em ordem alfabética: a lista é para procurar gente, não novidades.
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return { items: rows.map(toCustomer), total, page: query.page, pageSize: query.pageSize };
}

export async function getAdminCustomer(
  prisma: PrismaClient,
  id: string,
): Promise<AdminCustomerDetail> {
  const row = await prisma.user.findFirst({
    where: { id, role: 'CLIENT' },
    select: {
      ...listSelect,
      bookings: {
        orderBy: [{ startDate: 'desc' }, { id: 'asc' }],
        select: {
          id: true,
          kind: true,
          startDate: true,
          endDate: true,
          status: true,
          guestCount: true,
          totalCents: true,
          holdExpiresAt: true,
          createdByAdmin: true,
          createdAt: true,
        },
      },
    },
  });

  if (!row) throw new AppError('NOT_FOUND', 404, 'Não encontramos este cliente.');

  const customer = toCustomer(row);

  return {
    ...customer,
    bookings: row.bookings.map((booking) => ({
      id: booking.id,
      kind: booking.kind,
      startDate: toISODate(booking.startDate),
      endDate: toISODate(booking.endDate),
      status: booking.status,
      guestCount: booking.guestCount,
      totalCents: booking.totalCents,
      holdExpiresAt: booking.holdExpiresAt?.toISOString() ?? null,
      createdByAdmin: booking.createdByAdmin,
      createdAt: booking.createdAt.toISOString(),
      // O cliente do histórico é o próprio dono da página.
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
      },
    })),
  };
}

/**
 * Cria o cliente que fechou por fora (§9.8).
 *
 * Sem senha e sem e-mail confirmado: não há a quem mandar link, e marcar o
 * e-mail como verificado sem ninguém ter clicado em nada permitiria a qualquer
 * pessoa reivindicar o endereço depois.
 *
 * E-mail repetido é recusado com `EMAIL_IN_USE` em vez de silenciosamente
 * reaproveitar a conta: se já existe alguém com aquele endereço, o dono precisa
 * saber — provavelmente é a mesma pessoa, e lançar a reserva na conta existente
 * é o que preserva o histórico dela.
 */
export async function createAdminCustomer(
  prisma: PrismaClient,
  body: CreateCustomerBody,
): Promise<AdminCustomer> {
  if (body.email) {
    const existing = await prisma.user.findUnique({
      where: { email: body.email },
      select: { id: true },
    });

    if (existing) {
      throw new AppError(
        'EMAIL_IN_USE',
        409,
        'Já existe um cliente com este e-mail. Procure por ele na lista.',
        { customerId: existing.id },
      );
    }
  }

  const row = await prisma.user.create({
    data: {
      name: body.name,
      phone: body.phone,
      email: body.email ?? null,
      role: 'CLIENT',
    },
    select: listSelect,
  });

  return toCustomer(row);
}
