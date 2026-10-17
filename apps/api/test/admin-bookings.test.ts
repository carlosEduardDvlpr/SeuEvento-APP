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
const { addDays, todayInSaoPaulo } = await import('../src/lib/dates.js');
const { allowedAdminTransitions } = await import('../src/modules/admin/bookings-service.js');
const { prisma, truncateAll } = await import('./helpers/db.js');
const { createBooking, createUser } = await import('./helpers/factories.js');

/**
 * Reservas no painel (§11.2, §13.4).
 *
 * O que está sob teste é a máquina de estados da §9.2 vista pelo lado do dono: as
 * transições permitidas, a recusa das outras, e o e-mail que o cliente recebe em
 * cada decisão (§17).
 */
describe('reservas no painel', () => {
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
    outbox.length = 0;

    await prisma.venueSettings.create({
      data: {
        id: 1,
        name: 'Chácara Seu Evento',
        baseDailyPriceCents: 150000,
        maxGuests: 120,
        checkInTime: '08:00',
        checkOutTime: '22:00',
        address: 'Estrada do Sol, 100',
        houseRules: 'Som até 22h.',
        whatsapp: '11988887777',
      },
    });

    const admin = await createUser({ email: 'dono@chacara.local', role: 'ADMIN' });
    adminToken = app.jwt.sign({ sub: admin.id, role: admin.role });

    const client = await createUser({
      name: 'Ana Beatriz',
      email: 'ana@exemplo.com',
      phone: '11999990000',
    });
    clientId = client.id;
    clientToken = app.jwt.sign({ sub: client.id, role: client.role });
  });

  function get(url: string, token = adminToken) {
    return app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } });
  }

  function patch(url: string, payload: unknown, token = adminToken) {
    return app.inject({
      method: 'PATCH',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload: payload as object,
    });
  }

  function booking(overrides: Parameters<typeof createBooking>[0]) {
    return createBooking(overrides);
  }

  // ------------------------------------------------------------------ acesso

  it('recusa quem não é admin', async () => {
    expect((await get('/api/admin/bookings', clientToken)).statusCode).toBe(403);
  });

  // -------------------------------------------------------- allowedTransitions

  describe('allowedAdminTransitions', () => {
    it('pedido pode ser confirmado ou recusado', () => {
      expect(allowedAdminTransitions('PENDING')).toEqual(['CONFIRMED', 'CANCELLED']);
    });

    /* O prazo de `freeCancelUntilDays` é do cliente; o dono cancela sempre (§9.2). */
    it('confirmada pode ser cancelada ou concluída', () => {
      expect(allowedAdminTransitions('CONFIRMED')).toEqual(['CANCELLED', 'COMPLETED']);
    });

    it('cancelada e concluída são finais', () => {
      expect(allowedAdminTransitions('CANCELLED')).toEqual([]);
      expect(allowedAdminTransitions('COMPLETED')).toEqual([]);
    });
  });

  // -------------------------------------------------------------------- lista

  describe('GET /admin/bookings', () => {
    it('devolve página vazia quando não há reserva', async () => {
      const response = await get('/api/admin/bookings');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
    });

    it('traz o cliente em cada linha', async () => {
      await booking({
        userId: clientId,
        startDate: '2027-04-10',
        endDate: '2027-04-10',
        totalCents: 350000,
      });

      const body = (await get('/api/admin/bookings')).json();

      expect(body.items[0]).toMatchObject({
        totalCents: 350000,
        customer: { name: 'Ana Beatriz', email: 'ana@exemplo.com', phone: '11999990000' },
      });
    });

    it('ordena da festa mais distante para a mais antiga', async () => {
      await booking({ userId: clientId, startDate: '2027-04-10', endDate: '2027-04-10' });
      await booking({ userId: clientId, startDate: '2027-06-10', endDate: '2027-06-10' });
      await booking({ userId: clientId, startDate: '2027-05-10', endDate: '2027-05-10' });

      const body = (await get('/api/admin/bookings')).json();

      expect(body.items.map((item: { startDate: string }) => item.startDate)).toEqual([
        '2027-06-10',
        '2027-05-10',
        '2027-04-10',
      ]);
    });

    it('inclui cancelada, ao contrário do calendário', async () => {
      await booking({
        userId: clientId,
        startDate: '2027-04-10',
        endDate: '2027-04-10',
        status: 'CANCELLED',
      });

      expect((await get('/api/admin/bookings')).json().total).toBe(1);
    });

    it('filtra por situação', async () => {
      await booking({ userId: clientId, startDate: '2027-04-10', endDate: '2027-04-10' });
      await booking({
        userId: clientId,
        startDate: '2027-05-10',
        endDate: '2027-05-10',
        status: 'CONFIRMED',
      });

      const body = (await get('/api/admin/bookings?status=CONFIRMED')).json();

      expect(body.total).toBe(1);
      expect(body.items[0].startDate).toBe('2027-05-10');
    });

    /*
     * O período filtra por **sobreposição**: quem procura uma semana quer a festa
     * de três dias que começou antes e atravessa.
     */
    it('encontra a reserva que atravessa o período pedido', async () => {
      await booking({ userId: clientId, startDate: '2027-04-09', endDate: '2027-04-12' });

      const body = (await get('/api/admin/bookings?from=2027-04-11&to=2027-04-11')).json();

      expect(body.total).toBe(1);
    });

    it('deixa fora o que está todo antes do período', async () => {
      await booking({ userId: clientId, startDate: '2027-04-01', endDate: '2027-04-02' });

      expect((await get('/api/admin/bookings?from=2027-04-10&to=2027-04-20')).json().total).toBe(0);
    });

    it('deixa fora o que está todo depois do período', async () => {
      await booking({ userId: clientId, startDate: '2027-05-01', endDate: '2027-05-02' });

      expect((await get('/api/admin/bookings?from=2027-04-10&to=2027-04-20')).json().total).toBe(0);
    });

    it('aceita só uma das pontas do período', async () => {
      await booking({ userId: clientId, startDate: '2027-04-10', endDate: '2027-04-10' });

      expect((await get('/api/admin/bookings?from=2027-04-01')).json().total).toBe(1);
      expect((await get('/api/admin/bookings?to=2027-04-30')).json().total).toBe(1);
      expect((await get('/api/admin/bookings?from=2027-05-01')).json().total).toBe(0);
    });

    describe('busca', () => {
      beforeEach(async () => {
        const bia = await createUser({
          name: 'Bia Costa',
          email: 'bia@outro.com',
          phone: '21977776666',
        });
        await booking({ userId: clientId, startDate: '2027-04-10', endDate: '2027-04-10' });
        await booking({ userId: bia.id, startDate: '2027-05-10', endDate: '2027-05-10' });
      });

      it('acha pelo nome, sem exigir maiúsculas', async () => {
        expect((await get('/api/admin/bookings?q=ana')).json().total).toBe(1);
        expect((await get('/api/admin/bookings?q=BIA')).json().total).toBe(1);
      });

      it('acha por parte do nome', async () => {
        expect((await get('/api/admin/bookings?q=Costa')).json().total).toBe(1);
      });

      it('acha pelo e-mail', async () => {
        expect((await get('/api/admin/bookings?q=bia@outro.com')).json().total).toBe(1);
      });

      it('acha pelo telefone', async () => {
        expect((await get('/api/admin/bookings?q=21977776666')).json().total).toBe(1);
      });

      /* O dono cola o número como está na agenda, com pontuação. */
      it('acha o telefone digitado com pontuação', async () => {
        expect((await get('/api/admin/bookings?q=(21) 97777-6666')).json().total).toBe(1);
      });

      it('devolve vazio para quem não existe', async () => {
        expect((await get('/api/admin/bookings?q=ninguem')).json().total).toBe(0);
      });
    });

    describe('paginação', () => {
      beforeEach(async () => {
        for (let day = 1; day <= 5; day += 1) {
          await booking({
            userId: clientId,
            startDate: `2027-04-0${day}`,
            endDate: `2027-04-0${day}`,
          });
        }
      });

      it('respeita o tamanho de página e informa o total', async () => {
        const body = (await get('/api/admin/bookings?pageSize=2')).json();

        expect(body.items).toHaveLength(2);
        expect(body).toMatchObject({ total: 5, page: 1, pageSize: 2 });
      });

      it('a segunda página continua de onde a primeira parou', async () => {
        const first = (await get('/api/admin/bookings?pageSize=2&page=1')).json();
        const second = (await get('/api/admin/bookings?pageSize=2&page=2')).json();

        const ids = new Set(first.items.map((item: { id: string }) => item.id));

        expect(second.items.some((item: { id: string }) => ids.has(item.id))).toBe(false);
      });

      it('página além do fim devolve lista vazia, não erro', async () => {
        const body = (await get('/api/admin/bookings?pageSize=2&page=9')).json();

        expect(body.items).toEqual([]);
        expect(body.total).toBe(5);
      });

      it('recusa tamanho de página fora do limite', async () => {
        expect((await get('/api/admin/bookings?pageSize=500')).statusCode).toBe(400);
        expect((await get('/api/admin/bookings?page=0')).statusCode).toBe(400);
      });
    });
  });

  // ------------------------------------------------------------------ detalhe

  describe('GET /admin/bookings/:id', () => {
    it('traz nota interna, cliente e transições possíveis', async () => {
      const created = await booking({
        userId: clientId,
        startDate: '2027-04-10',
        endDate: '2027-04-10',
      });
      await prisma.booking.update({
        where: { id: created.id },
        data: { adminNotes: 'Cliente pediu desconto.' },
      });

      const body = (await get(`/api/admin/bookings/${created.id}`)).json();

      expect(body).toMatchObject({
        adminNotes: 'Cliente pediu desconto.',
        allowedTransitions: ['CONFIRMED', 'CANCELLED'],
        customer: { name: 'Ana Beatriz' },
      });
    });

    /* Ao contrário do cliente, o dono vê reserva de qualquer pessoa. */
    it('abre reserva de qualquer cliente', async () => {
      const other = await createUser({ email: 'outro@exemplo.com' });
      const created = await booking({
        userId: other.id,
        startDate: '2027-04-10',
        endDate: '2027-04-10',
      });

      expect((await get(`/api/admin/bookings/${created.id}`)).statusCode).toBe(200);
    });

    it('responde 404 para id que não existe', async () => {
      const response = await get('/api/admin/bookings/00000000-0000-4000-8000-000000000000');

      expect(response.statusCode).toBe(404);
    });
  });

  // ------------------------------------------------------------------- status

  describe('PATCH /admin/bookings/:id/status', () => {
    it('confirma o pedido e limpa o prazo', async () => {
      const created = await booking({
        userId: clientId,
        startDate: '2027-04-10',
        endDate: '2027-04-10',
        holdExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      const response = await patch(`/api/admin/bookings/${created.id}/status`, {
        status: 'CONFIRMED',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        status: 'CONFIRMED',
        holdExpiresAt: null,
        allowedTransitions: ['CANCELLED', 'COMPLETED'],
      });
    });

    /* §17: o e-mail de confirmação carrega o que a pessoa precisa no dia. */
    it('avisa o cliente com horários, endereço e regras', async () => {
      const created = await booking({
        userId: clientId,
        startDate: '2027-04-10',
        endDate: '2027-04-10',
        totalCents: 180000,
      });

      await patch(`/api/admin/bookings/${created.id}/status`, { status: 'CONFIRMED' });

      expect(outbox).toHaveLength(1);
      expect(outbox[0]?.to).toBe('ana@exemplo.com');
      expect(outbox[0]?.subject).toContain('confirmada');
      expect(outbox[0]?.text).toContain('08:00');
      expect(outbox[0]?.text).toContain('22:00');
      expect(outbox[0]?.text).toContain('Estrada do Sol, 100');
      expect(outbox[0]?.text).toContain('Som até 22h.');
      expect(outbox[0]?.text).toContain('R$');
    });

    it('cancela com o motivo e registra que foi o dono', async () => {
      const created = await booking({
        userId: clientId,
        startDate: '2027-04-10',
        endDate: '2027-04-10',
        status: 'CONFIRMED',
      });

      const response = await patch(`/api/admin/bookings/${created.id}/status`, {
        status: 'CANCELLED',
        reason: 'Data reservada por engano.',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        status: 'CANCELLED',
        cancelReason: 'Data reservada por engano.',
        cancelledBy: 'ADMIN',
        allowedTransitions: [],
      });
    });

    it('manda o motivo no e-mail de cancelamento', async () => {
      const created = await booking({
        userId: clientId,
        startDate: '2027-04-10',
        endDate: '2027-04-10',
        status: 'CONFIRMED',
      });

      await patch(`/api/admin/bookings/${created.id}/status`, {
        status: 'CANCELLED',
        reason: 'Obra na cozinha.',
      });

      expect(outbox[0]?.text).toContain('Obra na cozinha.');
      expect(outbox[0]?.text).toContain('11988887777');
    });

    /* §11.3: o motivo é obrigatório para cancelar — vai no e-mail do cliente. */
    it('recusa cancelamento sem motivo', async () => {
      const created = await booking({
        userId: clientId,
        startDate: '2027-04-10',
        endDate: '2027-04-10',
        status: 'CONFIRMED',
      });

      const response = await patch(`/api/admin/bookings/${created.id}/status`, {
        status: 'CANCELLED',
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('recusa motivo em branco', async () => {
      const created = await booking({
        userId: clientId,
        startDate: '2027-04-10',
        endDate: '2027-04-10',
        status: 'CONFIRMED',
      });

      const response = await patch(`/api/admin/bookings/${created.id}/status`, {
        status: 'CANCELLED',
        reason: '   ',
      });

      expect(response.statusCode).toBe(400);
    });

    it('conclui a reserva sem mandar e-mail', async () => {
      const created = await booking({
        userId: clientId,
        startDate: '2027-04-10',
        endDate: '2027-04-10',
        status: 'CONFIRMED',
      });

      const response = await patch(`/api/admin/bookings/${created.id}/status`, {
        status: 'COMPLETED',
      });

      expect(response.json().status).toBe('COMPLETED');
      // A festa aconteceu; avisar que "foi concluída" seria ruído (§17).
      expect(outbox).toEqual([]);
    });

    it('recusa transição que a §9.2 não permite', async () => {
      const created = await booking({
        userId: clientId,
        startDate: '2027-04-10',
        endDate: '2027-04-10',
        status: 'CANCELLED',
      });

      const response = await patch(`/api/admin/bookings/${created.id}/status`, {
        status: 'CONFIRMED',
      });

      expect(response.statusCode).toBe(422);
      expect(response.json().error.code).toBe('INVALID_TRANSITION');
    });

    it('recusa confirmar o que já está confirmado', async () => {
      const created = await booking({
        userId: clientId,
        startDate: '2027-04-10',
        endDate: '2027-04-10',
        status: 'CONFIRMED',
      });

      const response = await patch(`/api/admin/bookings/${created.id}/status`, {
        status: 'CONFIRMED',
      });

      expect(response.statusCode).toBe(422);
      expect(response.json().error.message).toContain('já está nesse estado');
    });

    it('recusa pular de pedido direto para concluída', async () => {
      const created = await booking({
        userId: clientId,
        startDate: '2027-04-10',
        endDate: '2027-04-10',
      });

      expect(
        (await patch(`/api/admin/bookings/${created.id}/status`, { status: 'COMPLETED' }))
          .statusCode,
      ).toBe(422);
    });

    it('não envia e-mail para cliente sem endereço', async () => {
      const silent = await createUser({ name: 'Sem E-mail', email: null });
      const created = await booking({
        userId: silent.id,
        startDate: '2027-04-10',
        endDate: '2027-04-10',
      });

      const response = await patch(`/api/admin/bookings/${created.id}/status`, {
        status: 'CONFIRMED',
      });

      expect(response.statusCode).toBe(200);
      expect(outbox).toEqual([]);
    });

    it('responde 404 para id que não existe', async () => {
      const response = await patch(
        '/api/admin/bookings/00000000-0000-4000-8000-000000000000/status',
        { status: 'CONFIRMED' },
      );

      expect(response.statusCode).toBe(404);
    });

    /*
     * Confirmar libera a data do prazo, então a reserva passa a ocupar o dia por
     * ser confirmada — e o job de expiração não pode mais tocá-la.
     */
    it('a reserva confirmada continua ocupando a data', async () => {
      const today = todayInSaoPaulo();
      const date = addDays(today, 10);
      const created = await booking({
        userId: clientId,
        startDate: date,
        endDate: date,
        holdExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      await patch(`/api/admin/bookings/${created.id}/status`, { status: 'CONFIRMED' });

      const availability = await app.inject({
        method: 'GET',
        url: `/api/availability?from=${date}&to=${date}`,
      });

      expect(availability.json().days[0].status).toBe('booked');
    });

    it('cancelar devolve a data ao calendário', async () => {
      const today = todayInSaoPaulo();
      const date = addDays(today, 10);
      const created = await booking({
        userId: clientId,
        startDate: date,
        endDate: date,
        status: 'CONFIRMED',
      });

      await patch(`/api/admin/bookings/${created.id}/status`, {
        status: 'CANCELLED',
        reason: 'Mudança de planos.',
      });

      const availability = await app.inject({
        method: 'GET',
        url: `/api/availability?from=${date}&to=${date}`,
      });

      expect(availability.json().days[0].status).toBe('free');
    });
  });

  // -------------------------------------------------------------------- notas

  describe('PATCH /admin/bookings/:id/notes', () => {
    it('guarda a anotação interna', async () => {
      const created = await booking({
        userId: clientId,
        startDate: '2027-04-10',
        endDate: '2027-04-10',
      });

      const response = await patch(`/api/admin/bookings/${created.id}/notes`, {
        adminNotes: 'Combinou retirada na sexta.',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().adminNotes).toBe('Combinou retirada na sexta.');
    });

    it('texto vazio apaga a anotação', async () => {
      const created = await booking({
        userId: clientId,
        startDate: '2027-04-10',
        endDate: '2027-04-10',
      });
      await patch(`/api/admin/bookings/${created.id}/notes`, { adminNotes: 'Algo' });

      const response = await patch(`/api/admin/bookings/${created.id}/notes`, { adminNotes: '' });

      expect(response.json().adminNotes).toBeNull();
    });

    it('não muda a situação da reserva nem avisa o cliente', async () => {
      const created = await booking({
        userId: clientId,
        startDate: '2027-04-10',
        endDate: '2027-04-10',
      });

      const response = await patch(`/api/admin/bookings/${created.id}/notes`, {
        adminNotes: 'Nota',
      });

      expect(response.json().status).toBe('PENDING');
      expect(outbox).toEqual([]);
    });

    /* §13.4: nota interna nunca sai para o cliente. */
    it('a anotação não aparece na resposta do cliente', async () => {
      const created = await booking({
        userId: clientId,
        startDate: '2027-04-10',
        endDate: '2027-04-10',
      });
      await patch(`/api/admin/bookings/${created.id}/notes`, {
        adminNotes: 'Pediu desconto por telefone.',
      });

      const response = await get(`/api/bookings/${created.id}`, clientToken);

      expect(response.body).not.toContain('desconto por telefone');
      expect(response.json()).not.toHaveProperty('adminNotes');
    });

    it('responde 404 para id que não existe', async () => {
      const response = await patch(
        '/api/admin/bookings/00000000-0000-4000-8000-000000000000/notes',
        { adminNotes: 'Nota' },
      );

      expect(response.statusCode).toBe(404);
    });
  });
});
