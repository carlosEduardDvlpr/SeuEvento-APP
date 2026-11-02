import type { FastifyInstance } from 'fastify';
import type { AdminFinance, BookingStatus, PaymentPlan } from '@chacara/shared';
import { MAX_INSTALLMENTS, formatBRL } from '@chacara/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { addDays, todayInSaoPaulo } from '../src/lib/dates.js';
import { paymentStatus } from '../src/modules/admin/finance-service.js';
import { prisma, truncateAll } from './helpers/db.js';
import { createBooking, createUser } from './helpers/factories.js';

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

/** Uma linha do plano como o painel a envia. */
const row = (dueDate: string, amountCents: number, paidOn: string | null = null) => ({
  dueDate,
  amountCents,
  paidOn,
});

/**
 * Plano de pagamento e financeiro do painel (§9.11, §11.2, §13.4).
 *
 * Sob teste: a soma do plano bate com o total da reserva ao centavo, as parcelas
 * são numeradas pelo vencimento, a situação de cada linha sai do dia de hoje e do
 * status da reserva, e o financeiro do mês conta pelo vencimento.
 *
 * As datas ficam longe de hoje para o resultado não depender do dia em que a
 * suíte roda: 2020 é sempre passado (vencido) e 2030 é sempre futuro (a
 * receber). Um mês com os dois casos mudaria de resposta conforme o dia. O dia
 * do recebimento, que não pode ser futuro, é hoje ou um dia de 2020.
 */
describe('plano de pagamento e financeiro', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let clientToken: string;
  let clientId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll();

    const admin = await createUser({ email: 'dono@chacara.local', role: 'ADMIN' });
    adminToken = app.jwt.sign({ sub: admin.id, role: admin.role });

    const client = await createUser({
      name: 'Ana Beatriz',
      email: 'ana@exemplo.com',
      phone: '11988887777',
    });
    clientId = client.id;
    clientToken = app.jwt.sign({ sub: client.id, role: client.role });
  });

  function send(
    method: 'GET' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    payload?: object,
    token = adminToken,
  ) {
    return app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${token}` },
      ...(payload === undefined ? {} : { payload }),
    });
  }

  const getPlan = (bookingId: string) => send('GET', `/api/admin/bookings/${bookingId}/payments`);

  const savePlan = (bookingId: string, body: object, token = adminToken) =>
    send('PUT', `/api/admin/bookings/${bookingId}/payments`, body, token);

  const deletePlan = (bookingId: string) =>
    send('DELETE', `/api/admin/bookings/${bookingId}/payments`);

  const mark = (paymentId: string, paidOn: string | null) =>
    send('PATCH', `/api/admin/payments/${paymentId}`, { paidOn });

  const finance = (month: string) => send('GET', `/api/admin/finance?month=${month}`);

  /**
   * Reserva de um dia com o valor que o plano divide. Cada teste usa dias
   * diferentes: a §8.1 não deixa duas reservas ativas da chácara no mesmo dia.
   */
  function booking(startDate: string, totalCents: number, status: BookingStatus = 'CONFIRMED') {
    return createBooking({ userId: clientId, startDate, endDate: startDate, status, totalCents });
  }

  /** Salva o plano e o devolve, falhando ali mesmo se a API recusar. */
  async function planOf(bookingId: string, body: object): Promise<PaymentPlan> {
    const response = await savePlan(bookingId, body);

    expect(response.statusCode).toBe(200);

    return response.json<PaymentPlan>();
  }

  /** Direto no banco: o `PATCH` de status manda e-mail, que não está sob teste aqui. */
  function cancel(bookingId: string) {
    return prisma.booking.update({ where: { id: bookingId }, data: { status: 'CANCELLED' } });
  }

  // ------------------------------------------------------------------ acesso

  it('recusa quem não está logado', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/admin/finance?month=2030-03' });

    expect(response.statusCode).toBe(401);
  });

  it('recusa quem não é admin', async () => {
    const created = await booking('2030-03-20', 100000);

    const response = await savePlan(
      created.id,
      { installments: [row('2030-03-20', 100000)] },
      clientToken,
    );

    expect(response.statusCode).toBe(403);
    expect(await prisma.payment.count()).toBe(0);
  });

  // ----------------------------------------------------------- paymentStatus

  describe('paymentStatus', () => {
    const today = '2026-11-02';

    it('o que entrou está recebido, mesmo em reserva cancelada', () => {
      expect(
        paymentStatus({ dueDate: '2026-10-01', paidOn: '2026-10-01' }, 'CONFIRMED', today),
      ).toBe('PAID');
      expect(
        paymentStatus({ dueDate: '2026-12-01', paidOn: '2026-10-01' }, 'CANCELLED', today),
      ).toBe('PAID');
    });

    it('o que não entrou de reserva cancelada deixou de ser cobrado, vencido ou não', () => {
      expect(paymentStatus({ dueDate: '2026-10-01', paidOn: null }, 'CANCELLED', today)).toBe(
        'CANCELLED',
      );
      expect(paymentStatus({ dueDate: '2026-12-01', paidOn: null }, 'CANCELLED', today)).toBe(
        'CANCELLED',
      );
    });

    /* A pessoa tem o dia do vencimento inteiro para pagar. */
    it('atrasa só depois do dia do vencimento', () => {
      expect(paymentStatus({ dueDate: '2026-11-01', paidOn: null }, 'CONFIRMED', today)).toBe(
        'OVERDUE',
      );
      expect(paymentStatus({ dueDate: today, paidOn: null }, 'CONFIRMED', today)).toBe('PENDING');
      expect(paymentStatus({ dueDate: '2026-11-03', paidOn: null }, 'PENDING', today)).toBe(
        'PENDING',
      );
    });
  });

  // ------------------------------------------------------------------ leitura

  describe('GET /admin/bookings/:id/payments', () => {
    it('reserva sem plano devolve o plano vazio', async () => {
      const created = await booking('2030-03-20', 300000);

      const response = await getPlan(created.id);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        bookingId: created.id,
        totalCents: 300000,
        payments: [],
        paidCents: 0,
        pendingCents: 0,
        overdueCents: 0,
        canEdit: true,
        canDelete: false,
      });
    });

    it('responde 404 para reserva que não existe', async () => {
      const response = await getPlan(UNKNOWN_ID);

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('NOT_FOUND');
    });
  });

  // --------------------------------------------------------------- salvamento

  describe('PUT /admin/bookings/:id/payments', () => {
    it('numera as parcelas pelo vencimento e dá a situação de cada uma', async () => {
      const created = await booking('2030-03-20', 300000);
      const paidOn = todayInSaoPaulo();

      const response = await savePlan(created.id, {
        deposit: row('2020-01-05', 100000, paidOn),
        // Fora de ordem de propósito: a que vence depois vem primeiro.
        installments: [row('2030-03-10', 120000), row('2020-02-10', 80000)],
      });

      expect(response.statusCode).toBe(200);

      const plan = response.json<PaymentPlan>();

      expect(plan.payments).toMatchObject([
        {
          kind: 'DEPOSIT',
          number: 0,
          dueDate: '2020-01-05',
          amountCents: 100000,
          paidOn,
          label: 'Sinal',
          status: 'PAID',
        },
        {
          kind: 'INSTALLMENT',
          number: 1,
          dueDate: '2020-02-10',
          amountCents: 80000,
          paidOn: null,
          label: 'Parcela 1 de 2',
          status: 'OVERDUE',
        },
        {
          kind: 'INSTALLMENT',
          number: 2,
          dueDate: '2030-03-10',
          amountCents: 120000,
          paidOn: null,
          label: 'Parcela 2 de 2',
          status: 'PENDING',
        },
      ]);
      expect(plan).toMatchObject({
        bookingId: created.id,
        totalCents: 300000,
        paidCents: 100000,
        pendingCents: 200000,
        overdueCents: 80000,
        canEdit: true,
        canDelete: false,
      });
      // A resposta do salvamento é o plano como a leitura o devolve.
      expect((await getPlan(created.id)).json()).toEqual(plan);
    });

    /* "Parcela 1 de 1" não é como ninguém fala. */
    it('chama a parcela única de à vista sem sinal, e de restante depois dele', async () => {
      const single = await booking('2030-03-20', 200000);
      const split = await booking('2030-03-21', 200000);

      const alone = await planOf(single.id, { installments: [row('2030-03-20', 200000)] });
      const after = await planOf(split.id, {
        deposit: row('2030-03-01', 50000),
        installments: [row('2030-03-21', 150000)],
      });

      expect(alone.payments.map((payment) => payment.label)).toEqual(['À vista']);
      expect(after.payments.map((payment) => payment.label)).toEqual(['Sinal', 'Restante']);
    });

    /* O número vai de 0 a 12 por CHECK no banco: o máximo do contrato tem de caber. */
    it(`aceita o sinal e ${MAX_INSTALLMENTS} parcelas`, async () => {
      const created = await booking('2030-03-20', 100 * (MAX_INSTALLMENTS + 1));
      const installments = Array.from({ length: MAX_INSTALLMENTS }, (_, index) =>
        row(addDays('2030-03-01', index), 100),
      );

      const plan = await planOf(created.id, { deposit: row('2030-02-01', 100), installments });

      expect(plan.payments.map((payment) => payment.number)).toEqual(
        Array.from({ length: MAX_INSTALLMENTS + 1 }, (_, index) => index),
      );
      expect(plan.payments.at(-1)?.label).toBe(
        `Parcela ${MAX_INSTALLMENTS} de ${MAX_INSTALLMENTS}`,
      );
    });

    it(`recusa mais de ${MAX_INSTALLMENTS} parcelas`, async () => {
      const created = await booking('2030-03-20', 100 * (MAX_INSTALLMENTS + 1));
      const installments = Array.from({ length: MAX_INSTALLMENTS + 1 }, (_, index) =>
        row(addDays('2030-03-01', index), 100),
      );

      const response = await savePlan(created.id, { installments });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      expect(await prisma.payment.count()).toBe(0);
    });

    it('troca o plano anterior inteiro', async () => {
      const created = await booking('2030-03-20', 300000);
      const first = await planOf(created.id, {
        deposit: row('2030-03-01', 100000),
        installments: [row('2030-03-10', 100000), row('2030-03-20', 100000)],
      });

      const second = await planOf(created.id, { installments: [row('2030-03-20', 300000)] });

      expect(second.payments).toMatchObject([
        { kind: 'INSTALLMENT', number: 1, amountCents: 300000, label: 'À vista' },
      ]);
      // As linhas antigas saíram do banco, não só da resposta.
      expect(await prisma.payment.count({ where: { bookingId: created.id } })).toBe(1);
      expect(
        await prisma.payment.count({
          where: { id: { in: first.payments.map((payment) => payment.id) } },
        }),
      ).toBe(0);
    });

    it('recusa soma diferente do total e deixa o plano anterior como estava', async () => {
      const created = await booking('2030-03-20', 300000);
      const before = await planOf(created.id, { installments: [row('2030-03-20', 300000)] });

      const response = await savePlan(created.id, {
        deposit: row('2030-03-01', 100000),
        installments: [row('2030-03-20', 150000)],
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toEqual({
        code: 'VALIDATION_ERROR',
        message: `A soma do sinal e das parcelas (${formatBRL(250000)}) precisa ser igual ao total da reserva (${formatBRL(300000)}).`,
        details: { totalCents: 300000, sumCents: 250000 },
      });
      expect((await getPlan(created.id)).json()).toEqual(before);
    });

    it('recusa recebimento depois de hoje, no sinal ou numa parcela', async () => {
      const created = await booking('2030-03-20', 300000);
      const tomorrow = addDays(todayInSaoPaulo(), 1);

      const onDeposit = await savePlan(created.id, {
        deposit: row('2030-03-01', 100000, tomorrow),
        installments: [row('2030-03-20', 200000)],
      });
      const onInstallment = await savePlan(created.id, {
        installments: [row('2030-03-20', 300000, tomorrow)],
      });

      for (const response of [onDeposit, onInstallment]) {
        expect(response.statusCode).toBe(400);
        // Sem `details`: o painel mostra a recusa no topo do formulário.
        expect(response.json().error).toEqual({
          code: 'VALIDATION_ERROR',
          message: 'A data do recebimento não pode ser depois de hoje.',
        });
      }
      expect(await prisma.payment.count()).toBe(0);
    });

    it('recusa plano de reserva cancelada', async () => {
      const created = await booking('2030-03-20', 300000, 'CANCELLED');

      const response = await savePlan(created.id, { installments: [row('2030-03-20', 300000)] });

      expect(response.statusCode).toBe(422);
      expect(response.json().error).toMatchObject({
        code: 'PAYMENT_PLAN_LOCKED',
        message: 'Esta reserva foi cancelada: o plano de pagamento não pode mais ser alterado.',
      });
      expect(await prisma.payment.count()).toBe(0);
    });

    /* O sinal costuma vir antes da confirmação, e o restante pode entrar depois da festa. */
    it('aceita plano de pedido aguardando confirmação e de reserva concluída', async () => {
      const pending = await booking('2030-03-20', 300000, 'PENDING');
      const completed = await booking('2020-01-20', 300000, 'COMPLETED');

      const forPending = await savePlan(pending.id, {
        installments: [row('2030-03-20', 300000)],
      });
      const forCompleted = await savePlan(completed.id, {
        installments: [row('2020-01-20', 300000, '2020-01-20')],
      });

      expect(forPending.statusCode).toBe(200);
      expect(forCompleted.statusCode).toBe(200);
      expect(forCompleted.json<PaymentPlan>().payments[0]?.status).toBe('PAID');
    });

    it('responde 404 para reserva que não existe', async () => {
      const response = await savePlan(UNKNOWN_ID, { installments: [row('2030-03-20', 300000)] });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('NOT_FOUND');
    });

    /*
     * Sem a trava da reserva, cada salvamento apagaria as linhas antigas por conta
     * própria, e o segundo a inserir bateria no índice único de
     * (`bookingId`, `number`) com erro interno.
     *
     * São cinco, e não dois, porque o primeiro costuma usar a conexão que já está
     * aberta e terminar antes de os outros conseguirem a deles: com dois, a
     * corrida quase nunca acontece, e o teste passaria mesmo sem a trava.
     */
    it('salvamentos ao mesmo tempo terminam todos, e o último vence', async () => {
      const created = await booking('2030-03-20', 300000);
      const plans = [1, 2, 3, 4, 5].map((count) => ({
        installments: Array.from({ length: count }, (_, index) =>
          row(addDays('2030-03-01', index), 300000 / count),
        ),
      }));

      const responses = await Promise.all(plans.map((plan) => savePlan(created.id, plan)));

      expect(responses.map((response) => response.statusCode)).toEqual([200, 200, 200, 200, 200]);

      const final = (await getPlan(created.id)).json<PaymentPlan>();

      expect(responses.map((response) => response.json<PaymentPlan>())).toContainEqual(final);
    });
  });

  // -------------------------------------------------------------- recebimento

  describe('PATCH /admin/payments/:id', () => {
    it('registra e desfaz um recebimento', async () => {
      const created = await booking('2030-03-20', 300000);
      const saved = await planOf(created.id, {
        deposit: row('2030-03-01', 100000),
        installments: [row('2030-03-20', 200000)],
      });
      const depositId = saved.payments[0]!.id;
      const paidOn = todayInSaoPaulo();

      const marked = await mark(depositId, paidOn);

      expect(marked.statusCode).toBe(200);
      expect(marked.json<PaymentPlan>().payments[0]).toMatchObject({
        id: depositId,
        paidOn,
        status: 'PAID',
      });
      expect(marked.json()).toMatchObject({
        paidCents: 100000,
        pendingCents: 200000,
        canDelete: false,
      });

      const undone = await mark(depositId, null);

      expect(undone.statusCode).toBe(200);
      expect(undone.json<PaymentPlan>().payments[0]).toMatchObject({
        id: depositId,
        paidOn: null,
        status: 'PENDING',
      });
      expect(undone.json()).toMatchObject({ paidCents: 0, pendingCents: 300000, canDelete: true });
    });

    it('recusa recebimento depois de hoje', async () => {
      const created = await booking('2030-03-20', 300000);
      const saved = await planOf(created.id, { installments: [row('2030-03-20', 300000)] });
      const id = saved.payments[0]!.id;

      const response = await mark(id, addDays(todayInSaoPaulo(), 1));

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'A data do recebimento não pode ser depois de hoje.',
      });
      expect((await prisma.payment.findUniqueOrThrow({ where: { id } })).paidOn).toBeNull();
    });

    it('responde 404 para recebimento que não existe', async () => {
      const response = await mark(UNKNOWN_ID, todayInSaoPaulo());

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('NOT_FOUND');
    });

    /*
     * O sinal que entrou antes do cancelamento precisa poder ser anotado. O resto
     * deixou de ser cobrado: nem a receber, nem em atraso, mesmo já vencido.
     */
    it('anota recebimento de reserva cancelada, que deixa de cobrar o resto', async () => {
      const created = await booking('2020-01-20', 300000);
      const saved = await planOf(created.id, {
        deposit: row('2020-01-05', 100000),
        installments: [row('2020-01-15', 200000)],
      });
      await cancel(created.id);

      const response = await mark(saved.payments[0]!.id, '2020-01-05');

      expect(response.statusCode).toBe(200);

      const plan = response.json<PaymentPlan>();

      expect(plan.payments.map((payment) => payment.status)).toEqual(['PAID', 'CANCELLED']);
      expect(plan).toMatchObject({
        paidCents: 100000,
        pendingCents: 0,
        overdueCents: 0,
        canEdit: false,
        canDelete: false,
      });
      expect((await getPlan(created.id)).json()).toEqual(plan);
    });
  });

  // ----------------------------------------------------------------- exclusão

  describe('DELETE /admin/bookings/:id/payments', () => {
    it('exclui o plano sem recebimento', async () => {
      const created = await booking('2030-03-20', 300000);
      await planOf(created.id, {
        deposit: row('2030-03-01', 100000),
        installments: [row('2030-03-20', 200000)],
      });

      const response = await deletePlan(created.id);

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');
      expect(await prisma.payment.count({ where: { bookingId: created.id } })).toBe(0);
      expect((await getPlan(created.id)).json()).toMatchObject({ payments: [], canDelete: false });
    });

    /* O resultado pedido, não ter plano, já é o atual. */
    it('excluir o plano de reserva que não tem plano não é erro', async () => {
      const created = await booking('2030-03-20', 300000);

      expect((await deletePlan(created.id)).statusCode).toBe(204);
    });

    it('recusa excluir plano com recebimento anotado', async () => {
      const created = await booking('2030-03-20', 300000);
      await planOf(created.id, {
        deposit: row('2030-03-01', 100000, todayInSaoPaulo()),
        installments: [row('2030-03-20', 200000)],
      });

      const response = await deletePlan(created.id);

      expect(response.statusCode).toBe(422);
      expect(response.json().error).toMatchObject({
        code: 'PAYMENT_PLAN_LOCKED',
        message: 'Há recebimentos registrados neste plano. Desfaça-os antes de excluir.',
      });
      expect(await prisma.payment.count({ where: { bookingId: created.id } })).toBe(2);
    });

    it('responde 404 para reserva que não existe', async () => {
      const response = await deletePlan(UNKNOWN_ID);

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('NOT_FOUND');
    });
  });

  // --------------------------------------------------------------- financeiro

  describe('GET /admin/finance', () => {
    it('mês sem nada devolve tudo zerado', async () => {
      const response = await finance('2030-03');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        month: '2030-03',
        summary: { dueCents: 0, paidCents: 0, pendingCents: 0 },
        days: [],
        payments: [],
        overdue: { totalCents: 0, payments: [] },
        unplanned: [],
      });
      // O dono está conferindo o que cobrar: nada de resposta guardada.
      expect(response.headers['cache-control']).toBeUndefined();
    });

    it('soma o mês pelo vencimento e agrupa por dia', async () => {
      const paidOn = todayInSaoPaulo();
      // Criada primeiro, mas com a festa depois: no mesmo vencimento, vem depois.
      const later = await booking('2030-03-25', 50000);
      const sooner = await booking('2030-03-20', 300000);

      await planOf(later.id, { installments: [row('2030-03-15', 50000)] });
      await planOf(sooner.id, {
        deposit: row('2030-03-05', 100000, paidOn),
        installments: [row('2030-03-15', 100000), row('2030-04-15', 100000)],
      });

      const body = (await finance('2030-03')).json<AdminFinance>();

      expect(body.month).toBe('2030-03');
      expect(body.summary).toEqual({ dueCents: 250000, paidCents: 100000, pendingCents: 150000 });
      expect(body.days).toEqual([
        {
          date: '2030-03-05',
          count: 1,
          dueCents: 100000,
          paidCents: 100000,
          pendingCents: 0,
          overdue: false,
        },
        {
          date: '2030-03-15',
          count: 2,
          dueCents: 150000,
          paidCents: 0,
          pendingCents: 150000,
          overdue: false,
        },
      ]);
      // A parcela de abril fica para abril.
      expect(
        body.payments.map((payment) => [
          payment.dueDate,
          payment.booking.id,
          payment.label,
          payment.status,
        ]),
      ).toEqual([
        ['2030-03-05', sooner.id, 'Sinal', 'PAID'],
        ['2030-03-15', sooner.id, 'Parcela 1 de 2', 'PENDING'],
        ['2030-03-15', later.id, 'À vista', 'PENDING'],
      ]);
      expect(body.payments[0]).toMatchObject({ paidOn, amountCents: 100000 });
      expect(body.payments[2]?.booking).toEqual({
        id: later.id,
        kind: 'VENUE',
        startDate: '2030-03-25',
        endDate: '2030-03-25',
        status: 'CONFIRMED',
        totalCents: 50000,
        customer: {
          id: clientId,
          name: 'Ana Beatriz',
          email: 'ana@exemplo.com',
          phone: '11988887777',
        },
      });
      expect(body.overdue).toEqual({ totalCents: 0, payments: [] });
    });

    it('deixa fora o que não foi pago de reserva cancelada, mas conta o que ela pagou', async () => {
      const created = await booking('2030-03-28', 80000);
      await planOf(created.id, {
        deposit: row('2030-03-10', 30000, todayInSaoPaulo()),
        installments: [row('2030-03-12', 50000)],
      });
      await cancel(created.id);

      const body = (await finance('2030-03')).json<AdminFinance>();

      expect(body.payments).toHaveLength(1);
      expect(body.payments[0]).toMatchObject({
        kind: 'DEPOSIT',
        amountCents: 30000,
        status: 'PAID',
        booking: { id: created.id, status: 'CANCELLED' },
      });
      expect(body.summary).toEqual({ dueCents: 30000, paidCents: 30000, pendingCents: 0 });
      expect(body.days.map((day) => day.date)).toEqual(['2030-03-10']);
    });

    it('marca o dia que venceu com valor em aberto', async () => {
      const created = await booking('2020-01-20', 100000);
      await planOf(created.id, {
        deposit: row('2020-01-05', 40000, '2020-01-05'),
        installments: [row('2020-01-15', 60000)],
      });

      const body = (await finance('2020-01')).json<AdminFinance>();

      expect(body.days).toEqual([
        {
          date: '2020-01-05',
          count: 1,
          dueCents: 40000,
          paidCents: 40000,
          pendingCents: 0,
          overdue: false,
        },
        {
          date: '2020-01-15',
          count: 1,
          dueCents: 60000,
          paidCents: 0,
          pendingCents: 60000,
          overdue: true,
        },
      ]);
      expect(body.payments.map((payment) => payment.status)).toEqual(['PAID', 'OVERDUE']);
    });

    it('lista o que está atrasado em qualquer mês, com o total', async () => {
      const old = await booking('2020-01-20', 150000, 'COMPLETED');
      const dropped = await booking('2020-01-25', 40000);
      const current = await booking('2030-03-20', 100000);

      // Fora de ordem: a numeração e a lista seguem o vencimento.
      await planOf(old.id, {
        installments: [row('2020-02-10', 100000), row('2020-01-10', 50000)],
      });
      // Em aberto, mas a reserva foi cancelada: deixou de ser cobrado.
      await planOf(dropped.id, { installments: [row('2020-01-05', 40000)] });
      await cancel(dropped.id);
      // Recebido, ou ainda por vencer: nada disto está atrasado.
      await planOf(current.id, {
        deposit: row('2020-01-15', 30000, '2020-01-15'),
        installments: [row('2030-03-20', 70000)],
      });

      const body = (await finance('2030-03')).json<AdminFinance>();

      expect(body.overdue.totalCents).toBe(150000);
      expect(
        body.overdue.payments.map((payment) => [
          payment.dueDate,
          payment.booking.id,
          payment.label,
          payment.status,
        ]),
      ).toEqual([
        ['2020-01-10', old.id, 'Parcela 1 de 2', 'OVERDUE'],
        ['2020-02-10', old.id, 'Parcela 2 de 2', 'OVERDUE'],
      ]);
      expect(body.overdue.payments[0]?.booking.customer).toMatchObject({
        name: 'Ana Beatriz',
        phone: '11988887777',
      });
    });

    it('aponta as reservas fechadas do mês que ainda não têm plano', async () => {
      // Criadas fora de ordem: a lista segue a data da festa.
      const confirmed = await booking('2030-03-09', 100000, 'CONFIRMED');
      const completed = await booking('2030-03-02', 100000, 'COMPLETED');

      // Nenhuma destas entra: pedido, cancelada, sem valor, com plano, e de outro mês.
      await booking('2030-03-04', 100000, 'PENDING');
      await booking('2030-03-05', 100000, 'CANCELLED');
      await booking('2030-03-06', 0, 'CONFIRMED');
      const planned = await booking('2030-03-07', 100000);
      await planOf(planned.id, { installments: [row('2030-03-07', 100000)] });
      await booking('2030-02-28', 100000);
      await booking('2030-04-01', 100000);

      const body = (await finance('2030-03')).json<AdminFinance>();

      expect(body.unplanned.map((summary) => summary.id)).toEqual([completed.id, confirmed.id]);
      expect(body.unplanned[0]).toMatchObject({
        status: 'COMPLETED',
        startDate: '2030-03-02',
        totalCents: 100000,
        customer: { name: 'Ana Beatriz', phone: '11988887777' },
      });
    });

    it('recusa mês que não existe', async () => {
      const response = await finance('2030-13');

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    });
  });
});
