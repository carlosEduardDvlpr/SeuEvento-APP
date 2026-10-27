import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type SentEmail = { to: string; subject: string; text: string; html: string };

const { outbox } = vi.hoisted(() => ({ outbox: [] as SentEmail[] }));

vi.mock('../src/lib/mailer.js', () => ({
  sendMail: async (mail: SentEmail) => {
    outbox.push(mail);
  },
  resetMailerForTests: () => {},
}));

const { DECORATION_NEEDS_ITEMS_ERROR, DECORATION_ONE_DAY_ERROR, VENUE_NEEDS_GUESTS_ERROR } =
  await import('@chacara/shared');
const { buildApp } = await import('../src/app.js');
const { addDays, parseISODate, todayInSaoPaulo } = await import('../src/lib/dates.js');
const { getMonthOccupancy } = await import('../src/modules/admin/overview-service.js');
const { prisma, truncateAll } = await import('./helpers/db.js');
const { createCategory, createItem, createUser } = await import('./helpers/factories.js');

/**
 * Reserva só de decoração (T32).
 *
 * A dona aluga a chácara e também só a decoração, para festa em outro lugar. A
 * garantia central deste arquivo: **a decoração não mexe na agenda da chácara**,
 * nos dois sentidos — e mesmo assim nenhum item sai duas vezes no mesmo dia,
 * porque o estoque conta os dois produtos.
 *
 * Cada regra da conversa com a dona tem um caso aqui: um dia de uso, sem
 * convidados, sem diária, a mesma antecedência, e o bloqueio da chácara não
 * fechando a decoração.
 */
describe('reserva só de decoração', () => {
  let app: FastifyInstance;
  let painelId: string;
  let mesaId: string;

  const BASE_DAILY = 150000;
  const PAINEL_PRICE = 12000;
  const MESA_PRICE = 5000;

  /** Um sábado de 2027, longe da antecedência mínima. */
  const DAY = '2027-04-10';

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll();
    outbox.length = 0;

    await prisma.venueSettings.create({
      data: {
        id: 1,
        name: 'Espaço Donna Belle',
        baseDailyPriceCents: BASE_DAILY,
        maxGuests: 120,
        minDays: 1,
        maxDays: 3,
        minLeadDays: 2,
        holdHours: 48,
        maxPendingPerUser: 3,
        whatsapp: '11988887777',
      },
    });

    const categoryId = (await createCategory({ name: 'Painéis' })).id;

    // Um painel só: é ele que prova que os dois produtos disputam o mesmo estoque.
    painelId = (
      await createItem({ categoryId, name: 'Painel', priceCents: PAINEL_PRICE, stock: 1 })
    ).id;
    mesaId = (await createItem({ categoryId, name: 'Mesa', priceCents: MESA_PRICE, stock: 5 })).id;
  });

  /** Cliente apto a reservar: e-mail confirmado e telefone no perfil (§11.3). */
  async function createClient(email = 'ana@exemplo.com') {
    const user = await createUser({ name: 'Ana Beatriz', email });
    await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });

    return { user, token: app.jwt.sign({ sub: user.id, role: user.role }) };
  }

  async function createAdmin() {
    const admin = await createUser({ name: 'Dona', email: 'dona@chacara.local', role: 'ADMIN' });
    return app.jwt.sign({ sub: admin.id, role: admin.role });
  }

  function post(token: string, url: string, payload: Record<string, unknown>) {
    return app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
  }

  function quote(payload: Record<string, unknown>) {
    return app.inject({ method: 'POST', url: '/api/pricing/quote', payload });
  }

  async function dayStatus(date: string, kind?: 'VENUE' | 'DECORATION') {
    const response = await app.inject({
      method: 'GET',
      url: `/api/availability?from=${date}&to=${date}${kind ? `&kind=${kind}` : ''}`,
    });

    expect(response.statusCode).toBe(200);
    return (response.json() as { days: { status: string }[] }).days[0]?.status;
  }

  /** Pedido de decoração do painel, um item. */
  function decoration(overrides: Record<string, unknown> = {}) {
    return {
      kind: 'DECORATION',
      startDate: DAY,
      endDate: DAY,
      items: [{ itemId: painelId, quantity: 1 }],
      expectedTotalCents: PAINEL_PRICE,
      ...overrides,
    };
  }

  /** Pedido de chácara de um dia, sem itens. */
  function venue(overrides: Record<string, unknown> = {}) {
    return {
      startDate: DAY,
      endDate: DAY,
      guestCount: 80,
      items: [],
      expectedTotalCents: BASE_DAILY,
      ...overrides,
    };
  }

  // ---------------------------------------------------------------- o pedido

  describe('o pedido', () => {
    it('nasce sem diária e sem convidados, com o prazo de sempre', async () => {
      const { token } = await createClient();

      // O número de convidados, se vier, não vale: sem a chácara, não há quem receber.
      const response = await post(token, '/api/bookings', decoration({ guestCount: 50 }));

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual(
        expect.objectContaining({
          kind: 'DECORATION',
          startDate: DAY,
          endDate: DAY,
          guestCount: null,
          status: 'PENDING',
          days: [],
          dailyTotalCents: 0,
          itemsTotalCents: PAINEL_PRICE,
          totalCents: PAINEL_PRICE,
        }),
      );
      expect(response.json().holdExpiresAt).not.toBeNull();
    });

    it('o orçamento da decoração não cobra diária', async () => {
      const response = await quote({
        kind: 'DECORATION',
        startDate: DAY,
        endDate: DAY,
        items: [{ itemId: mesaId, quantity: 2 }],
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        available: true,
        issues: [],
        days: [],
        dailyTotalCents: 0,
        itemsTotalCents: MESA_PRICE * 2,
        totalCents: MESA_PRICE * 2,
      });
    });

    it('é um dia só', async () => {
      const { token } = await createClient();

      const response = await post(token, '/api/bookings', decoration({ endDate: '2027-04-11' }));

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details.fields).toContainEqual({
        field: 'endDate',
        message: DECORATION_ONE_DAY_ERROR,
      });
    });

    it('precisa de pelo menos um item', async () => {
      const { token } = await createClient();

      const response = await post(
        token,
        '/api/bookings',
        decoration({ items: [], expectedTotalCents: 0 }),
      );

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details.fields).toContainEqual({
        field: 'items',
        message: DECORATION_NEEDS_ITEMS_ERROR,
      });
    });

    /* Convidados ficou opcional no banco; na chácara, continua obrigatório. */
    it('a chácara continua exigindo o número de convidados', async () => {
      const { token } = await createClient();

      const response = await post(token, '/api/bookings', {
        startDate: DAY,
        endDate: DAY,
        items: [],
        expectedTotalCents: BASE_DAILY,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details.fields).toContainEqual({
        field: 'guestCount',
        message: VENUE_NEEDS_GUESTS_ERROR,
      });
    });
  });

  // ---------------------------------------------------------------- a agenda

  describe('a agenda', () => {
    it('decoração reservada não tira a data da chácara', async () => {
      const ana = await createClient('ana@exemplo.com');
      const bia = await createClient('bia@exemplo.com');

      expect((await post(ana.token, '/api/bookings', decoration())).statusCode).toBe(201);

      expect(await dayStatus(DAY)).toBe('free');
      expect((await post(bia.token, '/api/bookings', venue())).statusCode).toBe(201);
    });

    it('festa na chácara não fecha a decoração no mesmo dia', async () => {
      const ana = await createClient('ana@exemplo.com');
      const bia = await createClient('bia@exemplo.com');

      expect((await post(ana.token, '/api/bookings', venue())).statusCode).toBe(201);

      expect(await dayStatus(DAY)).toBe('booked');
      expect(await dayStatus(DAY, 'DECORATION')).toBe('free');

      const response = await post(
        bia.token,
        '/api/bookings',
        decoration({ items: [{ itemId: mesaId, quantity: 1 }], expectedTotalCents: MESA_PRICE }),
      );

      expect(response.statusCode).toBe(201);
    });

    it('a antecedência mínima vale também para a decoração', async () => {
      const { token } = await createClient();
      const tomorrow = addDays(todayInSaoPaulo(), 1);

      expect(await dayStatus(tomorrow, 'DECORATION')).toBe('past');

      const response = await post(
        token,
        '/api/bookings',
        decoration({ startDate: tomorrow, endDate: tomorrow }),
      );

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('DATE_UNAVAILABLE');
    });
  });

  // ---------------------------------------------------------------- o estoque

  describe('o estoque', () => {
    it('conta os dois produtos: o painel que foi para a chácara não sai sozinho', async () => {
      const ana = await createClient('ana@exemplo.com');
      const bia = await createClient('bia@exemplo.com');

      const withPainel = venue({
        items: [{ itemId: painelId, quantity: 1 }],
        expectedTotalCents: BASE_DAILY + PAINEL_PRICE,
      });
      expect((await post(ana.token, '/api/bookings', withPainel)).statusCode).toBe(201);

      const response = await post(bia.token, '/api/bookings', decoration());

      expect(response.statusCode).toBe(409);
      expect(response.json().error).toMatchObject({
        code: 'STOCK_INSUFFICIENT',
        details: { itemId: painelId, available: 0 },
      });
    });

    it('e no sentido contrário: o painel que saiu sozinho não vai para a chácara', async () => {
      const ana = await createClient('ana@exemplo.com');
      const bia = await createClient('bia@exemplo.com');

      expect((await post(ana.token, '/api/bookings', decoration())).statusCode).toBe(201);

      const response = await post(
        bia.token,
        '/api/bookings',
        venue({
          items: [{ itemId: painelId, quantity: 1 }],
          expectedTotalCents: BASE_DAILY + PAINEL_PRICE,
        }),
      );

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('STOCK_INSUFFICIENT');
    });

    /*
     * A decoração não passa pela exclusion constraint da §8.1, então quem decide
     * a corrida pelo último item é a trava das linhas de `Item` na transação
     * (§9.3). Sem ela, os dois pedidos contariam o estoque antes de o outro
     * gravar, e o mesmo painel sairia duas vezes no mesmo sábado.
     */
    it('dois pedidos simultâneos pelo último painel: só um passa', async () => {
      const ana = await createClient('ana@exemplo.com');
      const bia = await createClient('bia@exemplo.com');

      const responses = await Promise.all([
        post(ana.token, '/api/bookings', decoration()),
        post(bia.token, '/api/bookings', decoration()),
      ]);

      expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 409]);
      expect(responses.find((response) => response.statusCode === 409)?.json().error.code).toBe(
        'STOCK_INSUFFICIENT',
      );
      expect(await prisma.booking.count({ where: { kind: 'DECORATION' } })).toBe(1);
    });

    it('pedido de decoração vencido não segura o item', async () => {
      const other = await createUser({ email: 'outra@exemplo.com' });
      const { token } = await createClient();

      await prisma.booking.create({
        data: {
          userId: other.id,
          kind: 'DECORATION',
          startDate: parseISODate(DAY),
          endDate: parseISODate(DAY),
          guestCount: null,
          status: 'PENDING',
          holdExpiresAt: new Date(Date.now() - 60_000),
          dailyBreakdown: [],
          appliedCombos: [],
          dailyTotalCents: 0,
          itemsTotalCents: PAINEL_PRICE,
          discountTotalCents: 0,
          totalCents: PAINEL_PRICE,
          items: {
            create: [
              { itemId: painelId, itemName: 'Painel', quantity: 1, unitPriceCents: PAINEL_PRICE },
            ],
          },
        },
      });

      expect((await post(token, '/api/bookings', decoration())).statusCode).toBe(201);
    });
  });

  // ------------------------------------------------------- bloqueio com escopo

  describe('bloqueio com escopo', () => {
    async function block(scope?: 'VENUE' | 'DECORATION' | 'BOTH') {
      const adminToken = await createAdmin();
      const response = await post(adminToken, '/api/admin/blocked-dates', {
        date: DAY,
        reason: 'Viagem',
        ...(scope ? { scope } : {}),
      });

      expect(response.statusCode).toBe(200);
      return response.json() as { scope: string };
    }

    /* Resposta 1 da dona: o bloqueio de data é só da chácara. */
    it('o bloqueio de sempre fecha só a chácara', async () => {
      expect((await block()).scope).toBe('VENUE');
      const { token } = await createClient();

      expect(await dayStatus(DAY)).toBe('blocked');
      expect(await dayStatus(DAY, 'DECORATION')).toBe('free');
      expect((await post(token, '/api/bookings', decoration())).statusCode).toBe(201);
    });

    it('fechar a decoração não fecha a chácara, mas nenhum item sai', async () => {
      await block('DECORATION');
      const { token } = await createClient();

      expect(await dayStatus(DAY)).toBe('free');
      expect(await dayStatus(DAY, 'DECORATION')).toBe('blocked');

      const decorationResponse = await post(token, '/api/bookings', decoration());
      expect(decorationResponse.statusCode).toBe(409);
      expect(decorationResponse.json().error.code).toBe('DATE_UNAVAILABLE');

      // A chácara com item também não leva o painel: estoque zero naquele dia.
      const withItems = await quote({
        startDate: DAY,
        endDate: DAY,
        items: [{ itemId: painelId, quantity: 1 }],
      });
      expect(withItems.json().issues).toEqual([
        { code: 'STOCK_INSUFFICIENT', itemId: painelId, available: 0 },
      ]);

      // Sem item, a chácara continua reservável.
      expect((await post(token, '/api/bookings', venue())).statusCode).toBe(201);
    });

    it('fechar os dois fecha as duas agendas', async () => {
      await block('BOTH');

      expect(await dayStatus(DAY)).toBe('blocked');
      expect(await dayStatus(DAY, 'DECORATION')).toBe('blocked');
    });
  });

  // ------------------------------------------------------------------ painel

  describe('painel', () => {
    it('a dona lança decoração confirmada, e o dia segue livre para a chácara', async () => {
      const adminToken = await createAdmin();
      const customer = await createUser({ email: 'carla@exemplo.com' });

      const response = await post(adminToken, '/api/admin/bookings', {
        customerId: customer.id,
        kind: 'DECORATION',
        startDate: DAY,
        endDate: DAY,
        items: [{ itemId: mesaId, quantity: 2 }],
        expectedTotalCents: MESA_PRICE * 2,
        confirmed: true,
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        kind: 'DECORATION',
        status: 'CONFIRMED',
        guestCount: null,
        totalCents: MESA_PRICE * 2,
      });

      const calendar = await app.inject({
        method: 'GET',
        url: '/api/admin/calendar?month=2027-04',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const body = calendar.json() as {
        days: { date: string; status: string; bookingIds: string[] }[];
        bookings: { id: string; kind: string }[];
      };

      // A reserva aparece no dia, mas o dia é da agenda da chácara: livre.
      expect(body.days.find((day) => day.date === DAY)).toMatchObject({
        status: 'free',
        bookingIds: [response.json().id],
      });
      expect(body.bookings).toEqual([expect.objectContaining({ kind: 'DECORATION' })]);

      // Ocupação é da chácara: decoração não conta dia vendido.
      expect((await getMonthOccupancy(prisma, '2027-04')).bookedDays).toBe(0);
    });
  });

  // ----------------------------------------------------------------- e-mails

  describe('e-mails', () => {
    it('falam de decoração, não de "a chácara é sua"', async () => {
      await createAdmin();
      const { token } = await createClient();

      expect((await post(token, '/api/bookings', decoration())).statusCode).toBe(201);

      const toClient = outbox.find((mail) => mail.to === 'ana@exemplo.com');
      const toOwner = outbox.find((mail) => mail.to === 'dona@chacara.local');

      expect(toClient?.subject).toBe('Recebemos seu pedido de decoração');
      expect(toClient?.text).toContain('os itens ficam separados');
      expect(toOwner?.subject).toContain('Novo pedido de decoração');
      expect(toOwner?.text).toContain('A data continua livre para a chácara');
    });
  });
});
