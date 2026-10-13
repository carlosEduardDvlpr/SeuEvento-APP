import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma, truncateAll } from './helpers/db.js';
import {
  createBooking,
  createCategory,
  createCombo,
  createItem,
  createUser,
} from './helpers/factories.js';

/**
 * `POST /pricing/quote` (§9.1, §9.3, §9.7, §11.3).
 *
 * A regra que organiza o arquivo: **indisponibilidade não é erro**. Data tomada e
 * item esgotado voltam em `issues` com 200, porque o wizard precisa mostrar o
 * problema sem perder o pedido que a pessoa montou. Já o que a interface deveria
 * ter evitado — passar do limite de dias, mandar item fora do catálogo — é
 * `VALIDATION_ERROR`.
 *
 * Datas de 2027 em diante nos casos de disponibilidade, para a antecedência
 * mínima nunca interferir no que está sob teste.
 */
describe('orçamento', () => {
  let app: FastifyInstance;
  let categoryId: string;

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

    await prisma.venueSettings.create({
      data: {
        id: 1,
        name: 'Chácara Seu Evento',
        baseDailyPriceCents: BASE_DAILY,
        maxGuests: 120,
        minDays: 1,
        maxDays: 3,
        minLeadDays: 2,
      },
    });

    categoryId = (await createCategory({ name: 'Painéis' })).id;
  });

  function quote(payload: Record<string, unknown>) {
    return app.inject({ method: 'POST', url: '/api/pricing/quote', payload });
  }

  async function bookDays(
    startDate: string,
    endDate: string,
    overrides: Parameters<typeof createBooking>[0] extends infer T
      ? T extends { userId: string }
        ? Omit<T, 'userId' | 'startDate' | 'endDate'>
        : never
      : never = {},
  ) {
    const user = await createUser({});
    return createBooking({ userId: user.id, startDate, endDate, ...overrides });
  }

  describe('cálculo', () => {
    it('orça só a chácara, sem itens', async () => {
      const response = await quote({ startDate: '2027-03-05', endDate: '2027-03-06' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        available: true,
        issues: [],
        days: [
          { date: '2027-03-05', priceCents: BASE_DAILY, ruleName: null },
          { date: '2027-03-06', priceCents: BASE_DAILY, ruleName: null },
        ],
        dailyTotalCents: BASE_DAILY * 2,
        lines: [],
        itemsTotalCents: 0,
        combos: [],
        discountTotalCents: 0,
        totalCents: BASE_DAILY * 2,
      });
    });

    it('aplica a regra de preço no dia certo', async () => {
      await prisma.priceRule.create({
        data: { name: 'Sábado', dayOfWeek: 6, priceCents: 220000, priority: 10 },
      });

      // 06/03/2027 é sábado; 07/03 é domingo.
      const response = await quote({ startDate: '2027-03-06', endDate: '2027-03-07' });

      expect(response.json().days).toEqual([
        { date: '2027-03-06', priceCents: 220000, ruleName: 'Sábado' },
        { date: '2027-03-07', priceCents: BASE_DAILY, ruleName: null },
      ]);
      expect(response.json().dailyTotalCents).toBe(220000 + BASE_DAILY);
    });

    /* O preço vem do banco, nunca da requisição (§2.3). */
    it('usa o preço do catálogo e ignora o que vier no corpo', async () => {
      const item = await createItem({ categoryId, name: 'Painel', priceCents: 18000 });

      const response = await quote({
        startDate: '2027-03-05',
        endDate: '2027-03-05',
        items: [{ itemId: item.id, quantity: 2, unitPriceCents: 1 }],
      });

      expect(response.json().lines).toEqual([
        {
          itemId: item.id,
          name: 'Painel',
          quantity: 2,
          unitPriceCents: 18000,
          totalCents: 36000,
        },
      ]);
      expect(response.json().itemsTotalCents).toBe(36000);
      expect(response.json().totalCents).toBe(BASE_DAILY + 36000);
    });

    /* Item é cobrado uma vez pelo período, não por dia (§9.5). */
    it('não multiplica o item pelo número de dias', async () => {
      const item = await createItem({ categoryId, priceCents: 10000 });

      const response = await quote({
        startDate: '2027-03-05',
        endDate: '2027-03-07',
        items: [{ itemId: item.id, quantity: 1 }],
      });

      expect(response.json().itemsTotalCents).toBe(10000);
      expect(response.json().dailyTotalCents).toBe(BASE_DAILY * 3);
    });

    it('aplica o combo e desconta do total', async () => {
      const painel = await createItem({ categoryId, priceCents: 20000 });
      const mesa = await createItem({ categoryId, priceCents: 12000 });
      const combo = await createCombo({ name: 'Kit boho', itemIds: [painel.id, mesa.id] });

      const response = await quote({
        startDate: '2027-03-05',
        endDate: '2027-03-05',
        items: [
          { itemId: painel.id, quantity: 1 },
          { itemId: mesa.id, quantity: 1 },
        ],
      });

      // Itens 32000; o combo do factory dá 10%, ou seja, 3200 de desconto.
      expect(response.json().combos).toEqual([
        { comboId: combo.id, name: 'Kit boho', times: 1, discountCents: 3200 },
      ]);
      expect(response.json().discountTotalCents).toBe(3200);
      expect(response.json().totalCents).toBe(BASE_DAILY + 32000 - 3200);
    });

    it('ignora combo desativado', async () => {
      const item = await createItem({ categoryId, priceCents: 20000 });
      const combo = await createCombo({ itemIds: [item.id] });
      await prisma.combo.update({ where: { id: combo.id }, data: { active: false } });

      const response = await quote({
        startDate: '2027-03-05',
        endDate: '2027-03-05',
        items: [{ itemId: item.id, quantity: 1 }],
      });

      expect(response.json().combos).toEqual([]);
      expect(response.json().discountTotalCents).toBe(0);
    });

    it('não é cacheada: o resultado depende do que está reservado agora', async () => {
      const response = await quote({ startDate: '2027-03-05', endDate: '2027-03-05' });

      expect(response.headers['cache-control']).toBe('no-store');
    });
  });

  describe('disponibilidade das datas (§9.1)', () => {
    it('acusa dia tomado por reserva confirmada, dizendo qual', async () => {
      await bookDays('2027-03-06', '2027-03-06', { status: 'CONFIRMED' });

      const response = await quote({ startDate: '2027-03-05', endDate: '2027-03-07' });

      expect(response.statusCode).toBe(200);
      expect(response.json().available).toBe(false);
      expect(response.json().issues).toEqual([{ code: 'DATE_UNAVAILABLE', dates: ['2027-03-06'] }]);
      // O valor continua calculado: o wizard mostra o problema sem perder o pedido.
      expect(response.json().dailyTotalCents).toBe(BASE_DAILY * 3);
    });

    it('acusa dia tomado por pedido ainda dentro do prazo', async () => {
      await bookDays('2027-03-05', '2027-03-05', {
        status: 'PENDING',
        holdExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      const response = await quote({ startDate: '2027-03-05', endDate: '2027-03-05' });

      expect(response.json().issues).toEqual([{ code: 'DATE_UNAVAILABLE', dates: ['2027-03-05'] }]);
    });

    /*
     * A consulta ignora pedido vencido em vez de depender de o job de expiração
     * ter rodado: sem isso a data ficaria presa até o próximo ciclo de 15 min.
     */
    it('libera a data de pedido cujo prazo venceu', async () => {
      await bookDays('2027-03-05', '2027-03-05', {
        status: 'PENDING',
        holdExpiresAt: new Date(Date.now() - 60 * 60 * 1000),
      });

      const response = await quote({ startDate: '2027-03-05', endDate: '2027-03-05' });

      expect(response.json().available).toBe(true);
    });

    /* Prazo nulo numa PENDING é bug de dado; segurar a data é o erro mais seguro. */
    it('trata pedido sem prazo como ainda segurando a data', async () => {
      await bookDays('2027-03-05', '2027-03-05', { status: 'PENDING', holdExpiresAt: null });

      const response = await quote({ startDate: '2027-03-05', endDate: '2027-03-05' });

      expect(response.json().available).toBe(false);
    });

    it('reserva cancelada ou concluída não ocupa a data', async () => {
      await bookDays('2027-03-05', '2027-03-05', { status: 'CANCELLED' });
      await bookDays('2027-03-06', '2027-03-06', { status: 'COMPLETED' });

      const response = await quote({ startDate: '2027-03-05', endDate: '2027-03-06' });

      expect(response.json().available).toBe(true);
    });

    it('acusa dia bloqueado pelo admin', async () => {
      await prisma.blockedDate.create({
        data: { date: new Date('2027-03-06T00:00:00.000Z'), reason: 'Manutenção' },
      });

      const response = await quote({ startDate: '2027-03-05', endDate: '2027-03-06' });

      expect(response.json().issues).toEqual([{ code: 'DATE_UNAVAILABLE', dates: ['2027-03-06'] }]);
    });

    it('não revela nada sobre quem reservou', async () => {
      await bookDays('2027-03-05', '2027-03-05', { status: 'CONFIRMED' });

      const response = await quote({ startDate: '2027-03-05', endDate: '2027-03-05' });

      expect(response.body).not.toContain('@exemplo.com');
      expect(response.body).not.toContain('Cliente');
    });

    /* `past` é anterior a hoje + minLeadDays, e também cai em DATE_UNAVAILABLE. */
    it('acusa data no passado', async () => {
      const response = await quote({ startDate: '2020-05-10', endDate: '2020-05-10' });

      expect(response.json().available).toBe(false);
      expect(response.json().issues).toEqual([{ code: 'DATE_UNAVAILABLE', dates: ['2020-05-10'] }]);
    });

    it('lista todas as datas tomadas, não só a primeira', async () => {
      await bookDays('2027-03-05', '2027-03-06', { status: 'CONFIRMED' });

      const response = await quote({ startDate: '2027-03-05', endDate: '2027-03-07' });

      expect(response.json().issues[0].dates).toEqual(['2027-03-05', '2027-03-06']);
    });
  });

  describe('estoque (§9.3)', () => {
    it('acusa falta e diz quantas unidades ainda cabem', async () => {
      const item = await createItem({ categoryId, stock: 3 });
      const booking = await bookDays('2027-03-05', '2027-03-05', { status: 'CONFIRMED' });
      await prisma.bookingItem.create({
        data: {
          bookingId: booking.id,
          itemId: item.id,
          itemName: 'Painel',
          quantity: 2,
          unitPriceCents: 12000,
        },
      });

      const response = await quote({
        startDate: '2027-03-05',
        endDate: '2027-03-05',
        items: [{ itemId: item.id, quantity: 2 }],
      });

      expect(response.json().available).toBe(false);
      expect(response.json().issues).toEqual([
        { code: 'DATE_UNAVAILABLE', dates: ['2027-03-05'] },
        { code: 'STOCK_INSUFFICIENT', itemId: item.id, available: 1 },
      ]);
    });

    /*
     * O estoque é por dia: o mesmo painel sai no sábado e volta para sair no
     * sábado seguinte. Reserva em outro dia não consome o do dia pedido.
     */
    it('não consome estoque de dia que não é o pedido', async () => {
      const item = await createItem({ categoryId, stock: 1 });
      const booking = await bookDays('2027-03-20', '2027-03-20', { status: 'CONFIRMED' });
      await prisma.bookingItem.create({
        data: {
          bookingId: booking.id,
          itemId: item.id,
          itemName: 'Painel',
          quantity: 1,
          unitPriceCents: 12000,
        },
      });

      const response = await quote({
        startDate: '2027-03-05',
        endDate: '2027-03-05',
        items: [{ itemId: item.id, quantity: 1 }],
      });

      expect(response.json().available).toBe(true);
    });

    /* Basta um dia apertado para o pedido inteiro não passar. */
    it('o pior dia do intervalo manda', async () => {
      const item = await createItem({ categoryId, stock: 2 });
      const booking = await bookDays('2027-03-06', '2027-03-06', { status: 'CONFIRMED' });
      await prisma.bookingItem.create({
        data: {
          bookingId: booking.id,
          itemId: item.id,
          itemName: 'Painel',
          quantity: 2,
          unitPriceCents: 12000,
        },
      });

      const response = await quote({
        startDate: '2027-03-05',
        endDate: '2027-03-07',
        items: [{ itemId: item.id, quantity: 1 }],
      });

      expect(response.json().issues).toEqual(
        expect.arrayContaining([{ code: 'STOCK_INSUFFICIENT', itemId: item.id, available: 0 }]),
      );
    });

    it('reserva cancelada não consome estoque', async () => {
      const item = await createItem({ categoryId, stock: 1 });
      const booking = await bookDays('2027-03-05', '2027-03-05', { status: 'CANCELLED' });
      await prisma.bookingItem.create({
        data: {
          bookingId: booking.id,
          itemId: item.id,
          itemName: 'Painel',
          quantity: 1,
          unitPriceCents: 12000,
        },
      });

      const response = await quote({
        startDate: '2027-03-05',
        endDate: '2027-03-05',
        items: [{ itemId: item.id, quantity: 1 }],
      });

      expect(response.json().available).toBe(true);
    });

    it('aceita o pedido que usa o estoque inteiro', async () => {
      const item = await createItem({ categoryId, stock: 4 });

      const response = await quote({
        startDate: '2027-03-05',
        endDate: '2027-03-05',
        items: [{ itemId: item.id, quantity: 4 }],
      });

      expect(response.json().available).toBe(true);
    });

    it('acusa um problema por item que falta', async () => {
      const painel = await createItem({ categoryId, stock: 0 });
      const mesa = await createItem({ categoryId, stock: 0 });

      const response = await quote({
        startDate: '2027-03-05',
        endDate: '2027-03-05',
        items: [
          { itemId: painel.id, quantity: 1 },
          { itemId: mesa.id, quantity: 1 },
        ],
      });

      expect(response.json().issues).toHaveLength(2);
      expect(response.json().issues.map((issue: { code: string }) => issue.code)).toEqual([
        'STOCK_INSUFFICIENT',
        'STOCK_INSUFFICIENT',
      ]);
    });
  });

  describe('pedido malformado', () => {
    /*
     * A interface recebe minDays e maxDays em /public/venue, então passar da faixa
     * é pedido malformado e não indisponibilidade.
     */
    it('recusa período maior que o máximo de dias', async () => {
      const response = await quote({ startDate: '2027-03-05', endDate: '2027-03-10' });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      expect(response.json().error.details.fields).toEqual([
        { field: 'endDate', message: 'A reserva é de no máximo 3 dias seguidos.' },
      ]);
    });

    it('recusa período menor que o mínimo de dias', async () => {
      await prisma.venueSettings.update({ where: { id: 1 }, data: { minDays: 2 } });

      const response = await quote({ startDate: '2027-03-05', endDate: '2027-03-05' });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details.fields[0].message).toContain('mínimo 2 dias');
    });

    it('recusa data de saída anterior à de entrada', async () => {
      const response = await quote({ startDate: '2027-03-07', endDate: '2027-03-05' });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details.fields[0].field).toBe('endDate');
    });

    /* Vitrine não oferece item inativo: isso é aba velha ou pedido adulterado. */
    it('recusa item desativado', async () => {
      const item = await createItem({ categoryId, active: false });

      const response = await quote({
        startDate: '2027-03-05',
        endDate: '2027-03-05',
        items: [{ itemId: item.id, quantity: 1 }],
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details.fields[0].field).toBe('items');
    });

    it('recusa item que não existe', async () => {
      const response = await quote({
        startDate: '2027-03-05',
        endDate: '2027-03-05',
        items: [{ itemId: '00000000-0000-4000-8000-000000000000', quantity: 1 }],
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details.fields[0].field).toBe('items');
    });

    it('recusa o mesmo item em duas linhas', async () => {
      const item = await createItem({ categoryId });

      const response = await quote({
        startDate: '2027-03-05',
        endDate: '2027-03-05',
        items: [
          { itemId: item.id, quantity: 1 },
          { itemId: item.id, quantity: 2 },
        ],
      });

      expect(response.statusCode).toBe(400);
    });

    it('recusa data fora do formato', async () => {
      const response = await quote({ startDate: '05/03/2027', endDate: '2027-03-05' });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details.fields[0].field).toBe('startDate');
    });
  });
});
