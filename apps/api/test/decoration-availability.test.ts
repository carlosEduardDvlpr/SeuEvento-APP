import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { addDays, parseISODate, todayInSaoPaulo } from '../src/lib/dates.js';
import { prisma, truncateAll } from './helpers/db.js';
import { createBooking, createCategory, createItem, createUser } from './helpers/factories.js';

/**
 * Disponibilidade de cada decoração (novembro de 2026).
 *
 * Duas perguntas públicas, com a mesma conta de estoque da §9.3 por baixo:
 *
 * - `GET /availability?itemId=`: o calendário de uma decoração. O dia em que
 *   todo o estoque dela já saiu fica `booked`, e o dia em que a decoração está
 *   fechada fica `blocked`.
 * - `GET /items/availability`: quantas unidades de cada decoração ainda estão
 *   livres no período, contando o pior dia.
 *
 * Nos dois casos contam as reservas ativas dos **dois** produtos: o painel que
 * saiu para a chácara e o que saiu sozinho são o mesmo painel (§9.10).
 *
 * Datas de 2027, para a antecedência mínima não interferir no que se mede.
 */
describe('disponibilidade das decorações', () => {
  let app: FastifyInstance;
  let categoryId: string;
  let painelId: string;
  let mesaId: string;

  const D1 = '2027-05-10';
  const D2 = '2027-05-11';
  const D3 = '2027-05-12';

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
        name: 'Espaço Donna Belle',
        baseDailyPriceCents: 150000,
        maxGuests: 120,
        minLeadDays: 2,
      },
    });

    categoryId = (await createCategory({ name: 'Decorações' })).id;
    // Um painel só: basta uma reserva para ele acabar no dia.
    painelId = (await createItem({ categoryId, name: 'Painel', stock: 1 })).id;
    mesaId = (await createItem({ categoryId, name: 'Mesa', stock: 3 })).id;
  });

  type ReserveOptions = {
    kind?: 'VENUE' | 'DECORATION';
    status?: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';
    holdExpiresAt?: Date | null;
    quantity?: number;
    endDate?: string;
  };

  /** Uma reserva que leva o item no dia, como o pedido gravaria. */
  async function reserve(itemId: string, day: string, options: ReserveOptions = {}) {
    const user = await createUser({});
    const booking = await createBooking({
      userId: user.id,
      kind: options.kind ?? 'DECORATION',
      startDate: day,
      endDate: options.endDate ?? day,
      status: options.status ?? 'CONFIRMED',
      holdExpiresAt: options.holdExpiresAt ?? null,
    });

    await prisma.bookingItem.create({
      data: {
        bookingId: booking.id,
        itemId,
        itemName: 'Decoração',
        quantity: options.quantity ?? 1,
        unitPriceCents: 12000,
      },
    });

    return booking;
  }

  function block(date: string, scope: 'VENUE' | 'DECORATION' | 'BOTH') {
    return prisma.blockedDate.create({ data: { date: parseISODate(date), reason: null, scope } });
  }

  // ----------------------------------------------------- GET /availability?itemId=

  describe('o calendário de uma decoração', () => {
    function calendar(
      itemId: string,
      from: string,
      to: string,
      kind: 'VENUE' | 'DECORATION' = 'VENUE',
    ) {
      return app.inject({
        method: 'GET',
        url: `/api/availability?from=${from}&to=${to}&kind=${kind}&itemId=${itemId}`,
      });
    }

    function statusOf(response: { json: () => { days: { date: string; status: string }[] } }) {
      return Object.fromEntries(response.json().days.map((day) => [day.date, day.status]));
    }

    it('o dia em que a decoração saiu para uma festa na chácara fica ocupado', async () => {
      await reserve(painelId, D1, { kind: 'VENUE', status: 'CONFIRMED' });

      const response = await calendar(painelId, D1, D2, 'DECORATION');

      expect(response.statusCode).toBe(200);
      expect(statusOf(response)).toEqual({ [D1]: 'booked', [D2]: 'free' });
    });

    /*
     * A decoração sozinha não toma a data da chácara (§9.10), mas toma a
     * decoração: no calendário dela, pela chácara, o dia fica ocupado.
     */
    it('pedido de decoração ainda no prazo também ocupa o dia da decoração', async () => {
      await reserve(painelId, D1, {
        status: 'PENDING',
        holdExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      expect(statusOf(await calendar(painelId, D1, D1))).toEqual({ [D1]: 'booked' });

      // Sem a decoração no pedido, a agenda da chácara continua livre.
      const venue = await app.inject({
        method: 'GET',
        url: `/api/availability?from=${D1}&to=${D1}`,
      });
      expect(venue.json().days).toEqual([{ date: D1, status: 'free' }]);
    });

    it('pedido vencido e reserva cancelada não seguram a decoração', async () => {
      await reserve(painelId, D1, {
        status: 'PENDING',
        holdExpiresAt: new Date(Date.now() - 60 * 60 * 1000),
      });
      await reserve(painelId, D2, { status: 'CANCELLED' });

      expect(statusOf(await calendar(painelId, D1, D2, 'DECORATION'))).toEqual({
        [D1]: 'free',
        [D2]: 'free',
      });
    });

    it('com unidade sobrando, o dia continua livre', async () => {
      await reserve(mesaId, D1, { quantity: 2 });

      expect(statusOf(await calendar(mesaId, D1, D1, 'DECORATION'))).toEqual({
        [D1]: 'free',
      });

      await reserve(mesaId, D1, { quantity: 1 });

      expect(statusOf(await calendar(mesaId, D1, D1, 'DECORATION'))).toEqual({
        [D1]: 'booked',
      });
    });

    it('a agenda da chácara continua valendo por cima da decoração', async () => {
      const user = await createUser({});
      await createBooking({ userId: user.id, startDate: D1, endDate: D1, status: 'CONFIRMED' });

      expect(statusOf(await calendar(mesaId, D1, D2))).toEqual({
        [D1]: 'booked',
        [D2]: 'free',
      });
    });

    /* Fechar a decoração fecha também a chácara de quem quer esta decoração. */
    it('dia com a decoração fechada fica bloqueado, também na agenda da chácara', async () => {
      await block(D1, 'DECORATION');
      await block(D2, 'BOTH');
      await block(D3, 'VENUE');

      expect(statusOf(await calendar(mesaId, D1, D3))).toEqual({
        [D1]: 'blocked',
        [D2]: 'blocked',
        [D3]: 'blocked',
      });

      // Na agenda da decoração, o bloqueio só da chácara não fecha nada.
      expect(statusOf(await calendar(mesaId, D1, D3, 'DECORATION'))).toEqual({
        [D1]: 'blocked',
        [D2]: 'blocked',
        [D3]: 'free',
      });
    });

    it('bloqueio vence o estoque esgotado, como na ordem da §9.1', async () => {
      await reserve(painelId, D1);
      await block(D1, 'DECORATION');

      expect(statusOf(await calendar(painelId, D1, D1))).toEqual({ [D1]: 'blocked' });
    });

    it('a antecedência mínima continua valendo', async () => {
      const tomorrow = addDays(todayInSaoPaulo(), 1);

      expect(statusOf(await calendar(mesaId, tomorrow, tomorrow))).toEqual({
        [tomorrow]: 'past',
      });
    });

    it('não revela quem levou a decoração, e é cacheável por pouco tempo', async () => {
      const user = await createUser({ name: 'Ana Beatriz', email: 'ana@exemplo.com' });
      const booking = await createBooking({
        userId: user.id,
        kind: 'DECORATION',
        startDate: D1,
        endDate: D1,
        status: 'CONFIRMED',
      });
      await prisma.bookingItem.create({
        data: {
          bookingId: booking.id,
          itemId: painelId,
          itemName: 'Painel',
          quantity: 1,
          unitPriceCents: 12000,
        },
      });

      const response = await calendar(painelId, D1, D1);

      expect(response.body).not.toContain('Ana');
      expect(response.body).not.toContain(booking.id);
      expect(response.headers['cache-control']).toBe('public, max-age=30');
    });

    it('decoração que não existe ou está desativada responde 404', async () => {
      const inactive = await createItem({ categoryId, name: 'Aposentada', active: false });

      for (const itemId of ['00000000-0000-4000-8000-000000000000', inactive.id]) {
        const response = await calendar(itemId, D1, D1);

        expect(response.statusCode).toBe(404);
        expect(response.json().error).toMatchObject({
          code: 'NOT_FOUND',
          message: 'Não encontramos esta decoração.',
        });
      }
    });

    it('recusa identificador fora do formato', async () => {
      const response = await calendar('abc', D1, D1);

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details.context).toBe('querystring');
    });

    it('recusa período maior que o teto', async () => {
      const response = await calendar(mesaId, '2027-01-01', '2027-12-31');

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details).toEqual({ maxDays: 120, requestedDays: 365 });
    });
  });

  // ------------------------------------------------------ GET /items/availability

  describe('as unidades livres no período', () => {
    function freeStock(from: string, to: string) {
      return app.inject({ method: 'GET', url: `/api/items/availability?from=${from}&to=${to}` });
    }

    async function freeStockOf(from: string, to: string) {
      const response = await freeStock(from, to);
      expect(response.statusCode).toBe(200);

      return Object.fromEntries(
        (response.json() as { items: { itemId: string; freeStock: number }[] }).items.map(
          (item) => [item.itemId, item.freeStock],
        ),
      );
    }

    it('dá o estoque inteiro quando nada foi reservado', async () => {
      expect(await freeStockOf(D1, D3)).toEqual({ [painelId]: 1, [mesaId]: 3 });
    });

    /* O pior dia manda (§9.3): é o que cabe no período inteiro. */
    it('conta o pior dia do período, somando os dois produtos', async () => {
      await reserve(mesaId, D1, { kind: 'VENUE' });
      await reserve(mesaId, D2, {
        status: 'PENDING',
        holdExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
      await reserve(mesaId, D2);

      expect(await freeStockOf(D1, D3)).toEqual({ [painelId]: 1, [mesaId]: 1 });
      // Fora do dia mais apertado, sobra mais.
      expect(await freeStockOf(D3, D3)).toEqual({ [painelId]: 1, [mesaId]: 3 });
    });

    it('reserva que ocupa vários dias conta em todos eles', async () => {
      await reserve(painelId, D1, { kind: 'VENUE', endDate: D2 });

      expect(await freeStockOf(D2, D3)).toEqual({ [painelId]: 0, [mesaId]: 3 });
    });

    it('pedido vencido e reserva cancelada não contam', async () => {
      await reserve(painelId, D1, {
        status: 'PENDING',
        holdExpiresAt: new Date(Date.now() - 60 * 60 * 1000),
      });
      await reserve(mesaId, D1, { status: 'CANCELLED', quantity: 3 });

      expect(await freeStockOf(D1, D1)).toEqual({ [painelId]: 1, [mesaId]: 3 });
    });

    it('dia com a decoração fechada zera todas as decorações', async () => {
      await block(D2, 'DECORATION');

      expect(await freeStockOf(D1, D3)).toEqual({ [painelId]: 0, [mesaId]: 0 });
      // O bloqueio só da chácara não mexe na decoração.
      await block(D3, 'VENUE');
      expect(await freeStockOf(D3, D3)).toEqual({ [painelId]: 1, [mesaId]: 3 });
    });

    it('nunca fica negativo, mesmo com o estoque baixado depois da reserva', async () => {
      await reserve(mesaId, D1, { quantity: 3 });
      await prisma.item.update({ where: { id: mesaId }, data: { stock: 1 } });

      expect((await freeStockOf(D1, D1))[mesaId]).toBe(0);
    });

    it('só traz decoração ativa', async () => {
      const inactive = await createItem({ categoryId, name: 'Aposentada', active: false });

      const free = await freeStockOf(D1, D1);

      expect(Object.keys(free).sort()).toEqual([painelId, mesaId].sort());
      expect(free).not.toHaveProperty(inactive.id);
    });

    it('é pública e cacheável por pouco tempo', async () => {
      const response = await freeStock(D1, D1);

      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('public, max-age=30');
    });

    it('recusa período maior que o teto', async () => {
      const response = await freeStock('2027-01-01', '2027-12-31');

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { maxDays: 120, requestedDays: 365 },
      });
    });

    it('recusa período invertido', async () => {
      const response = await freeStock(D3, D1);

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details.context).toBe('querystring');
    });
  });
});
