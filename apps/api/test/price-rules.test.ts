import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma, truncateAll } from './helpers/db.js';
import { createUser } from './helpers/factories.js';

/**
 * Regras de preço e simulador (§9.4, §13).
 *
 * O calendário dos casos foi conferido, não presumido: 04/12/2026 é sexta,
 * 05/12 sábado, 06/12 domingo e 07/12 segunda.
 */
describe('regras de preço', () => {
  let app: FastifyInstance;
  let adminToken: string;

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

    const admin = await createUser({ email: 'dono@chacara.local', role: 'ADMIN' });
    adminToken = app.jwt.sign({ sub: admin.id, role: admin.role });

    // O simulador lê a diária base das configurações.
    await prisma.venueSettings.create({
      data: {
        id: 1,
        name: 'Chácara Seu Evento',
        baseDailyPriceCents: BASE_DAILY,
        maxGuests: 120,
      },
    });
  });

  function asAdmin(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
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

  function createRule(payload: Record<string, unknown>) {
    return asAdmin('POST', '/api/admin/price-rules', payload);
  }

  describe('CRUD', () => {
    it('cria regra de fim de semana', async () => {
      const response = await createRule({
        name: 'Sábado',
        dayOfWeek: 6,
        priceCents: 180000,
        priority: 10,
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual(
        expect.objectContaining({
          name: 'Sábado',
          dayOfWeek: 6,
          startDate: null,
          endDate: null,
          priceCents: 180000,
          priority: 10,
          active: true,
        }),
      );
    });

    /* Data trafega como 'YYYY-MM-DD' e a coluna é `@db.Date` (§7.3). */
    it('devolve as datas do período no formato do contrato', async () => {
      const response = await createRule({
        name: 'Réveillon',
        startDate: '2026-12-28',
        endDate: '2027-01-02',
        priceCents: 350000,
        priority: 100,
      });

      expect(response.json()).toEqual(
        expect.objectContaining({ startDate: '2026-12-28', endDate: '2027-01-02' }),
      );
    });

    it('recusa período que termina antes de começar', async () => {
      const response = await createRule({
        name: 'Invertido',
        startDate: '2026-12-10',
        endDate: '2026-12-05',
        priceCents: 200000,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details.fields[0].field).toBe('endDate');
    });

    it('recusa dia da semana fora de 0 a 6', async () => {
      const response = await createRule({ name: 'Oitavo dia', dayOfWeek: 7, priceCents: 100000 });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details.fields[0].field).toBe('dayOfWeek');
    });

    it('lista por prioridade, do mais forte para o mais fraco', async () => {
      await createRule({ name: 'Fraca', priceCents: 100000, priority: 1 });
      await createRule({ name: 'Forte', priceCents: 300000, priority: 50 });

      const response = await asAdmin('GET', '/api/admin/price-rules');

      expect(response.json().map((rule: { name: string }) => rule.name)).toEqual([
        'Forte',
        'Fraca',
      ]);
    });

    it('limpa o período quando o formulário manda nulo', async () => {
      const created = await createRule({
        name: 'Temporada',
        startDate: '2026-12-01',
        endDate: '2026-12-31',
        priceCents: 200000,
      });

      const response = await asAdmin('PATCH', `/api/admin/price-rules/${created.json().id}`, {
        startDate: null,
        endDate: null,
      });

      expect(response.json()).toEqual(
        expect.objectContaining({ startDate: null, endDate: null, name: 'Temporada' }),
      );
    });

    /*
     * Diferente de item, combo e estilo (§11.2), a regra não é referenciada por
     * reserva: o `dailyBreakdown` guarda o nome, não o id.
     */
    it('exclui a regra de verdade', async () => {
      const created = await createRule({ name: 'Errada', priceCents: 100000 });

      const response = await asAdmin('DELETE', `/api/admin/price-rules/${created.json().id}`);

      expect(response.statusCode).toBe(204);
      expect(await prisma.priceRule.count()).toBe(0);
    });

    it('devolve 404 para regra que não existe', async () => {
      const response = await asAdmin(
        'DELETE',
        '/api/admin/price-rules/00000000-0000-4000-8000-000000000000',
      );

      expect(response.statusCode).toBe(404);
    });

    it('recusa quem não é admin', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/admin/price-rules' });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('simulador', () => {
    function simulate(from: string, to: string) {
      return asAdmin('GET', `/api/admin/price-rules/simulate?from=${from}&to=${to}`);
    }

    it('usa a diária base nos dias sem regra', async () => {
      const response = await simulate('2026-12-07', '2026-12-08');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        days: [
          { date: '2026-12-07', priceCents: BASE_DAILY, ruleName: null },
          { date: '2026-12-08', priceCents: BASE_DAILY, ruleName: null },
        ],
        totalCents: BASE_DAILY * 2,
        baseDailyPriceCents: BASE_DAILY,
      });
    });

    /* É aqui que o dono entende por que um sábado custa diferente. */
    it('diz qual regra venceu em cada dia', async () => {
      await createRule({ name: 'Sábado', dayOfWeek: 6, priceCents: 180000, priority: 10 });

      const response = await simulate('2026-12-04', '2026-12-06');

      expect(response.json().days).toEqual([
        { date: '2026-12-04', priceCents: BASE_DAILY, ruleName: null },
        { date: '2026-12-05', priceCents: 180000, ruleName: 'Sábado' },
        { date: '2026-12-06', priceCents: BASE_DAILY, ruleName: null },
      ]);
      expect(response.json().totalCents).toBe(BASE_DAILY * 2 + 180000);
    });

    it('a maior prioridade vence o dia da semana', async () => {
      await createRule({ name: 'Sábado', dayOfWeek: 6, priceCents: 180000, priority: 10 });
      await createRule({
        name: 'Réveillon',
        startDate: '2026-12-28',
        endDate: '2027-01-02',
        priceCents: 350000,
        priority: 100,
      });

      // 02/01/2027 é sábado: as duas regras pegam o dia, e o Réveillon tem prioridade.
      const response = await simulate('2027-01-02', '2027-01-02');

      expect(response.json().days).toEqual([
        { date: '2027-01-02', priceCents: 350000, ruleName: 'Réveillon' },
      ]);
    });

    it('ignora regra desativada', async () => {
      const created = await createRule({
        name: 'Sábado',
        dayOfWeek: 6,
        priceCents: 180000,
        priority: 10,
      });
      await asAdmin('PATCH', `/api/admin/price-rules/${created.json().id}`, { active: false });

      const response = await simulate('2026-12-05', '2026-12-05');

      expect(response.json().days).toEqual([
        { date: '2026-12-05', priceCents: BASE_DAILY, ruleName: null },
      ]);
    });

    it('as pontas do período são inclusivas', async () => {
      await createRule({
        name: 'Temporada',
        startDate: '2026-12-05',
        endDate: '2026-12-06',
        priceCents: 200000,
        priority: 5,
      });

      const response = await simulate('2026-12-04', '2026-12-07');

      expect(response.json().days.map((day: { ruleName: string | null }) => day.ruleName)).toEqual([
        null,
        'Temporada',
        'Temporada',
        null,
      ]);
    });

    it('simula um único dia', async () => {
      const response = await simulate('2026-12-05', '2026-12-05');

      expect(response.json().days).toHaveLength(1);
      expect(response.json().totalCents).toBe(BASE_DAILY);
    });

    it('recusa período invertido', async () => {
      const response = await simulate('2026-12-10', '2026-12-05');

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details.context).toBe('querystring');
    });

    /* Resposta precisa ser limitada: um ano daria 365 linhas por consulta. */
    it('recusa período maior que um trimestre', async () => {
      const response = await simulate('2026-01-01', '2026-12-31');

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details).toEqual({ maxDays: 92, requestedDays: 365 });
    });

    it('aceita exatamente o limite', async () => {
      // 01/01 a 02/04/2026 são 92 dias (2026 não é bissexto).
      const response = await simulate('2026-01-01', '2026-04-02');

      expect(response.statusCode).toBe(200);
      expect(response.json().days).toHaveLength(92);
    });
  });
});
