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

const { DECORATION_NEEDS_FULFILLMENT_ERROR, ONE_DECORATION_ERROR } =
  await import('@chacara/shared');
const { buildApp } = await import('../src/app.js');
const { parseISODate } = await import('../src/lib/dates.js');
const { PG_CHECK_VIOLATION, postgresErrorCode } = await import('../src/lib/errors.js');
const { prisma, truncateAll } = await import('./helpers/db.js');
const { createCategory, createItem, createUser } = await import('./helpers/factories.js');

/**
 * Uma decoração por pedido, retirada ou entrega (§9.12, novembro de 2026).
 *
 * Cada item do catálogo virou uma decoração completa: o pedido do site leva no
 * máximo uma, uma vez. A reserva só de decoração diz como ela chega à festa, e
 * na entrega a reserva guarda uma cópia do endereço do perfil — a garantia que
 * este arquivo mais cobra é que essa cópia não muda quando o perfil muda.
 *
 * A taxa da entrega é combinada com a chácara e nunca entra no total.
 */
describe('retirada e entrega da decoração', () => {
  let app: FastifyInstance;
  let painelId: string;
  let mesaId: string;

  const BASE_DAILY = 150000;
  const PAINEL_PRICE = 12000;
  const MESA_PRICE = 5000;

  /** Um sábado de 2027, longe da antecedência mínima. */
  const DAY = '2027-04-10';

  /** Endereço como o formulário manda: com espaço sobrando e complemento vazio. */
  const ADDRESS_INPUT = {
    cep: '12954000',
    street: '  Rua das Orquídeas ',
    number: '265',
    complement: '',
    district: 'Chácaras Fernão Dias',
    city: 'Atibaia',
    state: 'SP',
  };

  /** O mesmo endereço, como a API guarda e devolve. */
  const ADDRESS = {
    cep: '12954000',
    street: 'Rua das Orquídeas',
    number: '265',
    complement: null,
    district: 'Chácaras Fernão Dias',
    city: 'Atibaia',
    state: 'SP',
  };

  const DELIVERY_LINE =
    'Entrega em Rua das Orquídeas, 265 – Chácaras Fernão Dias, Atibaia/SP – CEP 12954-000. A taxa de entrega é combinada com a chácara.';

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

    const categoryId = (await createCategory({ name: 'Decorações' })).id;

    painelId = (
      await createItem({ categoryId, name: 'Painel', priceCents: PAINEL_PRICE, stock: 2 })
    ).id;
    mesaId = (await createItem({ categoryId, name: 'Mesa', priceCents: MESA_PRICE, stock: 2 })).id;
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

  function send(method: 'POST' | 'PATCH' | 'GET', token: string, url: string, payload?: object) {
    return app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${token}` },
      ...(payload === undefined ? {} : { payload }),
    });
  }

  /** O cliente cadastra o endereço pelo próprio perfil, como no site. */
  async function saveAddress(token: string, address: object = ADDRESS_INPUT) {
    const response = await send('PATCH', token, '/api/me', { address });
    expect(response.statusCode).toBe(200);
  }

  /** Pedido de decoração do painel, para o dia de sempre. */
  function decoration(overrides: Record<string, unknown> = {}) {
    return {
      kind: 'DECORATION',
      startDate: DAY,
      endDate: DAY,
      items: [{ itemId: painelId, quantity: 1 }],
      fulfillment: 'PICKUP',
      expectedTotalCents: PAINEL_PRICE,
      ...overrides,
    };
  }

  // -------------------------------------------------------- uma decoração só

  describe('uma decoração por pedido', () => {
    it('recusa duas decorações no mesmo pedido', async () => {
      const { token } = await createClient();

      for (const kind of ['VENUE', 'DECORATION']) {
        const response = await send('POST', token, '/api/bookings', {
          ...decoration(),
          kind,
          guestCount: 50,
          items: [
            { itemId: painelId, quantity: 1 },
            { itemId: mesaId, quantity: 1 },
          ],
          expectedTotalCents: PAINEL_PRICE + MESA_PRICE,
        });

        expect(response.statusCode).toBe(400);
        expect(response.json().error.details.fields).toContainEqual({
          field: 'items',
          message: ONE_DECORATION_ERROR,
        });
      }

      expect(await prisma.booking.count()).toBe(0);
    });

    it('recusa a mesma decoração duas vezes', async () => {
      const { token } = await createClient();

      const response = await send(
        'POST',
        token,
        '/api/bookings',
        decoration({ items: [{ itemId: painelId, quantity: 2 }], expectedTotalCents: 24000 }),
      );

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details.fields).toContainEqual({
        field: 'items',
        message: ONE_DECORATION_ERROR,
      });
    });

    /* O limite é do pedido do site. O painel lança o que o dono combinou. */
    it('o painel continua lançando mais de uma decoração', async () => {
      const adminToken = await createAdmin();
      const customer = await createUser({ email: 'carla@exemplo.com' });

      const response = await send('POST', adminToken, '/api/admin/bookings', {
        customerId: customer.id,
        kind: 'DECORATION',
        startDate: DAY,
        endDate: DAY,
        items: [
          { itemId: painelId, quantity: 2 },
          { itemId: mesaId, quantity: 1 },
        ],
        expectedTotalCents: PAINEL_PRICE * 2 + MESA_PRICE,
      });

      expect(response.statusCode).toBe(201);
    });
  });

  // ------------------------------------------------------- retirada e entrega

  describe('a modalidade', () => {
    it('a decoração precisa dizer se é retirada ou entrega', async () => {
      const { token } = await createClient();

      const response = await send(
        'POST',
        token,
        '/api/bookings',
        decoration({ fulfillment: null }),
      );

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details.fields).toContainEqual({
        field: 'fulfillment',
        message: DECORATION_NEEDS_FULFILLMENT_ERROR,
      });
    });

    it('retirada não guarda endereço, mesmo com endereço no perfil', async () => {
      const { token } = await createClient();
      await saveAddress(token);

      const response = await send('POST', token, '/api/bookings', decoration());

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({ fulfillment: 'PICKUP', deliveryAddress: null });
    });

    /* Na chácara a decoração já está no lugar da festa: a modalidade não existe. */
    it('a chácara ignora a modalidade que vier, até a entrega sem endereço', async () => {
      const { token } = await createClient();

      const response = await send('POST', token, '/api/bookings', {
        startDate: DAY,
        endDate: DAY,
        guestCount: 80,
        items: [{ itemId: painelId, quantity: 1 }],
        fulfillment: 'DELIVERY',
        expectedTotalCents: BASE_DAILY + PAINEL_PRICE,
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        kind: 'VENUE',
        fulfillment: null,
        deliveryAddress: null,
      });
      expect(
        await prisma.booking.findUniqueOrThrow({ where: { id: response.json().id } }),
      ).toMatchObject({ fulfillment: null, deliveryAddress: null });
    });
  });

  describe('a entrega', () => {
    it('sem endereço no perfil é recusada no campo da modalidade', async () => {
      const { token } = await createClient();

      const response = await send(
        'POST',
        token,
        '/api/bookings',
        decoration({ fulfillment: 'DELIVERY' }),
      );

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details.fields).toEqual([
        {
          field: 'fulfillment',
          message: 'Cadastre o endereço de entrega no seu perfil antes de pedir a entrega.',
        },
      ]);
      expect(await prisma.booking.count()).toBe(0);
    });

    /* Endereço fora do formato, por escrita direta no banco, conta como ausente. */
    it('com endereço estragado no perfil também é recusada', async () => {
      const { user, token } = await createClient();
      await prisma.user.update({
        where: { id: user.id },
        data: { address: { cep: '12954-000', street: 'Rua' } },
      });

      const response = await send(
        'POST',
        token,
        '/api/bookings',
        decoration({ fulfillment: 'DELIVERY' }),
      );

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details.fields[0].field).toBe('fulfillment');
    });

    it('copia o endereço do perfil para a reserva, sem taxa no total', async () => {
      const { token } = await createClient();
      await saveAddress(token);

      const response = await send(
        'POST',
        token,
        '/api/bookings',
        decoration({ fulfillment: 'DELIVERY' }),
      );

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        kind: 'DECORATION',
        fulfillment: 'DELIVERY',
        deliveryAddress: ADDRESS,
        // A taxa da entrega é combinada depois: o total é só a decoração.
        totalCents: PAINEL_PRICE,
      });
      expect(
        await prisma.booking.findUniqueOrThrow({ where: { id: response.json().id } }),
      ).toMatchObject({ fulfillment: 'DELIVERY', deliveryAddress: ADDRESS });
    });

    /* A cópia é snapshot (§2.1): mudar de endereço não muda uma entrega combinada. */
    it('a cópia não muda quando o cliente muda o endereço do perfil', async () => {
      const { token } = await createClient();
      await saveAddress(token);

      const created = await send(
        'POST',
        token,
        '/api/bookings',
        decoration({ fulfillment: 'DELIVERY' }),
      );
      expect(created.statusCode).toBe(201);

      await saveAddress(token, {
        ...ADDRESS_INPUT,
        cep: '01310100',
        street: 'Avenida Paulista',
        number: '1000',
        district: 'Bela Vista',
        city: 'São Paulo',
      });

      const detail = await send('GET', token, `/api/bookings/${created.json().id}`);
      expect(detail.json().deliveryAddress).toEqual(ADDRESS);

      const list = await send('GET', token, '/api/bookings/me');
      expect(list.json()[0]).toMatchObject({ fulfillment: 'DELIVERY', deliveryAddress: ADDRESS });

      expect(
        await prisma.booking.findUniqueOrThrow({ where: { id: created.json().id } }),
      ).toMatchObject({ deliveryAddress: ADDRESS });
    });

    it('o detalhe do painel mostra a modalidade e o endereço', async () => {
      const adminToken = await createAdmin();
      const { token } = await createClient();
      await saveAddress(token);

      const created = await send(
        'POST',
        token,
        '/api/bookings',
        decoration({ fulfillment: 'DELIVERY' }),
      );

      const detail = await send('GET', adminToken, `/api/admin/bookings/${created.json().id}`);

      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({ fulfillment: 'DELIVERY', deliveryAddress: ADDRESS });
    });

    /* O painel também pode lançar a entrega, com o endereço que o cliente cadastrou. */
    it('o painel lança a entrega com o endereço do perfil do cliente', async () => {
      const adminToken = await createAdmin();
      const { user, token } = await createClient();
      await saveAddress(token);

      const response = await send('POST', adminToken, '/api/admin/bookings', {
        customerId: user.id,
        kind: 'DECORATION',
        startDate: DAY,
        endDate: DAY,
        items: [{ itemId: mesaId, quantity: 1 }],
        fulfillment: 'DELIVERY',
        expectedTotalCents: MESA_PRICE,
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({ fulfillment: 'DELIVERY', deliveryAddress: ADDRESS });
    });
  });

  // ----------------------------------------------------------------- e-mails

  describe('e-mails', () => {
    it('o pedido de entrega leva o endereço e o aviso da taxa ao cliente e à dona', async () => {
      await createAdmin();
      const { token } = await createClient();
      await saveAddress(token);

      const response = await send(
        'POST',
        token,
        '/api/bookings',
        decoration({ fulfillment: 'DELIVERY' }),
      );
      expect(response.statusCode).toBe(201);

      const toClient = outbox.find((mail) => mail.to === 'ana@exemplo.com');
      const toOwner = outbox.find((mail) => mail.to === 'dona@chacara.local');

      expect(toClient?.text).toContain(DELIVERY_LINE);
      expect(toOwner?.text).toContain(DELIVERY_LINE);
    });

    it('a confirmação pelo painel repete a linha da entrega', async () => {
      const adminToken = await createAdmin();
      const { token } = await createClient();
      await saveAddress(token);

      const created = await send(
        'POST',
        token,
        '/api/bookings',
        decoration({ fulfillment: 'DELIVERY' }),
      );
      outbox.length = 0;

      const confirmed = await send(
        'PATCH',
        adminToken,
        `/api/admin/bookings/${created.json().id}/status`,
        { status: 'CONFIRMED' },
      );

      expect(confirmed.statusCode).toBe(200);
      expect(outbox).toHaveLength(1);
      expect(outbox[0]?.subject).toBe('Sua reserva está confirmada');
      expect(outbox[0]?.text).toContain(DELIVERY_LINE);
    });

    it('o pedido de retirada diz que é na chácara', async () => {
      const { token } = await createClient();

      await send('POST', token, '/api/bookings', decoration());

      expect(outbox[0]?.text).toContain('Retirada na chácara.');
      expect(outbox[0]?.text).not.toContain('Entrega em');
    });
  });

  // ---------------------------------------------------------- o próprio banco

  /*
   * A última linha de defesa: os CHECKs da migration `decoration_delivery`, para
   * qualquer caminho que escreva direto no banco (script, console, bug).
   */
  describe('constraints do banco', () => {
    async function insert(data: {
      kind: 'VENUE' | 'DECORATION';
      fulfillment: 'PICKUP' | 'DELIVERY' | null;
      deliveryAddress?: typeof ADDRESS;
    }) {
      const user = await createUser({});

      return prisma.booking
        .create({
          data: {
            userId: user.id,
            startDate: parseISODate(DAY),
            endDate: parseISODate(DAY),
            guestCount: data.kind === 'VENUE' ? 40 : null,
            dailyBreakdown: [],
            appliedCombos: [],
            dailyTotalCents: 0,
            itemsTotalCents: 0,
            discountTotalCents: 0,
            totalCents: 0,
            ...data,
          },
        })
        .then(() => null)
        .catch((caught: unknown) => caught);
    }

    it('recusa decoração sem modalidade', async () => {
      expect(postgresErrorCode(await insert({ kind: 'DECORATION', fulfillment: null }))).toBe(
        PG_CHECK_VIOLATION,
      );
    });

    it('recusa modalidade na chácara', async () => {
      expect(postgresErrorCode(await insert({ kind: 'VENUE', fulfillment: 'PICKUP' }))).toBe(
        PG_CHECK_VIOLATION,
      );
    });

    it('recusa entrega sem endereço e endereço sem entrega', async () => {
      expect(postgresErrorCode(await insert({ kind: 'DECORATION', fulfillment: 'DELIVERY' }))).toBe(
        PG_CHECK_VIOLATION,
      );
      expect(
        postgresErrorCode(
          await insert({ kind: 'DECORATION', fulfillment: 'PICKUP', deliveryAddress: ADDRESS }),
        ),
      ).toBe(PG_CHECK_VIOLATION);
      expect(
        postgresErrorCode(
          await insert({ kind: 'VENUE', fulfillment: null, deliveryAddress: ADDRESS }),
        ),
      ).toBe(PG_CHECK_VIOLATION);
    });

    it('aceita as combinações certas', async () => {
      expect(await insert({ kind: 'VENUE', fulfillment: null })).toBeNull();
      expect(await insert({ kind: 'DECORATION', fulfillment: 'PICKUP' })).toBeNull();
      expect(
        await insert({ kind: 'DECORATION', fulfillment: 'DELIVERY', deliveryAddress: ADDRESS }),
      ).toBeNull();
    });
  });
});
