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
const { isExclusionViolation } = await import('../src/lib/errors.js');
const { prisma, truncateAll } = await import('./helpers/db.js');
const { createCategory, createCombo, createItem, createUser } =
  await import('./helpers/factories.js');

/**
 * Criação da reserva (§9.1, §9.3, §9.7, §11.3).
 *
 * O caso central deste arquivo é o de concorrência: duas requisições simultâneas
 * para a mesma data, e só uma pode passar. É o critério de aceite da Fase 4 e o
 * motivo de a §8.1 existir — nenhuma checagem "consultar antes de inserir"
 * resolveria isso.
 */
describe('criação de reserva', () => {
  let app: FastifyInstance;
  let categoryId: string;

  const BASE_DAILY = 150000;
  const HOLD_HOURS = 48;

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
        holdHours: HOLD_HOURS,
        maxPendingPerUser: 3,
      },
    });

    categoryId = (await createCategory({ name: 'Painéis' })).id;
  });

  /** Cliente apto a reservar: e-mail confirmado e telefone no perfil (§11.3). */
  async function createClient(
    overrides: { email?: string; verified?: boolean; phone?: string | null } = {},
  ) {
    const user = await createUser({
      name: 'Ana Beatriz',
      email: overrides.email ?? 'ana@exemplo.com',
      phone: overrides.phone === undefined ? '11999990000' : overrides.phone,
    });

    if (overrides.verified !== false) {
      await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    }

    return { user, token: app.jwt.sign({ sub: user.id, role: user.role }) };
  }

  function post(token: string, payload: Record<string, unknown>) {
    return app.inject({
      method: 'POST',
      url: '/api/bookings',
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
  }

  function quote(payload: Record<string, unknown>) {
    return app.inject({ method: 'POST', url: '/api/pricing/quote', payload });
  }

  /** Pedido padrão: dois dias de 2027, sem itens. */
  const TWO_DAYS = {
    startDate: '2027-04-09',
    endDate: '2027-04-10',
    eventType: 'BABY_SHOWER' as const,
    guestCount: 60,
    expectedTotalCents: BASE_DAILY * 2,
  };

  describe('caminho feliz', () => {
    it('cria o pedido com o snapshot financeiro e o prazo', async () => {
      const { token } = await createClient();

      const response = await post(token, { ...TWO_DAYS, customerNotes: 'Chegamos na sexta.' });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual(
        expect.objectContaining({
          status: 'PENDING',
          startDate: '2027-04-09',
          endDate: '2027-04-10',
          eventType: 'BABY_SHOWER',
          guestCount: 60,
          dailyTotalCents: BASE_DAILY * 2,
          itemsTotalCents: 0,
          discountTotalCents: 0,
          totalCents: BASE_DAILY * 2,
          customerNotes: 'Chegamos na sexta.',
          items: [],
          combos: [],
        }),
      );
      expect(response.json().days).toEqual([
        { date: '2027-04-09', priceCents: BASE_DAILY, ruleName: null },
        { date: '2027-04-10', priceCents: BASE_DAILY, ruleName: null },
      ]);
      expect(response.json().holdExpiresAt).not.toBeNull();
    });

    /* §9.2: o prazo é `now + holdHours`, e é ele que segura as datas. */
    it('o prazo do pedido é o holdHours das configurações', async () => {
      const { token } = await createClient();

      const response = await post(token, TWO_DAYS);

      const hold = new Date(response.json().holdExpiresAt).getTime();
      const expected = Date.now() + HOLD_HOURS * 60 * 60 * 1000;
      // Tolerância de um minuto: o relógio anda entre o pedido e a asserção.
      expect(Math.abs(hold - expected)).toBeLessThan(60_000);
    });

    /* O snapshot é o que protege a reserva de mudança no catálogo (§2.1). */
    it('grava nome e preço do item como estavam no momento do pedido', async () => {
      const { token } = await createClient();
      const item = await createItem({ categoryId, name: 'Painel de nuvens', priceCents: 18000 });

      const created = await post(token, {
        ...TWO_DAYS,
        items: [{ itemId: item.id, quantity: 2 }],
        expectedTotalCents: BASE_DAILY * 2 + 36000,
      });

      expect(created.statusCode).toBe(201);

      // O catálogo muda depois; a reserva não.
      await prisma.item.update({
        where: { id: item.id },
        data: { name: 'Painel renomeado', priceCents: 99900 },
      });

      const row = await prisma.bookingItem.findFirstOrThrow({
        where: { bookingId: created.json().id },
      });
      expect(row).toMatchObject({
        itemName: 'Painel de nuvens',
        unitPriceCents: 18000,
        quantity: 2,
      });
    });

    it('aplica o combo e grava os combos no snapshot', async () => {
      const { token } = await createClient();
      const painel = await createItem({ categoryId, priceCents: 20000 });
      const mesa = await createItem({ categoryId, priceCents: 12000 });
      const combo = await createCombo({ name: 'Kit boho', itemIds: [painel.id, mesa.id] });

      const response = await post(token, {
        ...TWO_DAYS,
        items: [
          { itemId: painel.id, quantity: 1 },
          { itemId: mesa.id, quantity: 1 },
        ],
        expectedTotalCents: BASE_DAILY * 2 + 32000 - 3200,
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().combos).toEqual([
        { comboId: combo.id, name: 'Kit boho', times: 1, discountCents: 3200 },
      ]);
      expect(response.json().discountTotalCents).toBe(3200);
    });

    /* §17: cada transição manda e-mail, e o prazo é o que a pessoa precisa saber. */
    it('avisa o cliente por e-mail, com o prazo', async () => {
      const { token } = await createClient();

      await post(token, TWO_DAYS);

      expect(outbox).toHaveLength(1);
      expect(outbox[0]?.to).toBe('ana@exemplo.com');
      expect(outbox[0]?.subject).toBe('Recebemos seu pedido de reserva');
      expect(outbox[0]?.text).toContain('48 horas');
      // O período aparece em linguagem natural, no fuso do negócio (§7.3).
      expect(outbox[0]?.text).toContain('9 a 10 de abril de 2027');
    });

    it('a reserva ocupa a data na disponibilidade pública', async () => {
      const { token } = await createClient();

      await post(token, TWO_DAYS);

      const response = await app.inject({
        method: 'GET',
        url: '/api/availability?from=2027-04-09&to=2027-04-10',
      });

      expect(response.json().days).toEqual([
        { date: '2027-04-09', status: 'booked' },
        { date: '2027-04-10', status: 'booked' },
      ]);
    });
  });

  describe('quem pode reservar (§11.3)', () => {
    it('exige sessão', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/bookings',
        payload: TWO_DAYS,
      });

      expect(response.statusCode).toBe(401);
    });

    it('exige e-mail confirmado', async () => {
      const { token } = await createClient({ verified: false });

      const response = await post(token, TWO_DAYS);

      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('EMAIL_NOT_VERIFIED');
    });

    /* Sem telefone a chácara não consegue falar com a pessoa no dia da festa. */
    it('exige telefone no perfil, apontando o campo', async () => {
      const { token } = await createClient({ phone: null });

      const response = await post(token, TWO_DAYS);

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details.fields).toEqual([
        {
          field: 'phone',
          message: 'Informe seu WhatsApp no perfil para a chácara falar com você.',
        },
      ]);
    });

    it('recusa mais convidados do que a chácara recebe', async () => {
      const { token } = await createClient();

      const response = await post(token, { ...TWO_DAYS, guestCount: 300 });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details.fields[0]).toEqual({
        field: 'guestCount',
        message: 'A chácara recebe até 120 pessoas.',
      });
    });

    it('recusa quando o cliente já tem pedidos demais abertos', async () => {
      const { token } = await createClient();

      // maxPendingPerUser = 3, em datas diferentes para não colidir entre si.
      for (const start of ['2027-04-09', '2027-04-12', '2027-04-15']) {
        const created = await post(token, {
          ...TWO_DAYS,
          startDate: start,
          endDate: start,
          expectedTotalCents: BASE_DAILY,
        });
        expect(created.statusCode).toBe(201);
      }

      const response = await post(token, {
        ...TWO_DAYS,
        startDate: '2027-04-20',
        endDate: '2027-04-20',
        expectedTotalCents: BASE_DAILY,
      });

      expect(response.statusCode).toBe(422);
      expect(response.json().error.code).toBe('TOO_MANY_PENDING');
    });
  });

  describe('preço (§9.7)', () => {
    /*
     * O cliente nunca paga um valor que não viu. Se o preço mudou entre o
     * orçamento e o envio, a API devolve o novo orçamento para ele aceitar.
     */
    it('recusa quando o total esperado não bate, devolvendo o novo orçamento', async () => {
      const { token } = await createClient();

      const response = await post(token, { ...TWO_DAYS, expectedTotalCents: 1 });

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('PRICE_CHANGED');
      expect(response.json().error.details.quote.totalCents).toBe(BASE_DAILY * 2);
    });

    it('o total do orçamento é aceito sem alteração', async () => {
      const { token } = await createClient();

      const estimate = await quote({
        startDate: TWO_DAYS.startDate,
        endDate: TWO_DAYS.endDate,
      });

      const response = await post(token, {
        ...TWO_DAYS,
        expectedTotalCents: estimate.json().totalCents,
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().totalCents).toBe(estimate.json().totalCents);
    });

    it('a regra de preço entra no snapshot com o nome', async () => {
      const { token } = await createClient();
      // 10/04/2027 é sábado.
      await prisma.priceRule.create({
        data: { name: 'Sábado', dayOfWeek: 6, priceCents: 220000, priority: 10 },
      });

      const response = await post(token, {
        ...TWO_DAYS,
        expectedTotalCents: BASE_DAILY + 220000,
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().days).toEqual([
        { date: '2027-04-09', priceCents: BASE_DAILY, ruleName: null },
        { date: '2027-04-10', priceCents: 220000, ruleName: 'Sábado' },
      ]);
    });
  });

  describe('datas indisponíveis', () => {
    it('recusa data já reservada, dizendo quais dias caíram', async () => {
      const first = await createClient({ email: 'ana@exemplo.com' });
      const second = await createClient({ email: 'bia@exemplo.com' });

      await post(first.token, TWO_DAYS);

      const response = await post(second.token, TWO_DAYS);

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('DATE_UNAVAILABLE');
      expect(response.json().error.details.dates).toEqual(['2027-04-09', '2027-04-10']);
    });

    /*
     * A constraint da §8.1 só sabe de reservas. Sem esta checagem, daria para
     * marcar festa num dia em que a chácara está fechada.
     */
    it('recusa dia bloqueado pelo admin', async () => {
      const { token } = await createClient();
      await prisma.blockedDate.create({
        data: { date: parseISODate('2027-04-10'), reason: 'Manutenção' },
      });

      const response = await post(token, TWO_DAYS);

      expect(response.statusCode).toBe(409);
      expect(response.json().error.details.dates).toEqual(['2027-04-10']);
    });

    it('recusa data dentro da antecedência mínima', async () => {
      const { token } = await createClient();
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const response = await post(token, {
        ...TWO_DAYS,
        startDate: tomorrow,
        endDate: tomorrow,
        expectedTotalCents: BASE_DAILY,
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('DATE_UNAVAILABLE');
    });

    it('recusa período maior que o máximo de dias', async () => {
      const { token } = await createClient();

      const response = await post(token, {
        ...TWO_DAYS,
        endDate: '2027-04-20',
        expectedTotalCents: BASE_DAILY * 12,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details.fields[0].field).toBe('endDate');
    });

    /*
     * §9.1: a constraint considera `PENDING` como ocupando a data, sem olhar o
     * prazo. Sem cancelar a vencida na mesma transação, a data ficaria presa até
     * o job de expiração rodar — até 15 minutos de uma data já livre.
     */
    it('pedido vencido não bloqueia a data, e cai na mesma transação', async () => {
      const first = await createClient({ email: 'ana@exemplo.com' });
      const second = await createClient({ email: 'bia@exemplo.com' });

      const expired = await post(first.token, TWO_DAYS);
      await prisma.booking.update({
        where: { id: expired.json().id },
        data: { holdExpiresAt: new Date(Date.now() - 60 * 60 * 1000) },
      });
      outbox.length = 0;

      const response = await post(second.token, TWO_DAYS);

      expect(response.statusCode).toBe(201);
      expect(await prisma.booking.findUnique({ where: { id: expired.json().id } })).toMatchObject({
        status: 'CANCELLED',
        cancelReason: 'HOLD_EXPIRED',
        holdExpiresAt: null,
      });
    });

    /*
     * O job de expiração não vai mais encontrar esse pedido (já está CANCELLED),
     * então sem este aviso a pessoa descobriria sozinha, pelo site.
     */
    it('avisa quem teve o pedido vencido derrubado', async () => {
      const first = await createClient({ email: 'ana@exemplo.com' });
      const second = await createClient({ email: 'bia@exemplo.com' });

      const expired = await post(first.token, TWO_DAYS);
      await prisma.booking.update({
        where: { id: expired.json().id },
        data: { holdExpiresAt: new Date(Date.now() - 60 * 60 * 1000) },
      });
      outbox.length = 0;

      await post(second.token, TWO_DAYS);

      const expiredNotice = outbox.find((mail) => mail.to === 'ana@exemplo.com');
      expect(expiredNotice?.subject).toBe('Seu pedido de reserva expirou');
      expect(outbox.find((mail) => mail.to === 'bia@exemplo.com')?.subject).toBe(
        'Recebemos seu pedido de reserva',
      );
    });

    it('data de reserva cancelada volta a ser reservável', async () => {
      const first = await createClient({ email: 'ana@exemplo.com' });
      const second = await createClient({ email: 'bia@exemplo.com' });

      const created = await post(first.token, TWO_DAYS);
      await prisma.booking.update({
        where: { id: created.json().id },
        data: { status: 'CANCELLED', holdExpiresAt: null },
      });

      const response = await post(second.token, TWO_DAYS);

      expect(response.statusCode).toBe(201);
    });
  });

  /**
   * Estoque (§9.3).
   *
   * Um achado que vale deixar explícito: com **uma chácara só**, o estoque nunca
   * é o motivo da recusa em `POST /bookings`. O estoque é contado por dia, duas
   * reservas ativas não podem compartilhar um dia (§8.1), então todo conflito de
   * estoque exige um dia em comum — que a constraint de datas já recusou antes.
   *
   * A conta de estoque continua valendo e aparece no orçamento (ver
   * `pricing-quote.test.ts`, onde as duas `issues` voltam juntas). Os testes
   * daqui medem o que é de fato observável: o pedido é recusado, e a quantidade
   * comprometida nunca passa do estoque.
   */
  describe('estoque (§9.3)', () => {
    it('recusa pedido cujo item já está comprometido naquele dia', async () => {
      const first = await createClient({ email: 'ana@exemplo.com' });
      const second = await createClient({ email: 'bia@exemplo.com' });
      const item = await createItem({ categoryId, stock: 3, priceCents: 10000 });

      await post(first.token, {
        ...TWO_DAYS,
        items: [{ itemId: item.id, quantity: 2 }],
        expectedTotalCents: BASE_DAILY * 2 + 20000,
      });

      const response = await post(second.token, {
        ...TWO_DAYS,
        startDate: '2027-04-10',
        endDate: '2027-04-10',
        items: [{ itemId: item.id, quantity: 2 }],
        expectedTotalCents: BASE_DAILY + 20000,
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('DATE_UNAVAILABLE');
    });

    /* O orçamento é onde a falta de estoque aparece como motivo próprio. */
    it('o orçamento acusa a falta de estoque junto com a data', async () => {
      const { token } = await createClient();
      const item = await createItem({ categoryId, stock: 3, priceCents: 10000 });

      await post(token, {
        ...TWO_DAYS,
        items: [{ itemId: item.id, quantity: 2 }],
        expectedTotalCents: BASE_DAILY * 2 + 20000,
      });

      const estimate = await quote({
        startDate: '2027-04-10',
        endDate: '2027-04-10',
        items: [{ itemId: item.id, quantity: 2 }],
      });

      expect(estimate.json().issues).toEqual([
        { code: 'DATE_UNAVAILABLE', dates: ['2027-04-10'] },
        { code: 'STOCK_INSUFFICIENT', itemId: item.id, available: 1 },
      ]);
    });

    it('estoque livre em outro dia não impede o pedido', async () => {
      const first = await createClient({ email: 'ana@exemplo.com' });
      const second = await createClient({ email: 'bia@exemplo.com' });
      const item = await createItem({ categoryId, stock: 1, priceCents: 10000 });

      await post(first.token, {
        ...TWO_DAYS,
        items: [{ itemId: item.id, quantity: 1 }],
        expectedTotalCents: BASE_DAILY * 2 + 10000,
      });

      const response = await post(second.token, {
        ...TWO_DAYS,
        startDate: '2027-05-20',
        endDate: '2027-05-20',
        items: [{ itemId: item.id, quantity: 1 }],
        expectedTotalCents: BASE_DAILY + 10000,
      });

      expect(response.statusCode).toBe(201);
    });
  });

  /**
   * MARCO da Fase 4: zero dupla reserva.
   *
   * Dois níveis de teste, de propósito:
   *
   * - Os casos com `Promise.all` garantem o **resultado observável** pela rota:
   *   só uma reserva sobrevive. Eles não dizem qual camada recusou, e tudo bem —
   *   é a garantia que o cliente percebe.
   * - O último caso controla o interleaving e prova que a **constraint da §8.1**
   *   recusa uma transação sobreposta ainda não commitada. É o cenário que
   *   nenhuma checagem em código resolveria.
   */
  describe('concorrência', () => {
    it('duas requisições simultâneas para a mesma data: só uma passa', async () => {
      const clients = await Promise.all([
        createClient({ email: 'ana@exemplo.com' }),
        createClient({ email: 'bia@exemplo.com' }),
      ]);

      const responses = await Promise.all(clients.map((client) => post(client.token, TWO_DAYS)));

      const created = responses.filter((response) => response.statusCode === 201);
      const refused = responses.filter((response) => response.statusCode === 409);

      expect(created).toHaveLength(1);
      expect(refused).toHaveLength(1);
      expect(refused[0]?.json().error.code).toBe('DATE_UNAVAILABLE');
      expect(await prisma.booking.count({ where: { status: 'PENDING' } })).toBe(1);
    });

    /*
     * Nenhuma perdedora pode receber 500.
     *
     * Esta asserção é regressão de um defeito real: sob contenção, o Postgres
     * aborta parte das transações como conflito de escrita (`P2034`) em vez de
     * dar o `exclusion_violation` limpo, e sem a repetição no service a pessoa
     * recebia erro interno em vez de "a data acabou de ser reservada".
     *
     * Quatro requisições, e não dez: com dez a rodada ficava lenta o bastante
     * para estourar o prazo do próprio teste em máquina carregada, deixando
     * transação pendurada e envenenando a limpeza do arquivo seguinte. Um teste
     * de carga que derruba a suíte custa mais do que entrega — e quem cobre o
     * mapeamento do `P2034` de forma determinística é `src/lib/errors.test.ts`.
     */
    it('nenhuma perdedora recebe erro interno', async () => {
      const clients = await Promise.all(
        ['a', 'b', 'c', 'd'].map((letter) => createClient({ email: `${letter}@exemplo.com` })),
      );

      const responses = await Promise.all(clients.map((client) => post(client.token, TWO_DAYS)));

      expect(responses.filter((response) => response.statusCode === 201)).toHaveLength(1);
      expect(await prisma.booking.count({ where: { status: 'PENDING' } })).toBe(1);

      for (const response of responses.filter((r) => r.statusCode !== 201)) {
        expect(response.statusCode).toBe(409);
        expect(response.json().error.code).toBe('DATE_UNAVAILABLE');
      }
    });

    /*
     * A prova determinística de que o banco é o árbitro.
     *
     * Os casos com `Promise.all` acima garantem o resultado observável, mas não
     * provam **quem** recusou: medindo a mensagem, descobri que às vezes as
     * requisições se serializam e a recusa vem da consulta prévia, não da
     * constraint. Um teste que passa dos dois jeitos não distingue sistema
     * protegido de desprotegido.
     *
     * Aqui o interleaving é controlado: a primeira transação insere e **segura o
     * commit**; a segunda insere um intervalo sobreposto e fica bloqueada no
     * índice GiST; soltar a primeira faz o Postgres recusar a segunda com 23P01.
     * É o cenário que nenhuma checagem em código evitaria.
     */
    it('transação que segura o commit faz a sobreposta ser recusada pelo Postgres', async () => {
      const { user } = await createClient({ email: 'ana@exemplo.com' });

      const snapshot = {
        userId: user.id,
        eventType: 'BABY_SHOWER' as const,
        guestCount: 40,
        status: 'PENDING' as const,
        dailyBreakdown: [],
        appliedCombos: [],
        dailyTotalCents: 0,
        itemsTotalCents: 0,
        discountTotalCents: 0,
        totalCents: 0,
      };

      let signalInserted!: () => void;
      const inserted = new Promise<void>((resolve) => {
        signalInserted = resolve;
      });

      let releaseCommit!: () => void;
      const heldOpen = new Promise<void>((resolve) => {
        releaseCommit = resolve;
      });

      const first = prisma.$transaction(async (tx) => {
        await tx.booking.create({
          data: {
            ...snapshot,
            startDate: parseISODate('2027-04-09'),
            endDate: parseISODate('2027-04-10'),
          },
        });
        signalInserted();
        await heldOpen;
      });

      // Só começa a segunda depois de a primeira ter inserido, sem commit.
      await inserted;

      const second = prisma
        .$transaction(async (tx) => {
          await tx.booking.create({
            data: {
              ...snapshot,
              startDate: parseISODate('2027-04-10'),
              endDate: parseISODate('2027-04-11'),
            },
          });
        })
        .then(() => null)
        .catch((error: unknown) => error);

      releaseCommit();
      await first;

      expect(isExclusionViolation(await second)).toBe(true);
      expect(await prisma.booking.count()).toBe(1);
    });

    /* Intervalos que só se tocam numa ponta também colidem (§7.3, range '[]'). */
    it('intervalos que se sobrepõem parcialmente não coexistem', async () => {
      const clients = await Promise.all([
        createClient({ email: 'ana@exemplo.com' }),
        createClient({ email: 'bia@exemplo.com' }),
      ]);

      const responses = await Promise.all([
        post(clients[0]!.token, TWO_DAYS),
        post(clients[1]!.token, {
          ...TWO_DAYS,
          startDate: '2027-04-10',
          endDate: '2027-04-11',
        }),
      ]);

      expect(responses.filter((response) => response.statusCode === 201)).toHaveLength(1);
    });

    /*
     * A quantidade comprometida nunca passa do estoque.
     *
     * Quem garante isso aqui é a constraint de datas, não a trava de `Item`: os
     * dois pedidos querem o mesmo dia, e sem um dia em comum não existe conflito
     * de estoque (ver o comentário do bloco "estoque"). O teste mede a garantia
     * observável, não o mecanismo — e continuaria valendo se a defesa mudasse.
     */
    it('a quantidade reservada nunca passa do estoque do item', async () => {
      const clients = await Promise.all([
        createClient({ email: 'ana@exemplo.com' }),
        createClient({ email: 'bia@exemplo.com' }),
      ]);
      const item = await createItem({ categoryId, stock: 1, priceCents: 10000 });

      const responses = await Promise.all([
        post(clients[0]!.token, {
          ...TWO_DAYS,
          startDate: '2027-04-09',
          endDate: '2027-04-09',
          items: [{ itemId: item.id, quantity: 1 }],
          expectedTotalCents: BASE_DAILY + 10000,
        }),
        post(clients[1]!.token, {
          ...TWO_DAYS,
          startDate: '2027-04-09',
          endDate: '2027-04-09',
          items: [{ itemId: item.id, quantity: 1 }],
          expectedTotalCents: BASE_DAILY + 10000,
        }),
      ]);

      expect(responses.filter((response) => response.statusCode === 201)).toHaveLength(1);

      const reserved = await prisma.bookingItem.aggregate({
        where: { booking: { status: 'PENDING' } },
        _sum: { quantity: true },
      });
      expect(reserved._sum.quantity).toBe(1);
    });

    /* Duas datas livres e distintas podem, sim, passar as duas. */
    it('datas distintas não se atrapalham', async () => {
      const clients = await Promise.all([
        createClient({ email: 'ana@exemplo.com' }),
        createClient({ email: 'bia@exemplo.com' }),
      ]);

      const responses = await Promise.all([
        post(clients[0]!.token, {
          ...TWO_DAYS,
          startDate: '2027-04-09',
          endDate: '2027-04-09',
          expectedTotalCents: BASE_DAILY,
        }),
        post(clients[1]!.token, {
          ...TWO_DAYS,
          startDate: '2027-04-20',
          endDate: '2027-04-20',
          expectedTotalCents: BASE_DAILY,
        }),
      ]);

      expect(responses.filter((response) => response.statusCode === 201)).toHaveLength(2);
    });
  });
});
