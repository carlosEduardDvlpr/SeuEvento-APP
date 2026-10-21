import {
  type Booking,
  type BookingStatus,
  type CreateBookingBody,
  HOLD_EXPIRED_REASON,
  type Quote,
  formatBRL,
  formatDateRange,
} from '@chacara/shared';
import { env } from '../../config/env.js';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import {
  type ISODate,
  addDays,
  parseISODate,
  toISODate,
  todayInSaoPaulo,
} from '../../lib/dates.js';
import { AppError, fieldError, isExclusionViolation, isWriteConflict } from '../../lib/errors.js';
import {
  bookingCancelledTemplate,
  bookingConfirmedTemplate,
  bookingReceivedTemplate,
  holdExpiredTemplate,
  newBookingForAdminTemplate,
} from '../../lib/mail/templates.js';
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

/**
 * Pode o cliente cancelar esta reserva pelo site, e até quando (§9.2).
 *
 * Esta é a **única** implementação da regra: a resposta da API a usa para dizer
 * se o botão aparece, e `cancelMyBooking` a usa para recusar. Duas cópias
 * acabariam divergindo em exatamente um ponto — a comparação de bordas do prazo —
 * e o sintoma seria um botão que existe e não funciona.
 */
export function cancelPermission(
  status: BookingStatus,
  startDate: ISODate,
  freeCancelUntilDays: number,
  now: Date,
): { canCancel: boolean; cancelUntil: ISODate | null } {
  // Nada foi confirmado ainda: desistir de um pedido é o mesmo que deixá-lo vencer.
  if (status === 'PENDING') return { canCancel: true, cancelUntil: null };

  if (status === 'CONFIRMED') {
    // Último dia em que ainda dá para cancelar pelo site.
    const deadline = addDays(todayInSaoPaulo(now), freeCancelUntilDays);
    return { canCancel: startDate >= deadline, cancelUntil: deadline };
  }

  // Cancelada ou concluída: não há o que cancelar, nem prazo a explicar.
  return { canCancel: false, cancelUntil: null };
}

type CancelRules = { freeCancelUntilDays: number; now: Date };

function toBooking(row: BookingRow, cancelRules: CancelRules): Booking {
  /*
   * `dailyBreakdown` e `appliedCombos` são `Json` no banco, então o tipo não
   * garante nada. Foram gravados por este mesmo service a partir do
   * `computeQuote`, e a conversão abaixo confia nisso de propósito: validar de
   * novo aqui só transformaria um dado corrompido em erro 500 numa leitura.
   */
  const days = (row.dailyBreakdown ?? []) as Booking['days'];
  const combos = (row.appliedCombos ?? []) as Booking['combos'];
  const startDate = toISODate(row.startDate);

  const { canCancel, cancelUntil } = cancelPermission(
    row.status,
    startDate,
    cancelRules.freeCancelUntilDays,
    cancelRules.now,
  );

  return {
    id: row.id,
    kind: row.kind,
    startDate,
    endDate: toISODate(row.endDate),
    eventType: row.eventType,
    guestCount: row.guestCount,
    status: row.status,
    holdExpiresAt: row.holdExpiresAt?.toISOString() ?? null,
    canCancel,
    cancelUntil,

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
  freeCancelUntilDays: number;
};

async function loadVenueRules(prisma: PrismaClient): Promise<VenueRules> {
  const settings = await prisma.venueSettings.findUnique({
    where: { id: 1 },
    select: {
      maxGuests: true,
      holdHours: true,
      maxPendingPerUser: true,
      freeCancelUntilDays: true,
    },
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
async function loadEligibleUser(
  prisma: PrismaClient,
  userId: string,
  { requireVerifiedContact }: { requireVerifiedContact: boolean },
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    // §18.2: só o que a elegibilidade e o e-mail de confirmação usam. Sem isto,
    // todo pedido de reserva lia o hash da senha sem precisar.
    select: { id: true, name: true, email: true, phone: true, emailVerifiedAt: true },
  });

  if (!user) {
    // Pelo painel, o id vem do formulário: cliente apagado não é sessão expirada.
    if (!requireVerifiedContact) {
      throw new AppError('NOT_FOUND', 404, 'Não encontramos este cliente.');
    }

    throw new AppError('UNAUTHORIZED', 401, 'Sua sessão expirou. Entre de novo para continuar.');
  }

  if (!requireVerifiedContact) return user;

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
  now?: Date;
  /**
   * Reserva lançada pelo painel (§9.8).
   *
   * O núcleo é o **mesmo** — constraint de datas, trava de estoque, preço
   * recalculado — e isso não é economia de código: é o marco de zero dupla
   * reserva. Uma segunda implementação para o admin seria um segundo caminho
   * para furar a agenda.
   *
   * O que muda são as exigências de quem pede, e cada uma por um motivo:
   *
   * - **Sem e-mail confirmado nem telefone obrigatório.** A §11.3 exige os dois
   *   do cliente porque é como a chácara o encontra depois; aqui o dono já está
   *   com a pessoa ao telefone, e o cliente pode nem ter e-mail (§9.8).
   * - **Sem limite de pedidos abertos.** `maxPendingPerUser` existe para frear
   *   quem envia pedido em série pelo site; o dono está registrando o que já foi
   *   combinado.
   * - **Pode nascer confirmada**, sem prazo correndo.
   */
  asAdmin?: { confirmed: boolean };
};

export async function createBooking({
  prisma,
  userId,
  body,
  now = new Date(),
  asAdmin,
}: CreateBookingInput): Promise<Booking> {
  const [user, rules] = await Promise.all([
    loadEligibleUser(prisma, userId, { requireVerifiedContact: asAdmin === undefined }),
    loadVenueRules(prisma),
  ]);

  /*
   * Reserva de chácara ocupa a data; reserva de decoração disputa só estoque
   * (T32). Quase toda diferença entre as duas, daqui para baixo, sai deste
   * booleano — e o núcleo transacional continua o mesmo.
   */
  const isVenue = body.kind === 'VENUE';

  // O schema já exigiu o número na chácara; o `?? 0` só existe para o tipo.
  if (isVenue && (body.guestCount ?? 0) > rules.maxGuests) {
    throw fieldError('guestCount', `A chácara recebe até ${rules.maxGuests} pessoas.`);
  }

  /*
   * O mesmo `quoteFromDatabase` que `POST /pricing/quote` usa (§9.7). É isso que
   * garante que o número do resumo e o número gravado na reserva saem da mesma
   * conta — não de duas somas parecidas.
   */
  const quote = await quoteFromDatabase(
    prisma,
    { kind: body.kind, startDate: body.startDate, endDate: body.endDate, items: body.items },
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

  const confirmedByAdmin = asAdmin?.confirmed === true;
  const holdExpiresAt = new Date(now.getTime() + rules.holdHours * 60 * 60 * 1000);
  const expiredHolds: ExpiredHold[] = [];

  const row = await insertWithRetry();

  /*
   * E-mail só depois do commit, e nunca dentro da transação: envio é lento e
   * pode falhar, e a §17 manda a falha não desfazer nada. O `sendMail` já engole
   * o próprio erro.
   */
  await notify({ prisma, row, user, rules, expiredHolds, asAdmin });

  return toBooking(row, { freeCancelUntilDays: rules.freeCancelUntilDays, now });

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
      kind: body.kind,
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
         *
         * Só na chácara, e só pedido de chácara (T32): a constraint não olha
         * decoração, e pedido de decoração vencido não segura nada — o estoque já
         * o ignora pelo prazo. Fechar o registro dele é trabalho do job.
         */
        const expiring = isVenue
          ? await tx.booking.findMany({
              where: {
                kind: 'VENUE',
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
            })
          : [];

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

        if (asAdmin === undefined && openRequests >= rules.maxPendingPerUser) {
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
         * Até a T32, com uma chácara só, esta trava era segunda linha de defesa:
         * duas reservas ativas não compartilhavam dia (§8.1), então conflito de
         * estoque exigia um dia que a constraint já tinha recusado. A reserva só de
         * decoração mudou isso — ela não passa pela constraint, e duas pessoas
         * pedindo o último painel para o mesmo sábado são decididas **aqui**. É a
         * única coisa entre o estoque e uma dupla entrega do mesmo item.
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
         * 5. Bloqueio do admin, do escopo deste produto (T32).
         *
         * A constraint da §8.1 só sabe de reservas; `BlockedDate` é outra tabela.
         * Reservar um dia bloqueado criaria uma festa marcada num dia em que a
         * chácara está fechada. O bloqueio só da decoração não fecha a chácara —
         * ele já zerou o estoque dos itens no passo 4.
         */
        const blocked = await findBlockedDaysIn(tx, body.startDate, body.endDate, body.kind);

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
            kind: body.kind,
            startDate: parseISODate(body.startDate),
            endDate: parseISODate(body.endDate),
            eventType: body.eventType,
            // Decoração não recebe convidados: o número, se veio, não vale (T32).
            guestCount: isVenue ? body.guestCount : null,
            status: confirmedByAdmin ? 'CONFIRMED' : 'PENDING',
            // Reserva confirmada ocupa a data por ser confirmada; deixar o prazo
            // correndo faria o job de expiração cancelá-la (§9.2).
            holdExpiresAt: confirmedByAdmin ? null : holdExpiresAt,
            createdByAdmin: asAdmin !== undefined,
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

/**
 * Para quem vai o aviso de pedido novo (§17).
 *
 * Os endereços vêm dos usuários com papel `ADMIN`, e não de uma variável de
 * ambiente: `ADMIN_EMAIL` só existe para o seed criar a primeira conta, e ficaria
 * desatualizada no dia em que o dono trocar de e-mail pelo painel. `VenueSettings`
 * também não tem campo de notificação (§8).
 */
async function adminRecipients(prisma: PrismaClient): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', email: { not: null } },
    select: { email: true },
  });

  return admins.flatMap((admin) => (admin.email ? [admin.email] : []));
}

/**
 * Avisos da criação (§17).
 *
 * O que sai depende de **quem** criou, e a diferença não é detalhe:
 *
 * - Pedido pelo site: o cliente recebe "recebemos seu pedido" e o dono recebe o
 *   aviso de pedido novo.
 * - Reserva lançada pelo painel: o dono não se avisa do que ele mesmo acabou de
 *   digitar. E o cliente só recebe algo se a reserva já nascer confirmada —
 *   mandar "recebemos seu pedido" para quem não pediu nada confundiria, e um
 *   lançamento que o dono deixou pendente é um rascunho dele.
 */
async function notify({
  prisma,
  row,
  user,
  rules,
  expiredHolds,
  asAdmin,
}: {
  prisma: PrismaClient;
  row: BookingRow;
  user: { name: string; email: string | null; phone: string | null };
  rules: VenueRules;
  expiredHolds: ExpiredHold[];
  asAdmin?: { confirmed: boolean };
}): Promise<void> {
  const dates = formatDateRange(toISODate(row.startDate), toISODate(row.endDate));

  if (asAdmin) {
    if (user.email && row.status === 'CONFIRMED') {
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

      if (settings) {
        await sendMail({
          to: user.email,
          ...bookingConfirmedTemplate({
            name: user.name,
            dates,
            checkInTime: settings.checkInTime,
            checkOutTime: settings.checkOutTime,
            totalFormatted: formatBRL(row.totalCents),
            address: settings.address,
            houseRules: settings.houseRules,
            whatsapp: settings.whatsapp,
            bookingUrl: `${env.APP_URL}/reservas/${row.id}`,
            kind: row.kind,
          }),
        });
      }
    }
  } else {
    if (user.email) {
      await sendMail({
        to: user.email,
        ...bookingReceivedTemplate({
          name: user.name,
          dates,
          totalFormatted: formatBRL(row.totalCents),
          holdHours: rules.holdHours,
          bookingUrl: `${env.APP_URL}/reservas/${row.id}`,
          kind: row.kind,
        }),
      });
    }

    /*
     * O dono precisa saber na hora: o e-mail do cliente diz "aguarde", e o prazo
     * de bloqueio começa a correr agora. Sem este aviso a espera dependeria de
     * alguém abrir o painel por conta própria.
     */
    for (const email of await adminRecipients(prisma)) {
      await sendMail({
        to: email,
        ...newBookingForAdminTemplate({
          customerName: user.name,
          customerPhone: user.phone,
          dates,
          guestCount: row.guestCount,
          totalFormatted: formatBRL(row.totalCents),
          adminUrl: `${env.APP_URL}/admin/reservas/${row.id}`,
          kind: row.kind,
        }),
      });
    }
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

/** Reaproveitado pelo painel da T24. */
export { toBooking };

// ---------------------------------------------------------------------------
// Leitura e cancelamento pelo cliente (§9.2, §11.2)
// ---------------------------------------------------------------------------

/**
 * Minhas reservas (§11.2).
 *
 * Sem paginação: um cliente tem poucas reservas, e paginar criaria estado de
 * página numa tela que a §13.3 descreve como lista agrupada por status.
 *
 * Ordem decrescente por data de início, com o id como desempate para a lista não
 * dançar entre cargas. O agrupamento em "próximas / passadas / canceladas" é da
 * tela (§13.3), que já tem as datas para decidir.
 */
export async function listMyBookings(
  prisma: PrismaClient,
  userId: string,
  now: Date = new Date(),
): Promise<Booking[]> {
  const [rows, rules] = await Promise.all([
    prisma.booking.findMany({
      where: { userId },
      include: { items: true },
      orderBy: [{ startDate: 'desc' }, { id: 'asc' }],
    }),
    loadVenueRules(prisma),
  ]);

  return rows.map((row) => toBooking(row, { freeCancelUntilDays: rules.freeCancelUntilDays, now }));
}

/**
 * Detalhe de uma reserva do próprio cliente.
 *
 * Reserva de outra pessoa responde **404, não 403** (§10.6): 403 confirmaria que
 * aquele id existe, e dá para varrer ids. O filtro por `userId` vai na consulta,
 * então não existe o caminho "carregar e depois conferir o dono".
 */
export async function getMyBooking(
  prisma: PrismaClient,
  userId: string,
  id: string,
  now: Date = new Date(),
): Promise<Booking> {
  const [row, rules] = await Promise.all([
    prisma.booking.findFirst({ where: { id, userId }, include: { items: true } }),
    loadVenueRules(prisma),
  ]);

  if (!row) throw new AppError('NOT_FOUND', 404, 'Não encontramos esta reserva.');

  return toBooking(row, { freeCancelUntilDays: rules.freeCancelUntilDays, now });
}

export type CancelBookingInput = {
  prisma: PrismaClient;
  userId: string;
  id: string;
  reason: string | null;
  now?: Date;
};

/**
 * Cancelamento pelo cliente (§9.2).
 *
 * Duas transições são permitidas, e a diferença entre elas é o prazo:
 *
 * - `PENDING` → `CANCELLED`: **sem restrição**. Nada foi confirmado ainda, e
 *   desistir de um pedido é o mesmo que deixá-lo vencer.
 * - `CONFIRMED` → `CANCELLED`: só até `freeCancelUntilDays` antes do início.
 *   Depois disso a chácara já organizou o dia em volta da reserva, e quem decide
 *   é o dono — a recusa manda falar pelo WhatsApp em vez de fechar a porta.
 *
 * Qualquer outra responde `INVALID_TRANSITION` (§9.2). Cancelar o que já está
 * cancelado também: parece inofensivo, mas trocar `cancelledBy` e `cancelReason`
 * de uma reserva que o **dono** cancelou apagaria o registro de quem cancelou e
 * por quê.
 */
export async function cancelMyBooking({
  prisma,
  userId,
  id,
  reason,
  now = new Date(),
}: CancelBookingInput): Promise<Booking> {
  const current = await prisma.booking.findFirst({
    // §18.2: a decisão usa dois campos. Sem o `select`, esta leitura trazia as
    // duas colunas JSON do instantâneo financeiro para descartá-las em seguida.
    where: { id, userId },
    select: { status: true, startDate: true },
  });

  if (!current) throw new AppError('NOT_FOUND', 404, 'Não encontramos esta reserva.');

  if (current.status === 'CANCELLED') {
    throw new AppError('INVALID_TRANSITION', 422, 'Esta reserva já está cancelada.');
  }

  if (current.status === 'COMPLETED') {
    throw new AppError('INVALID_TRANSITION', 422, 'Esta reserva já aconteceu e não pode mudar.');
  }

  const settings = await prisma.venueSettings.findUnique({
    where: { id: 1 },
    select: { freeCancelUntilDays: true, whatsapp: true },
  });

  if (!settings) {
    throw new AppError('INTERNAL', 500, 'Configuração da chácara não encontrada.');
  }

  const startDate = toISODate(current.startDate);

  // A mesma função que a resposta usa para dizer se o botão aparece (§9.2).
  const permission = cancelPermission(current.status, startDate, settings.freeCancelUntilDays, now);

  if (!permission.canCancel) {
    throw new AppError(
      'CANCEL_WINDOW_CLOSED',
      422,
      settings.whatsapp
        ? `O prazo para cancelar pelo site terminou (até ${settings.freeCancelUntilDays} dias antes). Fale com a chácara pelo WhatsApp ${settings.whatsapp}.`
        : `O prazo para cancelar pelo site terminou (até ${settings.freeCancelUntilDays} dias antes). Fale com a chácara pelo WhatsApp.`,
      { freeCancelUntilDays: settings.freeCancelUntilDays, startDate },
    );
  }

  /*
   * A escrita carrega o status esperado no `WHERE`. Conferir antes e gravar
   * depois deixaria uma janela em que o dono confirma no painel e o cliente
   * cancela como se ainda fosse um pedido — e `updateMany` é o único jeito de
   * pôr status na condição, porque `update` exige chave única.
   */
  const changed = await prisma.booking.updateMany({
    where: { id, userId, status: current.status },
    data: {
      status: 'CANCELLED',
      cancelledBy: 'CLIENT',
      cancelReason: reason,
      // Reserva cancelada não segura mais data nenhuma (§9.2).
      holdExpiresAt: null,
    },
  });

  if (changed.count === 0) {
    throw new AppError(
      'INVALID_TRANSITION',
      422,
      'Esta reserva mudou enquanto você olhava. Recarregue a página.',
    );
  }

  const row = await prisma.booking.findUniqueOrThrow({ where: { id }, include: { items: true } });

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { name: true, email: true },
  });

  // Depois da escrita, nunca dentro dela: falha de envio não desfaz nada (§17).
  if (user.email) {
    await sendMail({
      to: user.email,
      ...bookingCancelledTemplate({
        name: user.name,
        dates: formatDateRange(toISODate(row.startDate), toISODate(row.endDate)),
        reason,
        whatsapp: settings.whatsapp,
        kind: row.kind,
      }),
    });
  }

  return toBooking(row, { freeCancelUntilDays: settings.freeCancelUntilDays, now });
}
