import type {
  AdminFinance,
  AdminFinanceQuery,
  AdminPayment,
  BookingStatus,
  FinancePayment,
  FinanceTotals,
  PaymentDraft,
  PaymentKind,
  PaymentPlan,
  PaymentStatus,
  SavePaymentPlanBody,
} from '@chacara/shared';
import { formatBRL, paymentLabel } from '@chacara/shared';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import type { Db } from '../../lib/db.js';
import { type ISODate, parseISODate, toISODate, todayInSaoPaulo } from '../../lib/dates.js';
import { AppError } from '../../lib/errors.js';
import { monthRange, summarySelect, toSummary } from './overview-service.js';

/**
 * Plano de pagamento das reservas e financeiro do mês (§9.11, §13.4).
 *
 * É anotação do dono, não cobrança: o cliente paga por fora (Pix, dinheiro), e o
 * que mora aqui é quanto vence, quando, e o dia em que o dinheiro entrou. A
 * reserva não muda: o total contratado continua no snapshot dela (§2.1), e o
 * plano só divide esse total no tempo. Por isso a soma tem de bater com ele, ao
 * centavo.
 *
 * A situação de cada recebimento não é coluna. Depende do dia de hoje na chácara
 * (§7.3) e do status da reserva, então é calculada a cada leitura, e por uma
 * função só (`paymentStatus`): o plano da reserva e o financeiro do mês não podem
 * discordar sobre a mesma parcela.
 */

/** Colunas de um recebimento: as mesmas no plano da reserva e no financeiro. */
const paymentSelect = {
  id: true,
  kind: true,
  number: true,
  dueDate: true,
  amountCents: true,
  paidOn: true,
} satisfies Prisma.PaymentSelect;

type PaymentRow = Prisma.PaymentGetPayload<{ select: typeof paymentSelect }>;

/** O que `paymentLabel` precisa saber do plano para dar nome a uma linha. */
type PlanShape = { installments: number; hasDeposit: boolean };

/**
 * Situação de um recebimento (§9.11).
 *
 * A ordem das perguntas é a regra. Dinheiro que entrou está recebido, mesmo que a
 * reserva tenha sido cancelada depois. A parcela em aberto de reserva cancelada
 * deixou de ser cobrada, então não está a receber nem em atraso. Só então o
 * vencimento conta, e o que vence hoje ainda não atrasou: a pessoa tem o dia
 * inteiro para pagar.
 */
export function paymentStatus(
  payment: { dueDate: ISODate; paidOn: ISODate | null },
  bookingStatus: BookingStatus,
  today: ISODate,
): PaymentStatus {
  if (payment.paidOn !== null) return 'PAID';
  if (bookingStatus === 'CANCELLED') return 'CANCELLED';

  // String ISO ordena como data (§7.3), então a comparação de texto basta.
  return payment.dueDate < today ? 'OVERDUE' : 'PENDING';
}

/**
 * Quantas parcelas o plano tem e se tem sinal, contados nas linhas **salvas**.
 *
 * O nome de uma linha depende das outras ("Parcela 2 de 3", "Restante"), então
 * até quem mostra uma linha solta, como o financeiro, precisa do plano inteiro.
 */
function planShapeOf(rows: { kind: PaymentKind }[]): PlanShape {
  return {
    installments: rows.filter((row) => row.kind === 'INSTALLMENT').length,
    hasDeposit: rows.some((row) => row.kind === 'DEPOSIT'),
  };
}

function toAdminPayment(
  row: PaymentRow,
  bookingStatus: BookingStatus,
  shape: PlanShape,
  today: ISODate,
): AdminPayment {
  const dueDate = toISODate(row.dueDate);
  const paidOn = row.paidOn ? toISODate(row.paidOn) : null;

  return {
    id: row.id,
    kind: row.kind,
    number: row.number,
    dueDate,
    amountCents: row.amountCents,
    paidOn,
    status: paymentStatus({ dueDate, paidOn }, bookingStatus, today),
    label: paymentLabel({ kind: row.kind, number: row.number }, shape),
  };
}

function totalOf(payments: { amountCents: number }[]): number {
  return payments.reduce((total, payment) => total + payment.amountCents, 0);
}

function toDateOrNull(value: ISODate | null): Date | null {
  return value === null ? null : parseISODate(value);
}

function bookingNotFound(): AppError {
  return new AppError('NOT_FOUND', 404, 'Não encontramos esta reserva.');
}

function paymentNotFound(): AppError {
  return new AppError('NOT_FOUND', 404, 'Não encontramos este recebimento.');
}

/**
 * Recebimento anotado num dia que ainda não chegou.
 *
 * Sem `details.fields`: a regra vale para qualquer linha do plano, e o painel
 * mostra a recusa no topo do formulário em vez de ao lado de um campo.
 */
function futurePaymentError(): AppError {
  return new AppError(
    'VALIDATION_ERROR',
    400,
    'A data do recebimento não pode ser depois de hoje.',
  );
}

// ---------------------------------------------------------------------------
// Plano de uma reserva
// ---------------------------------------------------------------------------

const planSelect = {
  id: true,
  status: true,
  totalCents: true,
  // Pelo número, o sinal (0) vem primeiro e as parcelas seguem pelo vencimento.
  payments: { select: paymentSelect, orderBy: { number: 'asc' } },
} satisfies Prisma.BookingSelect;

type PlanRow = Prisma.BookingGetPayload<{ select: typeof planSelect }>;

function toPaymentPlan(row: PlanRow, today: ISODate): PaymentPlan {
  const shape = planShapeOf(row.payments);
  const payments = row.payments.map((payment) => toAdminPayment(payment, row.status, shape, today));
  const totalWith = (...statuses: PaymentStatus[]) =>
    totalOf(payments.filter((payment) => statuses.includes(payment.status)));

  return {
    bookingId: row.id,
    totalCents: row.totalCents,
    payments,
    paidCents: totalWith('PAID'),
    pendingCents: totalWith('PENDING', 'OVERDUE'),
    overdueCents: totalWith('OVERDUE'),
    // A cancelada deixou de ser cobrada. O que ainda cabe nela é anotar o que já
    // entrou, e isso é o `markPayment`, que mexe numa linha só.
    canEdit: row.status !== 'CANCELLED',
    // Excluir um plano com recebimento apagaria o registro de dinheiro que entrou.
    canDelete: payments.length > 0 && payments.every((payment) => payment.paidOn === null),
  };
}

/** O plano como a API o devolve. Aceita a transação, para quem acabou de gravar. */
async function loadPaymentPlan(db: Db, bookingId: string, today: ISODate): Promise<PaymentPlan> {
  const row = await db.booking.findUnique({ where: { id: bookingId }, select: planSelect });

  if (!row) throw bookingNotFound();

  return toPaymentPlan(row, today);
}

export async function getPaymentPlan(
  prisma: PrismaClient,
  bookingId: string,
  now: Date = new Date(),
): Promise<PaymentPlan> {
  return loadPaymentPlan(prisma, bookingId, todayInSaoPaulo(now));
}

/**
 * Trava a linha da reserva até o fim da transação.
 *
 * A reserva é o mutex do plano dela, e todo caminho que grava recebimentos passa
 * por aqui primeiro. Sem a trava, dois salvamentos ao mesmo tempo apagariam as
 * linhas antigas cada um por si, e o segundo a inserir bateria no índice único de
 * (`bookingId`, `number`): um 500 no lugar de "o último vence". E um recebimento
 * anotado no meio de uma exclusão seria apagado junto com o plano.
 */
async function lockBooking(tx: Prisma.TransactionClient, bookingId: string): Promise<void> {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Booking" WHERE id = ${bookingId} FOR UPDATE
  `;

  if (locked.length === 0) throw bookingNotFound();
}

function paymentData(
  bookingId: string,
  kind: PaymentKind,
  number: number,
  draft: PaymentDraft,
): Prisma.PaymentCreateManyInput {
  return {
    bookingId,
    kind,
    number,
    dueDate: parseISODate(draft.dueDate),
    amountCents: draft.amountCents,
    paidOn: toDateOrNull(draft.paidOn),
  };
}

function byDueDate(a: PaymentDraft, b: PaymentDraft): number {
  if (a.dueDate === b.dueDate) return 0;

  return a.dueDate < b.dueDate ? -1 : 1;
}

/**
 * Salva o plano inteiro, no lugar do anterior (§9.11).
 *
 * As linhas da reserva são trocadas numa transação, sem casar uma a uma pelo id.
 * Um recebimento já anotado volta no corpo com o `paidOn`, então trocar a linha
 * não o perde.
 *
 * Vale para pedido aguardando confirmação, reserva confirmada e concluída: o
 * sinal costuma vir antes da confirmação, e o restante pode entrar depois da
 * festa. Só a cancelada fica de fora, porque deixou de ser cobrada.
 */
export async function savePaymentPlan(
  prisma: PrismaClient,
  bookingId: string,
  body: SavePaymentPlanBody,
  now: Date = new Date(),
): Promise<PaymentPlan> {
  const today = todayInSaoPaulo(now);

  return prisma.$transaction(async (tx) => {
    await lockBooking(tx, bookingId);

    const booking = await tx.booking.findUniqueOrThrow({
      where: { id: bookingId },
      select: { status: true, totalCents: true },
    });

    if (booking.status === 'CANCELLED') {
      throw new AppError(
        'PAYMENT_PLAN_LOCKED',
        422,
        'Esta reserva foi cancelada: o plano de pagamento não pode mais ser alterado.',
      );
    }

    const drafts = body.deposit ? [body.deposit, ...body.installments] : body.installments;

    if (drafts.some((draft) => draft.paidOn !== null && draft.paidOn > today)) {
      throw futurePaymentError();
    }

    /*
     * Ao centavo, e contra o snapshot da reserva (§2.1): o plano divide o total
     * contratado, não o redefine. Somando menos, sobraria dinheiro sem data para
     * cobrar; somando mais, o dono cobraria o que não foi contratado.
     */
    const sumCents = totalOf(drafts);

    if (sumCents !== booking.totalCents) {
      throw new AppError(
        'VALIDATION_ERROR',
        400,
        `A soma do sinal e das parcelas (${formatBRL(sumCents)}) precisa ser igual ao total da reserva (${formatBRL(booking.totalCents)}).`,
        { totalCents: booking.totalCents, sumCents },
      );
    }

    /*
     * Numeradas pelo vencimento, venham na ordem que vierem. O `sort` é estável
     * desde o ES2019, então duas parcelas no mesmo dia ficam na ordem em que o
     * dono as digitou.
     */
    const installments = [...body.installments].sort(byDueDate);

    await tx.payment.deleteMany({ where: { bookingId } });
    await tx.payment.createMany({
      data: [
        ...(body.deposit ? [paymentData(bookingId, 'DEPOSIT', 0, body.deposit)] : []),
        ...installments.map((draft, index) =>
          paymentData(bookingId, 'INSTALLMENT', index + 1, draft),
        ),
      ],
    });

    return loadPaymentPlan(tx, bookingId, today);
  });
}

/**
 * Registra (`paidOn` com o dia) ou desfaz (`null`) um recebimento (§9.11).
 *
 * Mexe numa linha só: mandar o plano inteiro para anotar um Pix arriscaria
 * desfazer o que outra aba acabou de salvar.
 *
 * Vale em reserva de qualquer status, inclusive cancelada. O sinal que entrou
 * antes do cancelamento precisa poder ser anotado, porque o dinheiro está com o
 * dono.
 */
export async function markPayment(
  prisma: PrismaClient,
  paymentId: string,
  paidOn: ISODate | null,
  now: Date = new Date(),
): Promise<PaymentPlan> {
  const today = todayInSaoPaulo(now);

  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      select: { bookingId: true },
    });

    if (!payment) throw paymentNotFound();

    if (paidOn !== null && paidOn > today) throw futurePaymentError();

    await lockBooking(tx, payment.bookingId);

    /*
     * Com a trava na mão, a linha pode não existir mais: um salvamento que estava
     * na frente trocou o plano. `updateMany` conta o que gravou, e isso vira 404
     * em vez do erro interno que o `update` levantaria.
     */
    const changed = await tx.payment.updateMany({
      where: { id: paymentId },
      data: { paidOn: toDateOrNull(paidOn) },
    });

    if (changed.count === 0) throw paymentNotFound();

    return loadPaymentPlan(tx, payment.bookingId, today);
  });
}

/**
 * Exclui o plano de uma reserva (§9.11).
 *
 * Só sem recebimento anotado: excluir apagaria o registro de dinheiro que entrou.
 * Quem anotou por engano desfaz o recebimento antes, e a recusa diz isso.
 *
 * Reserva sem plano responde do mesmo jeito que a com plano: o resultado pedido
 * (não ter plano) já é o atual.
 */
export async function deletePaymentPlan(prisma: PrismaClient, bookingId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockBooking(tx, bookingId);

    const received = await tx.payment.count({ where: { bookingId, paidOn: { not: null } } });

    if (received > 0) {
      throw new AppError(
        'PAYMENT_PLAN_LOCKED',
        422,
        'Há recebimentos registrados neste plano. Desfaça-os antes de excluir.',
      );
    }

    await tx.payment.deleteMany({ where: { bookingId } });
  });
}

// ---------------------------------------------------------------------------
// Financeiro do mês
// ---------------------------------------------------------------------------

/** Cada recebimento com a reserva de onde vem, como as listas do financeiro mostram. */
const financePaymentSelect = {
  ...paymentSelect,
  booking: {
    select: {
      id: true,
      kind: true,
      startDate: true,
      endDate: true,
      status: true,
      totalCents: true,
      user: { select: { id: true, name: true, email: true, phone: true } },
      // As outras linhas da reserva dão o nome desta (`planShapeOf`).
      payments: { select: { kind: true } },
    },
  },
} satisfies Prisma.PaymentSelect;

type FinancePaymentRow = Prisma.PaymentGetPayload<{ select: typeof financePaymentSelect }>;

/**
 * Por vencimento; no mesmo dia, pela festa que acontece antes; na mesma reserva,
 * pelo número. O id só desempata, para a lista não dançar entre cargas.
 */
const financeOrder: Prisma.PaymentOrderByWithRelationInput[] = [
  { dueDate: 'asc' },
  { booking: { startDate: 'asc' } },
  { number: 'asc' },
  { id: 'asc' },
];

/** Reserva que ainda é cobrada: a cancelada só conta pelo que já entrou. */
const chargedBooking: Prisma.PaymentWhereInput = { booking: { status: { not: 'CANCELLED' } } };

function toFinancePayment(row: FinancePaymentRow, today: ISODate): FinancePayment {
  const { booking } = row;

  return {
    ...toAdminPayment(row, booking.status, planShapeOf(booking.payments), today),
    booking: {
      id: booking.id,
      kind: booking.kind,
      startDate: toISODate(booking.startDate),
      endDate: toISODate(booking.endDate),
      status: booking.status,
      totalCents: booking.totalCents,
      customer: {
        id: booking.user.id,
        name: booking.user.name,
        email: booking.user.email,
        phone: booking.user.phone,
      },
    },
  };
}

function totalsOf(payments: FinancePayment[]): FinanceTotals {
  const paidCents = totalOf(payments.filter((payment) => payment.status === 'PAID'));
  const pendingCents = totalOf(payments.filter((payment) => payment.status !== 'PAID'));

  return { dueCents: paidCents + pendingCents, paidCents, pendingCents };
}

/**
 * O financeiro de um mês (§9.11, §13.4).
 *
 * Os valores do mês contam pelo **vencimento**, não pelo dia em que o dinheiro
 * entrou: a pergunta do dono é "quanto eu tenho para receber em dezembro", e a
 * parcela de dezembro paga em novembro faz parte da resposta. A parcela em aberto
 * de reserva cancelada não entra em nada; a recebida continua contando, porque o
 * dinheiro entrou.
 *
 * Os atrasados são de **todos** os meses. O mês aberto é o que o dono escolheu
 * ver, e uma parcela de agosto esquecida continua sendo dinheiro a cobrar em
 * novembro.
 */
export async function getAdminFinance(
  prisma: PrismaClient,
  { month }: AdminFinanceQuery,
  now: Date = new Date(),
): Promise<AdminFinance> {
  const today = todayInSaoPaulo(now);
  const { from, to } = monthRange(month);

  const [monthRows, overdueRows, unplannedRows] = await Promise.all([
    prisma.payment.findMany({
      where: {
        dueDate: { gte: parseISODate(from), lte: parseISODate(to) },
        OR: [{ paidOn: { not: null } }, chargedBooking],
      },
      select: financePaymentSelect,
      orderBy: financeOrder,
    }),

    prisma.payment.findMany({
      where: { paidOn: null, dueDate: { lt: parseISODate(today) }, ...chargedBooking },
      select: financePaymentSelect,
      orderBy: financeOrder,
    }),

    /*
     * Reserva fechada que ainda não tem nenhuma linha: é o que o dono não anotou.
     * O pedido aguardando confirmação fica de fora porque pode não virar festa, e
     * a reserva de valor zero não tem o que cobrar.
     */
    prisma.booking.findMany({
      where: {
        status: { in: ['CONFIRMED', 'COMPLETED'] },
        startDate: { gte: parseISODate(from), lte: parseISODate(to) },
        totalCents: { gt: 0 },
        payments: { none: {} },
      },
      select: summarySelect,
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
    }),
  ]);

  const payments = monthRows.map((row) => toFinancePayment(row, today));
  const overdue = overdueRows.map((row) => toFinancePayment(row, today));

  // A consulta já vem por vencimento, e o `Map` guarda a ordem de inserção: os
  // dias saem em ordem sem ordenar de novo.
  const byDay = new Map<ISODate, FinancePayment[]>();
  for (const payment of payments) {
    const list = byDay.get(payment.dueDate);
    if (list) list.push(payment);
    else byDay.set(payment.dueDate, [payment]);
  }

  return {
    month,
    summary: totalsOf(payments),
    days: [...byDay].map(([date, list]) => {
      const totals = totalsOf(list);

      return {
        date,
        count: list.length,
        ...totals,
        overdue: date < today && totals.pendingCents > 0,
      };
    }),
    payments,
    overdue: { totalCents: totalOf(overdue), payments: overdue },
    unplanned: unplannedRows.map(toSummary),
  };
}
