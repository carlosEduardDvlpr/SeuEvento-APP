import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma, truncateAll } from './helpers/db.js';
import {
  createBooking,
  createCategory,
  createCombo,
  createItem,
  createTheme,
  createUser,
} from './helpers/factories.js';

/**
 * Combos (§9.6, §11.2, §13).
 *
 * O que está sob teste: a economia que a vitrine e o painel mostram sai do mesmo
 * cálculo do orçamento, e um combo que não pode ser montado não aparece para o
 * cliente.
 */
describe('combos', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let categoryId: string;

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

    categoryId = (await createCategory({ name: 'Painéis' })).id;
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

  describe('prévia da economia', () => {
    /*
     * A §13 pede "soma dos itens R$ X, o cliente paga R$ Y" no formulário. Os três
     * números vêm prontos do servidor, pelo mesmo comboValue que o orçamento usa.
     */
    it('calcula soma, desconto e preço final em PERCENT', async () => {
      const painel = await createItem({ categoryId, priceCents: 20000 });
      const mesa = await createItem({ categoryId, priceCents: 12000 });

      const response = await asAdmin('POST', '/api/admin/combos', {
        name: 'Kit boho',
        discountType: 'PERCENT',
        discountValue: 10,
        items: [
          { itemId: painel.id, quantity: 1 },
          { itemId: mesa.id, quantity: 2 },
        ],
      });

      expect(response.statusCode).toBe(201);
      // 20000 + 2 x 12000 = 44000; 10% = 4400; cliente paga 39600.
      expect(response.json()).toEqual(
        expect.objectContaining({
          itemsTotalCents: 44000,
          discountCents: 4400,
          priceCents: 39600,
        }),
      );
    });

    it('calcula a economia de um preço fechado', async () => {
      const painel = await createItem({ categoryId, priceCents: 20000 });
      const mesa = await createItem({ categoryId, priceCents: 12000 });

      const response = await asAdmin('POST', '/api/admin/combos', {
        name: 'Kit fechado',
        discountType: 'FIXED_PRICE',
        discountValue: 28000,
        items: [
          { itemId: painel.id, quantity: 1 },
          { itemId: mesa.id, quantity: 1 },
        ],
      });

      // 32000 de itens, combo fechado em 28000: economia de 4000.
      expect(response.json()).toEqual(
        expect.objectContaining({
          itemsTotalCents: 32000,
          discountCents: 4000,
          priceCents: 28000,
        }),
      );
    });

    /* Preço fechado acima da soma dos itens não vira crédito (§9.6). */
    it('não devolve economia negativa quando o preço fechado é maior', async () => {
      const painel = await createItem({ categoryId, priceCents: 10000 });

      const response = await asAdmin('POST', '/api/admin/combos', {
        name: 'Kit mal configurado',
        discountType: 'FIXED_PRICE',
        discountValue: 15000,
        items: [{ itemId: painel.id, quantity: 1 }],
      });

      expect(response.json()).toEqual(
        expect.objectContaining({ discountCents: 0, priceCents: 10000 }),
      );
    });

    it('arredonda o desconto, não o total', async () => {
      const item = await createItem({ categoryId, priceCents: 3333 });

      const response = await asAdmin('POST', '/api/admin/combos', {
        name: 'Kit quebrado',
        discountType: 'PERCENT',
        discountValue: 15,
        items: [{ itemId: item.id, quantity: 1 }],
      });

      // 3333 x 15% = 499,95 -> 500 de desconto, 2833 a pagar.
      expect(response.json()).toEqual(
        expect.objectContaining({ discountCents: 500, priceCents: 2833 }),
      );
    });
  });

  describe('validação do desconto', () => {
    it('recusa porcentagem acima de 100', async () => {
      const item = await createItem({ categoryId });

      const response = await asAdmin('POST', '/api/admin/combos', {
        name: 'Kit impossível',
        discountType: 'PERCENT',
        discountValue: 120,
        items: [{ itemId: item.id, quantity: 1 }],
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details.fields[0].field).toBe('discountValue');
    });

    /* O mesmo número em FIXED_PRICE é só um valor em centavos, e é válido. */
    it('aceita o mesmo valor como preço fechado', async () => {
      const item = await createItem({ categoryId, priceCents: 5000 });

      const response = await asAdmin('POST', '/api/admin/combos', {
        name: 'Kit barato',
        discountType: 'FIXED_PRICE',
        discountValue: 120,
        items: [{ itemId: item.id, quantity: 1 }],
      });

      expect(response.statusCode).toBe(201);
    });

    /* Combo vazio caberia em qualquer pedido e daria desconto para sempre. */
    it('recusa combo sem itens', async () => {
      const response = await asAdmin('POST', '/api/admin/combos', {
        name: 'Kit vazio',
        discountType: 'PERCENT',
        discountValue: 10,
        items: [],
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details.fields[0].field).toBe('items');
    });

    /* `@@id([comboId, itemId])` não permite, e a quantidade ficaria ambígua. */
    it('recusa o mesmo item em duas linhas', async () => {
      const item = await createItem({ categoryId });

      const response = await asAdmin('POST', '/api/admin/combos', {
        name: 'Kit repetido',
        discountType: 'PERCENT',
        discountValue: 10,
        items: [
          { itemId: item.id, quantity: 1 },
          { itemId: item.id, quantity: 2 },
        ],
      });

      expect(response.statusCode).toBe(400);
    });

    it('aponta o campo quando um item não existe', async () => {
      const response = await asAdmin('POST', '/api/admin/combos', {
        name: 'Kit fantasma',
        discountType: 'PERCENT',
        discountValue: 10,
        items: [{ itemId: '00000000-0000-4000-8000-000000000000', quantity: 1 }],
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details.fields).toEqual([
        { field: 'items', message: 'Um dos itens escolhidos não existe.' },
      ]);
    });

    /*
     * Trocar para porcentagem sem informar o valor manteria o número antigo, que
     * em FIXED_PRICE é centavos: 28000 viraria 28000% de desconto. Recusar obriga
     * o formulário a mandar os dois campos juntos.
     */
    it('recusa trocar para porcentagem sem informar o novo valor', async () => {
      const item = await createItem({ categoryId, priceCents: 20000 });
      const created = await asAdmin('POST', '/api/admin/combos', {
        name: 'Kit fechado',
        discountType: 'FIXED_PRICE',
        discountValue: 18000,
        items: [{ itemId: item.id, quantity: 1 }],
      });

      const response = await asAdmin('PATCH', `/api/admin/combos/${created.json().id}`, {
        discountType: 'PERCENT',
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details.fields[0].field).toBe('discountValue');
    });

    it('aponta o campo quando o estilo não existe', async () => {
      const item = await createItem({ categoryId });

      const response = await asAdmin('POST', '/api/admin/combos', {
        name: 'Kit sem estilo',
        discountType: 'PERCENT',
        discountValue: 10,
        themeId: '00000000-0000-4000-8000-000000000000',
        items: [{ itemId: item.id, quantity: 1 }],
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details.fields[0].field).toBe('themeId');
    });
  });

  describe('vitrine', () => {
    it('devolve combo ativo com os itens e a economia', async () => {
      const item = await createItem({ categoryId, name: 'Painel ripado', priceCents: 10000 });
      await createCombo({ name: 'Kit visível', itemIds: [item.id] });

      const response = await app.inject({ method: 'GET', url: '/api/combos' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([
        expect.objectContaining({
          name: 'Kit visível',
          items: [
            {
              itemId: item.id,
              name: 'Painel ripado',
              quantity: 1,
              unitPriceCents: 10000,
              totalCents: 10000,
            },
          ],
          discountCents: 1000,
        }),
      ]);
    });

    it('não expõe o campo active na vitrine', async () => {
      const item = await createItem({ categoryId });
      await createCombo({ itemIds: [item.id] });

      const response = await app.inject({ method: 'GET', url: '/api/combos' });

      expect(response.json()[0]).not.toHaveProperty('active');
      expect(response.json()[0]).not.toHaveProperty('available');
    });

    it('esconde combo desativado', async () => {
      const item = await createItem({ categoryId });
      const combo = await createCombo({ itemIds: [item.id] });
      await prisma.combo.update({ where: { id: combo.id }, data: { active: false } });

      const response = await app.inject({ method: 'GET', url: '/api/combos' });

      expect(response.json()).toEqual([]);
    });

    /*
     * Oferecer o que não pode ser montado só produz pedido recusado no fim do
     * wizard, depois de a pessoa já ter escolhido a data.
     */
    it('esconde combo com item desativado', async () => {
      const ativo = await createItem({ categoryId });
      const inativo = await createItem({ categoryId, active: false });
      await createCombo({ name: 'Kit quebrado', itemIds: [ativo.id, inativo.id] });

      const response = await app.inject({ method: 'GET', url: '/api/combos' });

      expect(response.json()).toEqual([]);
    });

    it('esconde combo sem itens', async () => {
      await createCombo({ name: 'Kit vazio', itemIds: [] });

      const response = await app.inject({ method: 'GET', url: '/api/combos' });

      expect(response.json()).toEqual([]);
    });

    it('filtra por estilo', async () => {
      const item = await createItem({ categoryId });
      const boho = await createTheme({ name: 'Boho' });
      await createCombo({ name: 'Kit boho', themeId: boho.id, itemIds: [item.id] });
      await createCombo({ name: 'Kit sem estilo', itemIds: [item.id] });

      const response = await app.inject({ method: 'GET', url: `/api/combos?themeId=${boho.id}` });

      expect(response.json().map((combo: { name: string }) => combo.name)).toEqual(['Kit boho']);
    });
  });

  describe('painel', () => {
    it('mostra combo desativado e avisa que tem item fora do ar', async () => {
      const ativo = await createItem({ categoryId, name: 'Painel' });
      const inativo = await createItem({ categoryId, name: 'Mesa aposentada', active: false });
      await createCombo({ name: 'Kit com problema', itemIds: [ativo.id, inativo.id] });

      const response = await asAdmin('GET', '/api/admin/combos');

      expect(response.json()).toEqual([
        expect.objectContaining({
          name: 'Kit com problema',
          active: true,
          available: false,
        }),
      ]);
      expect(response.json()[0].items).toEqual([
        expect.objectContaining({ name: 'Painel', active: true }),
        expect.objectContaining({ name: 'Mesa aposentada', active: false }),
      ]);
    });

    /* O formulário manda o combo inteiro: item que não veio foi removido. */
    it('substitui a composição em vez de somar', async () => {
      const antigo = await createItem({ categoryId, name: 'Antigo' });
      const novo = await createItem({ categoryId, name: 'Novo' });
      const combo = await createCombo({ itemIds: [antigo.id] });

      const response = await asAdmin('PATCH', `/api/admin/combos/${combo.id}`, {
        items: [{ itemId: novo.id, quantity: 3 }],
      });

      expect(response.json().items).toEqual([
        expect.objectContaining({ itemId: novo.id, quantity: 3 }),
      ]);
    });

    it('recusa quem não é admin', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/admin/combos' });

      expect(response.statusCode).toBe(401);
    });

    it('devolve 404 para combo que não existe', async () => {
      const response = await asAdmin(
        'GET',
        '/api/admin/combos/00000000-0000-4000-8000-000000000000',
      );

      expect(response.statusCode).toBe(404);
    });
  });

  describe('exclusão', () => {
    it('exclui de verdade o combo que nenhuma reserva usou', async () => {
      const item = await createItem({ categoryId });
      const combo = await createCombo({ itemIds: [item.id] });

      const response = await asAdmin('DELETE', `/api/admin/combos/${combo.id}`);

      expect(response.json()).toEqual({ outcome: 'deleted' });
      expect(await prisma.combo.count()).toBe(0);
      // Os ComboItem somem em cascata (§8).
      expect(await prisma.comboItem.count()).toBe(0);
    });

    /*
     * A reserva guarda o combo em JSON, não por chave estrangeira, então o banco
     * não impediria a exclusão. Ainda assim o dono precisa poder abrir a reserva
     * antiga e ver o combo que concedeu aquele desconto.
     */
    it('desativa o combo que já foi aplicado em alguma reserva', async () => {
      const item = await createItem({ categoryId });
      const combo = await createCombo({ name: 'Kit usado', itemIds: [item.id] });
      const user = await createUser({ email: 'ana@exemplo.com' });
      const booking = await createBooking({
        userId: user.id,
        startDate: '2026-12-05',
        endDate: '2026-12-06',
      });
      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          appliedCombos: [{ comboId: combo.id, name: 'Kit usado', times: 1, discountCents: 1000 }],
        },
      });

      const response = await asAdmin('DELETE', `/api/admin/combos/${combo.id}`);

      expect(response.json()).toEqual({ outcome: 'deactivated' });
      expect(await prisma.combo.findUnique({ where: { id: combo.id } })).toMatchObject({
        active: false,
      });
    });

    it('ignora combo aplicado em outra reserva', async () => {
      const item = await createItem({ categoryId });
      const alvo = await createCombo({ name: 'Kit livre', itemIds: [item.id] });
      const outro = await createCombo({ name: 'Kit usado', itemIds: [item.id] });
      const user = await createUser({ email: 'bia@exemplo.com' });
      const booking = await createBooking({
        userId: user.id,
        startDate: '2026-12-05',
        endDate: '2026-12-05',
      });
      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          appliedCombos: [{ comboId: outro.id, name: 'Kit usado', times: 1, discountCents: 500 }],
        },
      });

      const response = await asAdmin('DELETE', `/api/admin/combos/${alvo.id}`);

      expect(response.json()).toEqual({ outcome: 'deleted' });
    });
  });
});
