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

const { buildApp } = await import('../src/app.js');
const { parseISODate } = await import('../src/lib/dates.js');
const { prisma, truncateAll } = await import('./helpers/db.js');
const { createBooking, createCategory, createItem, createUser } =
  await import('./helpers/factories.js');

/**
 * Reserva manual, clientes e configurações (§9.8, §11.2, §13.4).
 *
 * A garantia central: a reserva lançada pelo painel passa pelo **mesmo** núcleo
 * transacional do pedido do cliente — constraint de datas, estoque, preço. O que
 * muda são as exigências de quem pede, e cada dispensa está testada.
 */
describe('painel: reserva manual, clientes e configurações', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let clientToken: string;

  const BASE_DAILY = 150000;

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
        name: 'Chácara Seu Evento',
        baseDailyPriceCents: BASE_DAILY,
        maxGuests: 120,
        minDays: 1,
        maxDays: 3,
        minLeadDays: 2,
        maxPendingPerUser: 2,
        checkInTime: '08:00',
        checkOutTime: '22:00',
        address: 'Estrada do Sol, 100',
        houseRules: 'Som até 22h.',
        whatsapp: '11988887777',
      },
    });

    const admin = await createUser({ email: 'dono@chacara.local', role: 'ADMIN' });
    adminToken = app.jwt.sign({ sub: admin.id, role: admin.role });

    const client = await createUser({ email: 'cliente@exemplo.com' });
    clientToken = app.jwt.sign({ sub: client.id, role: client.role });
  });

  function get(url: string, token = adminToken) {
    return app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } });
  }

  function send(method: 'POST' | 'PUT', url: string, payload: unknown, token = adminToken) {
    return app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${token}` },
      payload: payload as object,
    });
  }

  const TWO_DAYS = {
    startDate: '2027-04-09',
    endDate: '2027-04-10',
    eventType: 'WEDDING' as const,
    guestCount: 80,
    items: [],
    expectedTotalCents: BASE_DAILY * 2,
  };

  // ------------------------------------------------------------------ clientes

  describe('clientes', () => {
    it('recusa quem não é admin', async () => {
      expect((await get('/api/admin/customers', clientToken)).statusCode).toBe(403);
    });

    /* §9.8: nome e telefone bastam; o e-mail é opcional e a conta nasce sem senha. */
    it('cria cliente com nome e telefone, sem senha e sem e-mail', async () => {
      const response = await send('POST', '/api/admin/customers', {
        name: 'Carla Dias',
        phone: '(11) 97777-1234',
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        name: 'Carla Dias',
        phone: '11977771234',
        email: null,
        hasAccess: false,
        emailVerified: false,
        bookingCount: 0,
      });
    });

    it('aceita e-mail quando o dono tem', async () => {
      const response = await send('POST', '/api/admin/customers', {
        name: 'Carla Dias',
        phone: '11977771234',
        email: 'carla@exemplo.com',
      });

      expect(response.json().email).toBe('carla@exemplo.com');
    });

    /*
     * A conta precisa nascer sem `passwordHash`, sem `googleId` e sem e-mail
     * confirmado: é esse estado que o cadastro próprio sabe assumir depois (§9.8).
     */
    it('a conta criada fica no estado que o cadastro próprio pode assumir', async () => {
      const created = await send('POST', '/api/admin/customers', {
        name: 'Carla Dias',
        phone: '11977771234',
        email: 'carla@exemplo.com',
      });

      const row = await prisma.user.findUniqueOrThrow({ where: { id: created.json().id } });

      expect(row.passwordHash).toBeNull();
      expect(row.googleId).toBeNull();
      expect(row.emailVerifiedAt).toBeNull();
      expect(row.role).toBe('CLIENT');
    });

    it('recusa e-mail que já existe, apontando a conta', async () => {
      await send('POST', '/api/admin/customers', {
        name: 'Carla Dias',
        phone: '11977771234',
        email: 'carla@exemplo.com',
      });

      const again = await send('POST', '/api/admin/customers', {
        name: 'Carla Outra',
        phone: '11955554444',
        email: 'carla@exemplo.com',
      });

      expect(again.statusCode).toBe(409);
      expect(again.json().error.code).toBe('EMAIL_IN_USE');
      expect(again.json().error.details.customerId).toBeTruthy();
    });

    it('recusa cadastro sem telefone', async () => {
      const response = await send('POST', '/api/admin/customers', { name: 'Carla Dias' });

      expect(response.statusCode).toBe(400);
    });

    it('lista em ordem alfabética', async () => {
      await createUser({ name: 'Zilda', email: 'z@exemplo.com' });
      await createUser({ name: 'Ana', email: 'a@exemplo.com' });

      const names = (await get('/api/admin/customers'))
        .json()
        .items.map((c: { name: string }) => c.name);

      expect(names.indexOf('Ana')).toBeLessThan(names.indexOf('Zilda'));
    });

    /* A conta do dono não é cliente: aparecer na lista dele confundiria. */
    it('não lista o próprio admin', async () => {
      const emails = (await get('/api/admin/customers'))
        .json()
        .items.map((c: { email: string }) => c.email);

      expect(emails).not.toContain('dono@chacara.local');
    });

    it('acha por nome, e-mail e telefone', async () => {
      await createUser({ name: 'Carla Dias', email: 'carla@exemplo.com', phone: '11977771234' });

      expect((await get('/api/admin/customers?q=carla')).json().total).toBe(1);
      expect((await get('/api/admin/customers?q=carla@exemplo.com')).json().total).toBe(1);
      expect((await get('/api/admin/customers?q=(11) 97777-1234')).json().total).toBe(1);
    });

    it('marca quem tem como entrar', async () => {
      const withAccess = await createUser({ name: 'Com Senha', email: 'senha@exemplo.com' });
      await prisma.user.update({
        where: { id: withAccess.id },
        data: { passwordHash: 'hash-de-teste', emailVerifiedAt: new Date() },
      });

      const body = (await get(`/api/admin/customers/${withAccess.id}`)).json();

      expect(body).toMatchObject({ hasAccess: true, emailVerified: true });
    });

    it('o detalhe traz o histórico de reservas', async () => {
      const customer = await createUser({ name: 'Carla Dias', email: 'carla@exemplo.com' });
      await createBooking({
        userId: customer.id,
        startDate: '2027-04-10',
        endDate: '2027-04-10',
        totalCents: 180000,
      });

      const body = (await get(`/api/admin/customers/${customer.id}`)).json();

      expect(body.bookingCount).toBe(1);
      expect(body.bookings).toHaveLength(1);
      expect(body.bookings[0]).toMatchObject({ startDate: '2027-04-10', totalCents: 180000 });
    });

    it('responde 404 para cliente que não existe', async () => {
      expect(
        (await get('/api/admin/customers/00000000-0000-4000-8000-000000000000')).statusCode,
      ).toBe(404);
    });

    it('não devolve hash de senha em lugar nenhum', async () => {
      const customer = await createUser({ name: 'Carla', email: 'carla@exemplo.com' });
      await prisma.user.update({
        where: { id: customer.id },
        data: { passwordHash: 'segredo-que-nao-pode-sair' },
      });

      expect((await get('/api/admin/customers')).body).not.toContain('segredo-que-nao-pode-sair');
      expect((await get(`/api/admin/customers/${customer.id}`)).body).not.toContain(
        'segredo-que-nao-pode-sair',
      );
    });
  });

  // ------------------------------------------------------------ reserva manual

  describe('POST /admin/bookings', () => {
    it('lança reserva para cliente existente, já confirmada', async () => {
      const customer = await createUser({ name: 'Carla Dias', email: 'carla@exemplo.com' });

      const response = await send('POST', '/api/admin/bookings', {
        ...TWO_DAYS,
        customerId: customer.id,
        confirmed: true,
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        status: 'CONFIRMED',
        holdExpiresAt: null,
        createdByAdmin: true,
        customer: { name: 'Carla Dias' },
      });
    });

    it('cria o cliente na hora e lança a reserva para ele', async () => {
      const response = await send('POST', '/api/admin/bookings', {
        ...TWO_DAYS,
        customer: { name: 'Novo Cliente', phone: '11966665555' },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().customer).toMatchObject({
        name: 'Novo Cliente',
        phone: '11966665555',
        email: null,
      });

      // E o cliente fica no cadastro, para a próxima reserva.
      expect((await get('/api/admin/customers?q=Novo')).json().total).toBe(1);
    });

    it('pode nascer aguardando confirmação', async () => {
      const customer = await createUser({ email: 'carla@exemplo.com' });

      const response = await send('POST', '/api/admin/bookings', {
        ...TWO_DAYS,
        customerId: customer.id,
        confirmed: false,
      });

      expect(response.json().status).toBe('PENDING');
      expect(response.json().holdExpiresAt).not.toBeNull();
    });

    it('guarda a nota interna junto', async () => {
      const customer = await createUser({ email: 'carla@exemplo.com' });

      const response = await send('POST', '/api/admin/bookings', {
        ...TWO_DAYS,
        customerId: customer.id,
        adminNotes: 'Fechado por telefone, paga na entrada.',
      });

      expect(response.json().adminNotes).toBe('Fechado por telefone, paga na entrada.');
    });

    it('exige um cliente, escolhido ou novo', async () => {
      const response = await send('POST', '/api/admin/bookings', TWO_DAYS);

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('recusa escolher e criar cliente ao mesmo tempo', async () => {
      const customer = await createUser({ email: 'carla@exemplo.com' });

      const response = await send('POST', '/api/admin/bookings', {
        ...TWO_DAYS,
        customerId: customer.id,
        customer: { name: 'Outro', phone: '11966665555' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('responde 404 para cliente que não existe', async () => {
      const response = await send('POST', '/api/admin/bookings', {
        ...TWO_DAYS,
        customerId: '00000000-0000-4000-8000-000000000000',
      });

      expect(response.statusCode).toBe(404);
    });

    /*
     * As dispensas da §9.8, uma por uma. Cada uma existe por um motivo diferente,
     * e nenhuma vale para o pedido feito pelo site.
     */
    describe('o que o painel dispensa', () => {
      it('aceita cliente sem e-mail confirmado', async () => {
        const customer = await createUser({ email: 'carla@exemplo.com' });
        // Sem `emailVerifiedAt`: o cliente pelo site receberia 403 aqui.

        const response = await send('POST', '/api/admin/bookings', {
          ...TWO_DAYS,
          customerId: customer.id,
        });

        expect(response.statusCode).toBe(201);
      });

      it('aceita cliente sem telefone', async () => {
        const customer = await createUser({ email: 'carla@exemplo.com', phone: null });

        const response = await send('POST', '/api/admin/bookings', {
          ...TWO_DAYS,
          customerId: customer.id,
        });

        expect(response.statusCode).toBe(201);
      });

      it('ignora o limite de pedidos abertos', async () => {
        const customer = await createUser({ email: 'carla@exemplo.com' });
        const future = new Date(Date.now() + 60 * 60 * 1000);

        // Dois pedidos abertos, que é o teto de `maxPendingPerUser`.
        await createBooking({
          userId: customer.id,
          startDate: '2027-06-01',
          endDate: '2027-06-01',
          holdExpiresAt: future,
        });
        await createBooking({
          userId: customer.id,
          startDate: '2027-06-05',
          endDate: '2027-06-05',
          holdExpiresAt: future,
        });

        const response = await send('POST', '/api/admin/bookings', {
          ...TWO_DAYS,
          customerId: customer.id,
          confirmed: false,
        });

        expect(response.statusCode).toBe(201);
      });
    });

    /*
     * O que o painel **não** dispensa: é o mesmo núcleo transacional, e é ele que
     * garante zero dupla reserva (§8.1, §9.3).
     */
    describe('o que continua valendo', () => {
      it('recusa data já reservada', async () => {
        const other = await createUser({ email: 'outro@exemplo.com' });
        await createBooking({
          userId: other.id,
          startDate: '2027-04-10',
          endDate: '2027-04-10',
          status: 'CONFIRMED',
        });

        const customer = await createUser({ email: 'carla@exemplo.com' });
        const response = await send('POST', '/api/admin/bookings', {
          ...TWO_DAYS,
          customerId: customer.id,
        });

        expect(response.statusCode).toBe(409);
        expect(response.json().error.code).toBe('DATE_UNAVAILABLE');
      });

      it('recusa dia bloqueado pelo próprio dono', async () => {
        await prisma.blockedDate.create({
          data: { date: parseISODate('2027-04-10'), reason: 'Manutenção' },
        });

        const customer = await createUser({ email: 'carla@exemplo.com' });
        const response = await send('POST', '/api/admin/bookings', {
          ...TWO_DAYS,
          customerId: customer.id,
        });

        expect(response.statusCode).toBe(409);
      });

      it('recusa total diferente do calculado', async () => {
        const customer = await createUser({ email: 'carla@exemplo.com' });

        const response = await send('POST', '/api/admin/bookings', {
          ...TWO_DAYS,
          customerId: customer.id,
          expectedTotalCents: 1,
        });

        expect(response.statusCode).toBe(409);
        expect(response.json().error.code).toBe('PRICE_CHANGED');
      });

      it('recusa item sem estoque', async () => {
        const category = await createCategory({});
        const item = await createItem({ categoryId: category.id, stock: 1, priceCents: 10000 });
        const customer = await createUser({ email: 'carla@exemplo.com' });

        const response = await send('POST', '/api/admin/bookings', {
          ...TWO_DAYS,
          customerId: customer.id,
          items: [{ itemId: item.id, quantity: 2 }],
          expectedTotalCents: BASE_DAILY * 2 + 20000,
        });

        expect(response.statusCode).toBe(409);
        expect(response.json().error.code).toBe('STOCK_INSUFFICIENT');
      });

      it('recusa mais convidados que a capacidade', async () => {
        const customer = await createUser({ email: 'carla@exemplo.com' });

        const response = await send('POST', '/api/admin/bookings', {
          ...TWO_DAYS,
          customerId: customer.id,
          guestCount: 500,
        });

        expect(response.statusCode).toBe(400);
      });

      it('grava o snapshot financeiro', async () => {
        const customer = await createUser({ email: 'carla@exemplo.com' });

        const response = await send('POST', '/api/admin/bookings', {
          ...TWO_DAYS,
          customerId: customer.id,
        });

        expect(response.json()).toMatchObject({
          dailyTotalCents: BASE_DAILY * 2,
          totalCents: BASE_DAILY * 2,
        });
        expect(response.json().days).toHaveLength(2);
      });

      it('a reserva lançada ocupa a data no site', async () => {
        const customer = await createUser({ email: 'carla@exemplo.com' });
        await send('POST', '/api/admin/bookings', { ...TWO_DAYS, customerId: customer.id });

        const availability = await app.inject({
          method: 'GET',
          url: '/api/availability?from=2027-04-09&to=2027-04-10',
        });

        expect(availability.json().days.map((d: { status: string }) => d.status)).toEqual([
          'booked',
          'booked',
        ]);
      });
    });

    /*
     * §17: o dono não se avisa do que ele mesmo digitou, e o cliente só é avisado
     * quando a reserva nasce confirmada — "recebemos seu pedido" confundiria quem
     * não pediu nada.
     */
    describe('e-mails', () => {
      it('avisa o cliente quando a reserva nasce confirmada', async () => {
        const customer = await createUser({ name: 'Carla', email: 'carla@exemplo.com' });

        await send('POST', '/api/admin/bookings', {
          ...TWO_DAYS,
          customerId: customer.id,
          confirmed: true,
        });

        expect(outbox).toHaveLength(1);
        expect(outbox[0]?.to).toBe('carla@exemplo.com');
        expect(outbox[0]?.subject).toContain('confirmada');
        expect(outbox[0]?.text).toContain('Estrada do Sol, 100');
      });

      it('não manda nada quando o dono deixa aguardando', async () => {
        const customer = await createUser({ email: 'carla@exemplo.com' });

        await send('POST', '/api/admin/bookings', {
          ...TWO_DAYS,
          customerId: customer.id,
          confirmed: false,
        });

        expect(outbox).toEqual([]);
      });

      it('não avisa o dono de uma reserva que ele mesmo lançou', async () => {
        const customer = await createUser({ email: 'carla@exemplo.com' });

        await send('POST', '/api/admin/bookings', {
          ...TWO_DAYS,
          customerId: customer.id,
          confirmed: true,
        });

        expect(outbox.map((mail) => mail.to)).not.toContain('dono@chacara.local');
      });

      it('não tenta mandar e-mail para cliente sem endereço', async () => {
        const response = await send('POST', '/api/admin/bookings', {
          ...TWO_DAYS,
          customer: { name: 'Sem E-mail', phone: '11966665555' },
          confirmed: true,
        });

        expect(response.statusCode).toBe(201);
        expect(outbox).toEqual([]);
      });
    });
  });

  // ------------------------------------------------------------- configurações

  describe('configurações', () => {
    it('devolve todos os campos editáveis', async () => {
      const response = await get('/api/admin/settings');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        name: 'Chácara Seu Evento',
        baseDailyPriceCents: BASE_DAILY,
        maxGuests: 120,
        minDays: 1,
        maxDays: 3,
        minLeadDays: 2,
        maxPendingPerUser: 2,
        checkInTime: '08:00',
        checkOutTime: '22:00',
      });
    });

    it('recusa quem não é admin', async () => {
      expect((await get('/api/admin/settings', clientToken)).statusCode).toBe(403);
    });

    async function put(overrides: Record<string, unknown> = {}) {
      const current = (await get('/api/admin/settings')).json();
      return send('PUT', '/api/admin/settings', { ...current, ...overrides });
    }

    it('salva a mudança', async () => {
      const response = await put({ maxGuests: 90, name: 'Chácara Nova' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ maxGuests: 90, name: 'Chácara Nova' });
    });

    /* A configuração governa o resto do sistema: mudar aqui muda o que o site aceita. */
    it('a nova capacidade passa a valer no pedido do cliente', async () => {
      await put({ maxGuests: 50 });

      const customer = await createUser({ email: 'carla@exemplo.com' });
      const response = await send('POST', '/api/admin/bookings', {
        ...TWO_DAYS,
        customerId: customer.id,
        guestCount: 80,
      });

      expect(response.statusCode).toBe(400);
    });

    it('o novo preço base vale no orçamento', async () => {
      await put({ baseDailyPriceCents: 200000 });

      const quote = await app.inject({
        method: 'POST',
        url: '/api/pricing/quote',
        payload: { startDate: '2027-04-09', endDate: '2027-04-09', items: [] },
      });

      expect(quote.json().totalCents).toBe(200000);
    });

    it('aparece na resposta pública da chácara', async () => {
      await put({ name: 'Chácara Nova', whatsapp: '11955554444' });

      const venue = await app.inject({ method: 'GET', url: '/api/public/venue' });

      expect(venue.json()).toMatchObject({ name: 'Chácara Nova', whatsapp: '11955554444' });
    });

    /*
     * Mínimo acima do máximo deixaria **nenhuma** duração válida: o site recusaria
     * toda reserva, e o erro apareceria longe da causa.
     */
    it('recusa mínimo de dias maior que o máximo', async () => {
      const response = await put({ minDays: 5, maxDays: 2 });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('recusa horário fora do formato', async () => {
      expect((await put({ checkInTime: '8h' })).statusCode).toBe(400);
      expect((await put({ checkOutTime: '25:00' })).statusCode).toBe(400);
    });

    it('recusa prazo de pedido zerado', async () => {
      expect((await put({ holdHours: 0 })).statusCode).toBe(400);
    });

    it('recusa capacidade zerada', async () => {
      expect((await put({ maxGuests: 0 })).statusCode).toBe(400);
    });

    it('aceita limpar os campos opcionais', async () => {
      const response = await put({ whatsapp: '', address: '', mapsUrl: '', houseRules: '' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        whatsapp: null,
        address: null,
        mapsUrl: null,
        houseRules: null,
      });
    });

    /* O link vai para a landing; `http` ali viraria aviso de conteúdo misto. */
    it('recusa mapa que não seja https', async () => {
      expect((await put({ mapsUrl: 'http://maps.exemplo.com/x' })).statusCode).toBe(400);
      expect((await put({ mapsUrl: 'https://maps.exemplo.com/x' })).statusCode).toBe(200);
    });
  });
});
