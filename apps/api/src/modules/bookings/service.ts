import {
  type Booking,
  type CreateBookingBody,
  HOLD_EXPIRED_REASON,
  type Quote,
  formatBRL,
  formatDateRange,
} from '@chacara/shared';
import { env } from '../../config/env.js';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { type ISODate, parseISODate, toISODate } from '../../lib/dates.js';
import { AppError, fieldError, isExclusionViolation, isWriteConflict } from '../../lib/errors.js';
import { bookingReceivedTemplate, holdExpiredTemplate } from '../../lib/mail/templates.js';
import { sendMail } from '../../lib/mailer.js';
import {
  findBlockedDaysIn,
  findUnavailableDates,
  overlappingRangeFilter,
} from '../availability/service.js';
import { findStockShortages } from '../items/stock.js';
import { quoteFromDatabase } from '../pricing/service.js';

/**
 * Criação da reserva (§9.1, §9.3, §9.7, §11.3).
 *
 * É o ponto mais sensível do sistema: duas pessoas pedindo a mesma data ao mesmo
 * tempo não podem as duas conseguir. A defesa tem três camadas, e nenhuma delas é
 * "consultar antes de inserir":
 *
 * 1. **Datas**: a exclusion constraint da §8.1 rejeita a segunda inserção no
 *    próprio Postgres. É a única proteção que funciona sob concorrência.
 * 2. **Estoque**: a transação trava as linhas de `Item` envolvidas, em **ordem de
 *    id**, antes de contar o que já está reservado. A ordem é o que evita
 *    deadlock entre dois pedidos que compartilham itens em ordens diferentes.
 * 3. **Preço**: o total é recalculado e comparado com o que o cliente viu
 *    (§9.7). Diferente, recusa.
 *
 * A consulta prévia de disponibilidade existe só para a mensagem de erro ser
 * útil ("os dias 24 e 25 não estão livres") e para pegar bloqueio do admin, que a
 * constraint não conhece.
 */

type BookingRow = Prisma.BookingGetPayload<{ include: { items: true } }>;

function toBooking(row: BookingRow): Booking {
  /*
   * `dailyBreakdown` e `appliedCombos` são `Json` no banco, então o tipo não
   * garante nada. Foram gravados por este mesmo service a partir do
   * `computeQuote`, e a conversão abaixo confia nisso de propósito: validar de
   * novo aqui só transformaria um dado corrompido em erro 500 numa leitura.
   */
  const days = (row.dailyBreakdown ?? []) as Booking['days'];
  const combos = (row.appliedCombos ?? []) as Booking['combos'];

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
    cancelReason: row.cancelReason,
    createdAt: row.createdAt.toISOString(),
  };
}

type VenueRules = {
  maxGuests: number;
  holdHours: number;
  maxPendingPerUser: number;
};

async function loadVenueRules(prisma: PrismaClient): Promise<VenueRules> {
  const settings = await prisma.venueSettings.findUnique({
    where: { id: 1 },
    select: { maxGuests: true, holdHours: true, maxPendingPerUser: true },
  });

  if (!settings) {
    throw new AppError('INTERNAL', 500, 'Configuração da chácara não encontrada.');
  }

  return settings;
}

/**
 * Quem pode enviar pedido (§11.3).
 *
 * E-mail confirmado prova que o endereço existe, e o telefone é como a chácara
 * fala com a pessoa no dia da festa. Sem os dois, confirmar a reserva depois
 * seria impossível.
 */
async function loadEligibleUser(prisma: PrismaClient, userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    throw new AppError('UNAUTHORIZED', 401, 'Sua sessão expirou. Entre de novo para continuar.');
  }

  if (user.emailVerifiedAt === null) {
    throw new AppError(
      'EMAIL_NOT_VERIFIED',
      403,
      'Confirme seu e-mail antes de enviar um pedido de reserva.',
    );
  }

  if (!user.phone) {
    throw fieldError('phone', 'Informe seu WhatsApp no perfil para a chácara falar com você.');
  }

  return user;
}

/** Transforma as `issues` do orçamento no erro correspondente da §11.1. */
function throwFirstIssue(quote: Quote): never {
  const dateIssue = quote.issues.find((issue) => issue.code === 'DATE_UNAVAILABLE');

  if (dateIssue) {
    throw new AppError(
      'DATE_UNAVAILABLE',
      409,
      'Uma ou mais datas escolhidas não estão mais disponíveis.',
      { dates: dateIssue.dates },
    );
  }

  const stockIssue = quote.issues.find((issue) => issue.code === 'STOCK_INSUFFICIENT');

  if (stockIssue) {
    throw new AppError(
      'STOCK_INSUFFICIENT',
      409,
      'Um dos itens não tem unidades suficientes nessas datas.',
      { itemId: stockIssue.itemId, available: stockIssue.available },
    );
  }

  // `available: false` sem issue seria bug nosso, não erro do cliente.
  throw new AppError('INTERNAL', 500, 'Não foi possível validar o pedido.');
}

/** Pedido vencido que o cliente precisa saber que caiu, avisado após o commit. */
type ExpiredHold = { email: string; name: string; startDate: ISODate; endDate: ISODate };

export type CreateBookingInput = {
  prisma: PrismaClient;
  userId: string;
  body: CreateBookingBody;
  /** Reserva lançada pelo painel nasce confirmada (§9.8). Entra na T24. */
  now?: Date;
};

export async function createBooking({
  prisma,
  userId,
  body,
  now = new Date(),
}: CreateBookingInput): Promise<Booking> {
  const [user, rules] = await Promise.all([
    loadEligibleUser(prisma, userId),
    loadVenueRules(prisma),
  ]);

  if (body.guestCount > rules.maxGuests) {
    throw fieldError('guestCount', `A chácara recebe até ${rules.maxGuests} pessoas.`);
  }

  /*
   * O mesmo `quoteFromDatabase` que `POST /pricing/quote` usa (§9.7). É isso que
   * garante que o número do resumo e o número gravado na reserva saem da mesma
   * conta — não de duas somas parecidas.
   */
  const quote = await quoteFromDatabase(
    prisma,
    { startDate: body.startDate, endDate: body.endDate, items: body.items },
    now,
  );

  if (!quote.available) throwFirstIssue(quote);

  if (quote.totalCents !== body.expectedTotalCents) {
    throw new AppError(
      'PRICE_CHANGED',
      409,
      'O valor mudou. Confira o novo total antes de enviar.',
      {
        quote,
      },
    );
  }

  const holdExpiresAt = new Date(now.getTime() + rules.holdHours * 60 * 60 * 1000);
  const expiredHolds: ExpiredHold[] = [];

  const row = await insertWithRetry();

  /*
   * E-mail só depois do commit, e nunca dentro da transação: envio é lento e
   * pode falhar, e a §17 manda a falha não desfazer nada. O `sendMail` já engole
   * o próprio erro.
   */
  await notify({ row, user, rules, expiredHolds });

  return toBooking(row);

  /**
   * Roda a transação, repetindo quando o Postgres aborta por conflito de escrita.
   *
   * Sob contenção de verdade, a transação perdedora não recebe sempre o
   * `exclusion_violation` limpo: às vezes o Postgres aborta antes, como conflito
   * de serialização no índice GiST (`P2034`). Sem a repetição, quem perdeu a
   * corrida receberia **500** em vez de "a data acabou de ser reservada" — foi o
   * que apareceu num teste com 20 pedidos simultâneos.
   *
   * Repetir é seguro porque conflito implica rollback: nada foi gravado. Na
   * segunda tentativa a vencedora já commitou, então o caminho normal responde a
   * verdade, e a constraint recusa de forma determinística.
   */
  async function insertWithRetry(): Promise<BookingRow> {
    const maxAttempts = 3;

    for (let attempt = 1; ; attempt += 1) {
      // Cada tentativa recomeça a lista, senão um aviso sairia duplicado.
      expiredHolds.length = 0;

      try {
        return await runInsertTransaction();
      } catch (error) {
        if (isExclusionViolation(error)) throw await dateTakenError();

        if (isWriteConflict(error)) {
          if (attempt < maxAttempts) continue;
          // Esgotou as tentativas: a essa altura alguém está com a data.
          throw await dateTakenError();
        }

        throw error;
      }
    }
  }

  /**
   * Perdeu a corrida pela data.
   *
   * A consulta extra só roda neste caminho raro, e serve para a mensagem dizer
   * **quais** dias caíram em vez de "conflito".
   */
  async function dateTakenError(): Promise<AppError> {
    const dates = await findUnavailableDates(prisma, {
      from: body.startDate,
      to: body.endDate,
      now,
    });

    return new AppError(
      'DATE_UNAVAILABLE',
      409,
      'Alguém reservou essas datas agora mesmo. Escolha outro período.',
      { dates },
    );
  }

  async function runInsertTransaction(): Promise<BookingRow> {
    return prisma.$transaction(
      async (tx) => {
        /*
         * 1. Pedido vencido que cobre estas datas sai da frente, **na mesma
         *    transação**.
         *
         * A constraint da §8.1 considera `PENDING` como ocupando a data, sem olhar
         * o prazo. Sem este passo, um pedido vencido bloquearia a data até o job de
         * expiração rodar — até 15 minutos de uma data que já deveria estar livre.
         */
        const expiring = await tx.booking.findMany({
          where: {
            status: 'PENDING',
            holdExpiresAt: { lt: now },
            ...overlappingRangeFilter(body.startDate, body.endDate),
          },
          select: {
            id: true,
            startDate: true,
            endDate: true,
            user: { select: { name: true, email: true } },
          },
        });

        if (expiring.length > 0) {
          await tx.booking.updateMany({
            where: { id: { in: expiring.map((booking) => booking.id) } },
            data: { status: 'CANCELLED', cancelReason: HOLD_EXPIRED_REASON, holdExpiresAt: null },
          });

          for (const booking of expiring) {
            if (booking.user.email) {
              expiredHolds.push({
                email: booking.user.email,
                name: booking.user.name,
                startDate: toISODate(booking.startDate),
                endDate: toISODate(booking.endDate),
              });
            }
          }
        }

        /*
         * 2. Limite de pedidos abertos (§11.1 `TOO_MANY_PENDING`).
         *
         * Conta só os que ainda estão no prazo: pedido vencido não deveria consumir
         * a cota de ninguém, mesmo que o job ainda não tenha passado por ele.
         */
        const openRequests = await tx.booking.count({
          where: {
            userId,
            status: 'PENDING',
            OR: [{ holdExpiresAt: null }, { holdExpiresAt: { gt: now } }],
          },
        });

        if (openRequests >= rules.maxPendingPerUser) {
          throw new AppError(
            'TOO_MANY_PENDING',
            422,
            'Você já tem pedidos aguardando confirmação. Espere a resposta da chácara.',
            { maxPending: rules.maxPendingPerUser },
          );
        }

        /*
         * 3. Trava as linhas de `Item`, em ordem de id (§9.3).
         *
         * A trava transforma cada item num mutex: a partir daqui, nenhum outro
         * pedido que use o mesmo item consegue contar estoque até esta transação
         * terminar. Ordenar por id é o que evita deadlock — dois pedidos com os
         * mesmos itens em ordens diferentes travariam um ao outro.
         *
         * ACHADO, e vale registrar: com **uma chácara só**, esta trava é segunda
         * linha de defesa e nunca é o que decide. Duas reservas ativas não podem
         * compartilhar um dia (§8.1), e o estoque é contado por dia (§9.3) — então
         * um conflito de estoque exige um dia em comum, que a constraint já
         * recusou antes. A trava passa a importar no dia em que a chácara tiver
         * mais de um espaço no mesmo dia, ou alugar item sem alugar a chácara. A
         * §9.3 a exige, ela custa uma consulta, e some o risco de a regra de
         * sobreposição mudar e ninguém lembrar daqui.
         *
         * Sem itens não há o que travar, e a constraint da §8.1 já cobre as datas.
         */
        const itemIds = [...new Set(body.items.map((item) => item.itemId))].sort();

        if (itemIds.length > 0) {
          await tx.$queryRaw`SELECT id FROM "Item" WHERE id = ANY(${itemIds}::text[]) ORDER BY id FOR UPDATE`;
        }

        // 4. Com a trava na mão, a contagem de estoque é confiável (§9.3).
        const shortages = await findStockShortages(tx, {
          from: body.startDate,
          to: body.endDate,
          lines: quote.lines,
          now,
        });

        if (shortages[0]) {
          throw new AppError(
            'STOCK_INSUFFICIENT',
            409,
            'Um dos itens não tem unidades suficientes nessas datas.',
            { itemId: shortages[0].itemId, available: shortages[0].available },
          );
        }

        /*
         * 5. Bloqueio do admin.
         *
         * A constraint da §8.1 só sabe de reservas; `BlockedDate` é outra tabela.
         * Reservar um dia bloqueado criaria uma festa marcada num dia em que a
         * chácara está fechada.
         */
        const blocked = await findBlockedDaysIn(tx, body.startDate, body.endDate);

        if (blocked.length > 0) {
          throw new AppError(
            'DATE_UNAVAILABLE',
            409,
            'Uma ou mais datas escolhidas não estão mais disponíveis.',
            { dates: blocked },
          );
        }

        // 6. Insere. Se outra reserva ganhou a corrida, o Postgres recusa aqui.
        return tx.booking.create({
          data: {
            userId,
            startDate: parseISODate(body.startDate),
            endDate: parseISODate(body.endDate),
            eventType: body.eventType,
            guestCount: body.guestCount,
            status: 'PENDING',
            holdExpiresAt,
            customerNotes: body.customerNotes,

            // Snapshot do que foi contratado (§2.1).
            dailyBreakdown: quote.days,
            dailyTotalCents: quote.dailyTotalCents,
            itemsTotalCents: quote.itemsTotalCents,
            discountTotalCents: quote.discountTotalCents,
            totalCents: quote.totalCents,
            appliedCombos: quote.combos,

            items: {
              create: quote.lines.map((line) => ({
                itemId: line.itemId,
                itemName: line.name,
                quantity: line.quantity,
                unitPriceCents: line.unitPriceCents,
              })),
            },
          },
          include: { items: true },
        });
      },
      /*
       * Prazos explícitos, e não os padrões do Prisma (2 s para pegar conexão,
       * 5 s para a transação).
       *
       * Esta transação **espera de propósito**: ao inserir, ela fica bloqueada no
       * índice GiST da §8.1 até a reserva concorrente commitar. Com alguns
       * pedidos na fila para a mesma data, o padrão de 5 s estoura e a pessoa
       * recebe erro interno em vez da recusa correta — o que é um erro de
       * configuração, não de regra.
       *
       * Os números são folgados para a fila, e ainda curtos o bastante para uma
       * requisição travada não ficar pendurada: ninguém deveria esperar meio
       * minuto por um pedido de reserva.
       */
      { maxWait: 10_000, timeout: 20_000 },
    );
  }
}

async function notify({
  row,
  user,
  rules,
  expiredHolds,
}: {
  row: BookingRow;
  user: { name: string; email: string | null };
  rules: VenueRules;
  expiredHolds: ExpiredHold[];
}): Promise<void> {
  if (user.email) {
    await sendMail({
      to: user.email,
      ...bookingReceivedTemplate({
        name: user.name,
        dates: formatDateRange(toISODate(row.startDate), toISODate(row.endDate)),
        totalFormatted: formatBRL(row.totalCents),
        holdHours: rules.holdHours,
        bookingUrl: `${env.APP_URL}/reservas/${row.id}`,
      }),
    });
  }

  /*
   * Quem teve o pedido vencido derrubado aqui precisa saber: o job de expiração
   * não vai mais encontrá-lo (já está `CANCELLED`), então sem este aviso a
   * pessoa descobriria sozinha, pelo site.
   */
  for (const hold of expiredHolds) {
    await sendMail({
      to: hold.email,
      ...holdExpiredTemplate({
        name: hold.name,
        dates: formatDateRange(hold.startDate, hold.endDate),
        holdHours: rules.holdHours,
        bookingUrl: `${env.APP_URL}/reservar`,
      }),
    });
  }
}

/** Reaproveitado pela T20 (`GET /bookings/:id`) e pelo painel da T24. */
export { toBooking };
