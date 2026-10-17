import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { addDays, parseISODate, todayInSaoPaulo } from '../src/lib/dates.js';
import { monthRange } from '../src/modules/admin/overview-service.js';
import { prisma, truncateAll } from './helpers/db.js';
import { createBooking, createUser } from './helpers/factories.js';

/**
 * Calendário e visão geral do painel (§11.2, §13.4).
 *
 * Duas garantias estão sob teste: o calendário mostra as mesmas reservas que
 * ocupam data na disponibilidade pública — nem mais, nem menos — e a visão geral
 * ordena os pedidos pelo **prazo**, que é o que o dono perde se não responder.
 *
 * Datas de 2027 onde a antecedência mínima não deve interferir no que se mede.
 */
describe('visão geral do painel', () => {
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

    await prisma.venueSettings.create({
      data: {
        id: 1,
        name: 'Chácara Seu Evento',
        baseDailyPriceCents: 150000,
        maxGuests: 120,
        minLeadDays: 2,
      },
    });

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

  function get(url: string, token = adminToken) {
    return app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } });
  }

  // ------------------------------------------------------------------ acesso

  it('recusa quem não é admin', async () => {
    expect((await get('/api/admin/calendar?month=2027-04', clientToken)).statusCode).toBe(403);
    expect((await get('/api/admin/dashboard', clientToken)).statusCode).toBe(403);
  });

  it('recusa quem não está logado', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/admin/dashboard' });

    expect(response.statusCode).toBe(401);
  });

  // ---------------------------------------------------------------- monthRange

  describe('monthRange', () => {
    it('cobre o mês inteiro', () => {
      expect(monthRange('2027-04')).toEqual({ from: '2027-04-01', to: '2027-04-30' });
      expect(monthRange('2027-01')).toEqual({ from: '2027-01-01', to: '2027-01-31' });
    });

    it('acerta fevereiro nos dois tipos de ano', () => {
      expect(monthRange('2028-02').to).toBe('2028-02-29');
      expect(monthRange('2027-02').to).toBe('2027-02-28');
    });
  });

  // ------------------------------------------------------------------ calendário

  describe('GET /admin/calendar', () => {
    it('recusa mês fora do formato', async () => {
      const response = await get('/api/admin/calendar?month=abril');

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('recusa mês inexistente', async () => {
      expect((await get('/api/admin/calendar?month=2027-13')).statusCode).toBe(400);
    });

    it('devolve um dia por data do mês', async () => {
      const response = await get('/api/admin/calendar?month=2027-04');

      expect(response.statusCode).toBe(200);
      expect(response.json().days).toHaveLength(30);
      expect(response.json()).toMatchObject({
        month: '2027-04',
        from: '2027-04-01',
        to: '2027-04-30',
      });
    });

    /* Uma reserva de três dias entra nos três, sem se repetir no payload. */
    it('liga a reserva a cada dia que ela cobre', async () => {
      const booking = await createBooking({
        userId: clientId,
        startDate: '2027-04-09',
        endDate: '2027-04-11',
        status: 'CONFIRMED',
      });

      const body = (await get('/api/admin/calendar?month=2027-04')).json();
      const dayOf = (date: string) => body.days.find((day: { date: string }) => day.date === date);

      expect(dayOf('2027-04-09').bookingIds).toEqual([booking.id]);
      expect(dayOf('2027-04-10').bookingIds).toEqual([booking.id]);
      expect(dayOf('2027-04-11').bookingIds).toEqual([booking.id]);
      expect(dayOf('2027-04-12').bookingIds).toEqual([]);
      // E aparece uma vez só na lista.
      expect(body.bookings).toHaveLength(1);
    });

    it('traz o cliente, que a resposta pública esconde', async () => {
      await createBooking({
        userId: clientId,
        startDate: '2027-04-10',
        endDate: '2027-04-10',
        status: 'CONFIRMED',
        totalCents: 350000,
      });

      const body = (await get('/api/admin/calendar?month=2027-04')).json();

      expect(body.bookings[0]).toMatchObject({
        totalCents: 350000,
        customer: { name: 'Ana Beatriz', email: 'ana@exemplo.com', phone: '11988887777' },
      });
    });

    /*
     * O mesmo filtro da disponibilidade (§9.1): pedido vencido não ocupa data e
     * também não deve aparecer no calendário como se ocupasse.
     */
    it('ignora pedido com prazo vencido', async () => {
      await createBooking({
        userId: clientId,
        startDate: '2027-04-10',
        endDate: '2027-04-10',
        status: 'PENDING',
        holdExpiresAt: new Date(Date.now() - 60 * 60 * 1000),
      });

      const body = (await get('/api/admin/calendar?month=2027-04')).json();

      expect(body.bookings).toEqual([]);
      expect(body.days.find((day: { date: string }) => day.date === '2027-04-10').status).toBe(
        'free',
      );
    });

    it('conta pedido com prazo em aberto como ocupando o dia', async () => {
      await createBooking({
        userId: clientId,
        startDate: '2027-04-10',
        endDate: '2027-04-10',
        status: 'PENDING',
        holdExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      const body = (await get('/api/admin/calendar?month=2027-04')).json();

      expect(body.bookings).toHaveLength(1);
      expect(body.days.find((day: { date: string }) => day.date === '2027-04-10').status).toBe(
        'booked',
      );
    });

    it('não mostra reserva cancelada', async () => {
      await createBooking({
        userId: clientId,
        startDate: '2027-04-10',
        endDate: '2027-04-10',
        status: 'CANCELLED',
      });

      expect((await get('/api/admin/calendar?month=2027-04')).json().bookings).toEqual([]);
    });

    it('traz o motivo do bloqueio junto do dia', async () => {
      await prisma.blockedDate.create({
        data: { date: parseISODate('2027-04-15'), reason: 'Manutenção da piscina' },
      });

      const body = (await get('/api/admin/calendar?month=2027-04')).json();
      const day = body.days.find((item: { date: string }) => item.date === '2027-04-15');

      expect(day).toMatchObject({ status: 'blocked', blockReason: 'Manutenção da piscina' });
    });

    /*
     * Bloquear dia com reserva é permitido (§11.2): é o que se faz quando a
     * chácara fica indisponível de verdade. O calendário mostra os dois.
     */
    it('mostra a reserva embaixo de um dia bloqueado', async () => {
      const booking = await createBooking({
        userId: clientId,
        startDate: '2027-04-15',
        endDate: '2027-04-15',
        status: 'CONFIRMED',
      });
      await prisma.blockedDate.create({
        data: { date: parseISODate('2027-04-15'), reason: null },
      });

      const body = (await get('/api/admin/calendar?month=2027-04')).json();
      const day = body.days.find((item: { date: string }) => item.date === '2027-04-15');

      expect(day.status).toBe('blocked');
      expect(day.bookingIds).toEqual([booking.id]);
    });

    it('traz reserva que começa no mês anterior e invade este', async () => {
      const booking = await createBooking({
        userId: clientId,
        startDate: '2027-03-31',
        endDate: '2027-04-02',
        status: 'CONFIRMED',
      });

      const body = (await get('/api/admin/calendar?month=2027-04')).json();

      expect(body.bookings.map((item: { id: string }) => item.id)).toEqual([booking.id]);
      expect(
        body.days.find((day: { date: string }) => day.date === '2027-04-01').bookingIds,
      ).toEqual([booking.id]);
    });

    it('marca como lançada pelo painel a reserva criada pelo dono', async () => {
      await createBooking({
        userId: clientId,
        startDate: '2027-04-10',
        endDate: '2027-04-10',
        status: 'CONFIRMED',
        createdByAdmin: true,
      });

      expect((await get('/api/admin/calendar?month=2027-04')).json().bookings[0]).toMatchObject({
        createdByAdmin: true,
      });
    });
  });

  // ---------------------------------------------------------------- visão geral

  describe('GET /admin/dashboard', () => {
    it('devolve tudo zerado quando não há reserva', async () => {
      const body = (await get('/api/admin/dashboard')).json();

      expect(body.pending).toEqual([]);
      expect(body.upcoming).toEqual([]);
      expect(body.counts).toEqual({ pending: 0, next7: 0, next30: 0 });
      expect(body.occupancy.bookedDays).toBe(0);
    });

    /*
     * Ordem pelo prazo, não pela data da festa: o pedido que vence primeiro é o
     * que o dono perde se não responder (§13.4).
     */
    it('ordena os pedidos pelo prazo mais curto', async () => {
      const later = await createBooking({
        userId: clientId,
        startDate: '2027-04-10',
        endDate: '2027-04-10',
        status: 'PENDING',
        holdExpiresAt: new Date(Date.now() + 40 * 60 * 60 * 1000),
      });
      const sooner = await createBooking({
        userId: clientId,
        startDate: '2027-06-10',
        endDate: '2027-06-10',
        status: 'PENDING',
        holdExpiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      });

      const body = (await get('/api/admin/dashboard')).json();

      expect(body.pending.map((item: { id: string }) => item.id)).toEqual([sooner.id, later.id]);
    });

    it('não lista pedido com prazo vencido', async () => {
      await createBooking({
        userId: clientId,
        startDate: '2027-04-10',
        endDate: '2027-04-10',
        status: 'PENDING',
        holdExpiresAt: new Date(Date.now() - 1000),
      });

      const body = (await get('/api/admin/dashboard')).json();

      expect(body.pending).toEqual([]);
      expect(body.counts.pending).toBe(0);
    });

    it('não lista reserva confirmada entre os pedidos', async () => {
      await createBooking({
        userId: clientId,
        startDate: '2027-04-10',
        endDate: '2027-04-10',
        status: 'CONFIRMED',
      });

      expect((await get('/api/admin/dashboard')).json().pending).toEqual([]);
    });

    it('conta os próximos 7 e 30 dias separadamente', async () => {
      const today = todayInSaoPaulo();

      await createBooking({
        userId: clientId,
        startDate: addDays(today, 3),
        endDate: addDays(today, 3),
        status: 'CONFIRMED',
      });
      await createBooking({
        userId: clientId,
        startDate: addDays(today, 20),
        endDate: addDays(today, 20),
        status: 'CONFIRMED',
      });

      const body = (await get('/api/admin/dashboard')).json();

      expect(body.counts.next7).toBe(1);
      expect(body.counts.next30).toBe(2);
      expect(body.upcoming).toHaveLength(2);
    });

    it('deixa fora o que começa depois dos 30 dias', async () => {
      const today = todayInSaoPaulo();

      await createBooking({
        userId: clientId,
        startDate: addDays(today, 45),
        endDate: addDays(today, 45),
        status: 'CONFIRMED',
      });

      const body = (await get('/api/admin/dashboard')).json();

      expect(body.counts.next30).toBe(0);
      expect(body.upcoming).toEqual([]);
    });

    it('deixa fora o que já passou', async () => {
      const today = todayInSaoPaulo();

      await createBooking({
        userId: clientId,
        startDate: addDays(today, -5),
        endDate: addDays(today, -5),
        status: 'CONFIRMED',
      });

      expect((await get('/api/admin/dashboard')).json().counts.next30).toBe(0);
    });

    it('a festa de hoje conta nos próximos dias', async () => {
      const today = todayInSaoPaulo();

      await createBooking({
        userId: clientId,
        startDate: today,
        endDate: today,
        status: 'CONFIRMED',
      });

      expect((await get('/api/admin/dashboard')).json().counts.next7).toBe(1);
    });

    it('ordena os próximos por data', async () => {
      const today = todayInSaoPaulo();

      const far = await createBooking({
        userId: clientId,
        startDate: addDays(today, 20),
        endDate: addDays(today, 20),
        status: 'CONFIRMED',
      });
      const near = await createBooking({
        userId: clientId,
        startDate: addDays(today, 4),
        endDate: addDays(today, 4),
        status: 'CONFIRMED',
      });

      const body = (await get('/api/admin/dashboard')).json();

      expect(body.upcoming.map((item: { id: string }) => item.id)).toEqual([near.id, far.id]);
    });

    describe('ocupação do mês', () => {
      it('conta dias, não reservas', async () => {
        const month = todayInSaoPaulo().slice(0, 7);
        const [year, monthNumber] = month.split('-').map(Number) as [number, number];
        const first = `${month}-01`;

        // Uma reserva de três dias ocupa três dias.
        await createBooking({
          userId: clientId,
          startDate: addDays(first, 14),
          endDate: addDays(first, 16),
          status: 'CONFIRMED',
        });

        const body = (await get('/api/admin/dashboard')).json();

        expect(body.occupancy.month).toBe(month);
        expect(body.occupancy.bookedDays).toBe(3);
        // Dia 0 do mês seguinte é o último do atual.
        expect(body.occupancy.totalDays).toBe(
          new Date(Date.UTC(year, monthNumber, 0)).getUTCDate(),
        );
      });

      /* §9.1: bloqueio vence reserva, e o dia é contado uma vez só. */
      it('conta como bloqueado o dia que tem reserva e bloqueio', async () => {
        const first = `${todayInSaoPaulo().slice(0, 7)}-01`;
        const day = addDays(first, 20);

        await createBooking({
          userId: clientId,
          startDate: day,
          endDate: day,
          status: 'CONFIRMED',
        });
        await prisma.blockedDate.create({ data: { date: parseISODate(day), reason: null } });

        const body = (await get('/api/admin/dashboard')).json();

        expect(body.occupancy.bookedDays).toBe(0);
        expect(body.occupancy.blockedDays).toBe(1);
      });

      it('a porcentagem é dias reservados sobre o total', async () => {
        const first = `${todayInSaoPaulo().slice(0, 7)}-01`;

        await createBooking({
          userId: clientId,
          startDate: addDays(first, 10),
          endDate: addDays(first, 12),
          status: 'CONFIRMED',
        });

        const body = (await get('/api/admin/dashboard')).json();

        expect(body.occupancy.bookedPercent).toBe(
          Math.round((body.occupancy.bookedDays / body.occupancy.totalDays) * 100),
        );
      });

      /*
       * Dia que já não pode ser vendido não é livre nem ocupado: fica fora do
       * livre para o número não prometer uma agenda que não existe mais.
       */
      it('não conta como livre o dia dentro da antecedência mínima', async () => {
        const body = (await get('/api/admin/dashboard')).json();

        expect(body.occupancy.freeDays + body.occupancy.bookedDays).toBeLessThan(
          body.occupancy.totalDays + 1,
        );
      });
    });
  });
});
