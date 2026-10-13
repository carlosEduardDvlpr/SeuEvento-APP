import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { addDays, parseISODate, todayInSaoPaulo } from '../src/lib/dates.js';
import { prisma, truncateAll } from './helpers/db.js';
import { createBooking, createUser } from './helpers/factories.js';

/**
 * Disponibilidade de datas (§9.1, §11.3) e bloqueios (§11.2).
 *
 * Duas coisas estão sob teste: a precedência entre os quatro estados, que a §9.1
 * fixa como bloqueio → reserva → antecedência → livre, e o silêncio da rota
 * pública sobre quem reservou (§2.3).
 *
 * Datas de 2027 nos casos de ocupação, para a antecedência mínima nunca
 * interferir no que se está medindo.
 */
describe('disponibilidade', () => {
  let app: FastifyInstance;
  let adminToken: string;

  const MIN_LEAD_DAYS = 2;

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
        minLeadDays: MIN_LEAD_DAYS,
      },
    });

    const admin = await createUser({ email: 'dono@chacara.local', role: 'ADMIN' });
    adminToken = app.jwt.sign({ sub: admin.id, role: admin.role });
  });

  function availability(from: string, to: string) {
    return app.inject({ method: 'GET', url: `/api/availability?from=${from}&to=${to}` });
  }

  function asAdmin(
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    payload?: Record<string, unknown>,
  ) {
    return app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${adminToken}` },
      payload,
    });
  }

  async function bookDays(
    startDate: string,
    endDate: string,
    overrides: {
      status?: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';
      holdExpiresAt?: Date | null;
    } = {},
  ) {
    const user = await createUser({});
    return createBooking({ userId: user.id, startDate, endDate, ...overrides });
  }

  function blockDay(date: string, reason: string | null = 'Manutenção') {
    return prisma.blockedDate.create({ data: { date: parseISODate(date), reason } });
  }

  function statusOf(response: { json: () => { days: { date: string; status: string }[] } }) {
    return Object.fromEntries(response.json().days.map((day) => [day.date, day.status]));
  }

  describe('GET /availability', () => {
    it('devolve um estado para cada dia, incluindo as duas pontas', async () => {
      const response = await availability('2027-05-10', '2027-05-12');

      expect(response.statusCode).toBe(200);
      expect(response.json().days.map((day: { date: string }) => day.date)).toEqual([
        '2027-05-10',
        '2027-05-11',
        '2027-05-12',
      ]);
    });

    it('dia sem nada é livre', async () => {
      const response = await availability('2027-05-10', '2027-05-10');

      expect(response.json().days).toEqual([{ date: '2027-05-10', status: 'free' }]);
    });

    it('marca todos os dias da reserva confirmada, não só o primeiro', async () => {
      await bookDays('2027-05-11', '2027-05-12', { status: 'CONFIRMED' });

      const response = await availability('2027-05-10', '2027-05-13');

      expect(statusOf(response)).toEqual({
        '2027-05-10': 'free',
        '2027-05-11': 'booked',
        '2027-05-12': 'booked',
        '2027-05-13': 'free',
      });
    });

    it('pedido dentro do prazo ocupa a data', async () => {
      await bookDays('2027-05-10', '2027-05-10', {
        status: 'PENDING',
        holdExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      const response = await availability('2027-05-10', '2027-05-10');

      expect(statusOf(response)).toEqual({ '2027-05-10': 'booked' });
    });

    /*
     * A consulta ignora pedido vencido em vez de esperar o job de expiração: sem
     * isso a data ficaria presa até o ciclo de 15 minutos seguinte.
     */
    it('pedido com prazo vencido libera a data', async () => {
      await bookDays('2027-05-10', '2027-05-10', {
        status: 'PENDING',
        holdExpiresAt: new Date(Date.now() - 60 * 60 * 1000),
      });

      const response = await availability('2027-05-10', '2027-05-10');

      expect(statusOf(response)).toEqual({ '2027-05-10': 'free' });
    });

    it('reserva cancelada ou concluída não ocupa a data', async () => {
      await bookDays('2027-05-10', '2027-05-10', { status: 'CANCELLED' });
      await bookDays('2027-05-11', '2027-05-11', { status: 'COMPLETED' });

      const response = await availability('2027-05-10', '2027-05-11');

      expect(statusOf(response)).toEqual({ '2027-05-10': 'free', '2027-05-11': 'free' });
    });

    it('dia bloqueado pelo admin aparece como bloqueado', async () => {
      await blockDay('2027-05-11');

      const response = await availability('2027-05-10', '2027-05-11');

      expect(statusOf(response)).toEqual({ '2027-05-10': 'free', '2027-05-11': 'blocked' });
    });

    /* Ordem da §9.1: um dia pode cair em mais de um caso, e vence o primeiro. */
    it('bloqueio vence reserva', async () => {
      await bookDays('2027-05-10', '2027-05-10', { status: 'CONFIRMED' });
      await blockDay('2027-05-10');

      const response = await availability('2027-05-10', '2027-05-10');

      expect(statusOf(response)).toEqual({ '2027-05-10': 'blocked' });
    });

    it('reserva vence antecedência', async () => {
      // Ontem: cairia em `past`, mas a reserva tem precedência.
      const yesterday = addDays(todayInSaoPaulo(), -1);
      await bookDays(yesterday, yesterday, { status: 'CONFIRMED' });

      const response = await availability(yesterday, yesterday);

      expect(statusOf(response)[yesterday]).toBe('booked');
    });

    it('dia dentro da antecedência mínima não pode ser reservado', async () => {
      const today = todayInSaoPaulo();
      const tomorrow = addDays(today, 1);
      const earliest = addDays(today, MIN_LEAD_DAYS);

      const response = await availability(today, earliest);

      expect(statusOf(response)[today]).toBe('past');
      expect(statusOf(response)[tomorrow]).toBe('past');
      // Hoje + antecedência já é o primeiro dia reservável.
      expect(statusOf(response)[earliest]).toBe('free');
    });

    /* A resposta pública diz livre/ocupado e nada mais (§2.3, §11.3). */
    it('não revela nada sobre quem reservou', async () => {
      const user = await createUser({ name: 'Ana Beatriz', email: 'ana@exemplo.com' });
      await createBooking({
        userId: user.id,
        startDate: '2027-05-10',
        endDate: '2027-05-10',
        status: 'CONFIRMED',
      });

      const response = await availability('2027-05-10', '2027-05-10');

      expect(response.body).not.toContain('Ana');
      expect(response.body).not.toContain('ana@exemplo.com');
      expect(response.body).not.toContain(user.id);
      expect(Object.keys(response.json().days[0])).toEqual(['date', 'status']);
    });

    it('é cacheável por pouco tempo', async () => {
      const response = await availability('2027-05-10', '2027-05-10');

      expect(response.headers['cache-control']).toBe('public, max-age=30');
    });

    it('não exige autenticação', async () => {
      const response = await availability('2027-05-10', '2027-05-10');

      expect(response.statusCode).toBe(200);
    });

    it('recusa período invertido', async () => {
      const response = await availability('2027-05-12', '2027-05-10');

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details.context).toBe('querystring');
    });

    /* Sem teto, um pedido de cem anos viraria 36 mil linhas numa rota pública. */
    it('recusa período maior que o teto', async () => {
      const response = await availability('2027-01-01', '2027-12-31');

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details).toEqual({ maxDays: 120, requestedDays: 365 });
    });

    it('aceita exatamente o teto', async () => {
      // 01/01 a 30/04/2027 são 120 dias.
      const response = await availability('2027-01-01', '2027-04-30');

      expect(response.statusCode).toBe(200);
      expect(response.json().days).toHaveLength(120);
    });

    it('recusa data fora do formato', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/availability?from=10/05/2027&to=2027-05-12',
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('bloqueios do admin', () => {
    it('bloqueia um dia com motivo', async () => {
      const response = await asAdmin('POST', '/api/admin/blocked-dates', {
        date: '2027-05-10',
        reason: 'Manutenção da piscina',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ date: '2027-05-10', reason: 'Manutenção da piscina' });
    });

    it('aceita bloqueio sem motivo', async () => {
      const response = await asAdmin('POST', '/api/admin/blocked-dates', { date: '2027-05-10' });

      expect(response.json()).toEqual({ date: '2027-05-10', reason: null });
    });

    /*
     * Bloquear um dia já bloqueado é o que o dono faz para corrigir o motivo.
     * Recusar com "já existe" o obrigaria a desbloquear e bloquear de novo.
     */
    it('bloquear de novo atualiza o motivo', async () => {
      await asAdmin('POST', '/api/admin/blocked-dates', {
        date: '2027-05-10',
        reason: 'Manutenção',
      });

      const response = await asAdmin('POST', '/api/admin/blocked-dates', {
        date: '2027-05-10',
        reason: 'Uso da família',
      });

      expect(response.json().reason).toBe('Uso da família');
      expect(await prisma.blockedDate.count()).toBe(1);
    });

    it('lista em ordem de data', async () => {
      await blockDay('2027-05-20', 'Depois');
      await blockDay('2027-05-10', 'Antes');

      const response = await asAdmin('GET', '/api/admin/blocked-dates');

      expect(response.json()).toEqual([
        { date: '2027-05-10', reason: 'Antes' },
        { date: '2027-05-20', reason: 'Depois' },
      ]);
    });

    it('filtra por período', async () => {
      await blockDay('2027-05-10');
      await blockDay('2027-06-10');

      const response = await asAdmin(
        'GET',
        '/api/admin/blocked-dates?from=2027-06-01&to=2027-06-30',
      );

      expect(response.json().map((block: { date: string }) => block.date)).toEqual(['2027-06-10']);
    });

    it('desbloqueia o dia', async () => {
      await blockDay('2027-05-10');

      const response = await asAdmin('DELETE', '/api/admin/blocked-dates/2027-05-10');

      expect(response.statusCode).toBe(204);
      expect(await prisma.blockedDate.count()).toBe(0);
    });

    it('devolve 404 ao desbloquear dia que não estava bloqueado', async () => {
      const response = await asAdmin('DELETE', '/api/admin/blocked-dates/2027-05-10');

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('NOT_FOUND');
    });

    it('recusa dia fora do formato na rota', async () => {
      const response = await asAdmin('DELETE', '/api/admin/blocked-dates/10-05-2027');

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details.context).toBe('params');
    });

    it('recusa quem não é admin', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/admin/blocked-dates' });

      expect(response.statusCode).toBe(401);
    });

    /*
     * Permitido de propósito: é o que se faz quando a chácara fica indisponível
     * de verdade e as reservas ainda precisam ser canceladas uma a uma.
     */
    it('bloquear dia com reserva ativa é permitido, e o bloqueio aparece', async () => {
      await bookDays('2027-05-10', '2027-05-10', { status: 'CONFIRMED' });

      const blocked = await asAdmin('POST', '/api/admin/blocked-dates', { date: '2027-05-10' });
      expect(blocked.statusCode).toBe(200);

      const response = await availability('2027-05-10', '2027-05-10');
      expect(statusOf(response)).toEqual({ '2027-05-10': 'blocked' });
    });

    /* Desbloquear devolve o dia ao estado que ele tinha antes, não a "livre". */
    it('desbloquear revela a reserva que estava embaixo', async () => {
      await bookDays('2027-05-10', '2027-05-10', { status: 'CONFIRMED' });
      await blockDay('2027-05-10');

      await asAdmin('DELETE', '/api/admin/blocked-dates/2027-05-10');

      const response = await availability('2027-05-10', '2027-05-10');
      expect(statusOf(response)).toEqual({ '2027-05-10': 'booked' });
    });
  });
});
