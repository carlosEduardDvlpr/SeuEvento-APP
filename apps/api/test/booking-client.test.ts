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
const { prisma, truncateAll } = await import('./helpers/db.js');
const { createBooking, createUser } = await import('./helpers/factories.js');

/**
 * Reservas do cliente e cancelamento (§9.2, §11.2).
 *
 * Duas regras organizam o arquivo:
 *
 * - **Reserva de outra pessoa não existe.** O filtro por `userId` vai na
 *   consulta, e a resposta é 404, não 403 (§10.6): 403 confirmaria que o id
 *   existe, e dá para varrer ids.
 * - **O prazo só vale para reserva confirmada.** Desistir de um pedido ainda não
 *   confirmado é o mesmo que deixá-lo vencer, então não tem restrição.
 */
describe('reservas do cliente', () => {
  let app: FastifyInstance;

  const FREE_CANCEL_DAYS = 7;

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
        freeCancelUntilDays: FREE_CANCEL_DAYS,
        whatsapp: '11988887777',
      },
    });
  });

  async function createClient(email = 'ana@exemplo.com') {
    const user = await createUser({ name: 'Ana Beatriz', email });
    await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });

    return { user, token: app.jwt.sign({ sub: user.id, role: user.role }) };
  }

  function get(token: string, url: string) {
    return app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } });
  }

  function cancel(token: string, id: string, reason?: string) {
    return app.inject({
      method: 'PATCH',
      url: `/api/bookings/${id}/cancel`,
      headers: { authorization: `Bearer ${token}` },
      payload: reason === undefined ? {} : { reason },
    });
  }

  describe('GET /bookings/me', () => {
    it('devolve lista vazia para quem nunca reservou', async () => {
      const { token } = await createClient();

      const response = await get(token, '/api/bookings/me');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
    });

    /* Ordem decrescente por data de início, e o id desempata (§11.2). */
    it('ordena da data mais distante para a mais antiga', async () => {
      const { user, token } = await createClient();
      await createBooking({ userId: user.id, startDate: '2027-04-10', endDate: '2027-04-10' });
      await createBooking({ userId: user.id, startDate: '2027-06-10', endDate: '2027-06-10' });
      await createBooking({ userId: user.id, startDate: '2027-05-10', endDate: '2027-05-10' });

      const response = await get(token, '/api/bookings/me');

      expect(response.json().map((booking: { startDate: string }) => booking.startDate)).toEqual([
        '2027-06-10',
        '2027-05-10',
        '2027-04-10',
      ]);
    });

    it('não mistura reserva de outro cliente', async () => {
      const mine = await createClient('ana@exemplo.com');
      const other = await createClient('bia@exemplo.com');
      await createBooking({ userId: mine.user.id, startDate: '2027-04-10', endDate: '2027-04-10' });
      await createBooking({
        userId: other.user.id,
        startDate: '2027-05-10',
        endDate: '2027-05-10',
      });

      const response = await get(mine.token, '/api/bookings/me');

      expect(response.json()).toHaveLength(1);
      expect(response.json()[0].startDate).toBe('2027-04-10');
    });

    it('traz os quatro status, para a tela agrupar', async () => {
      const { user, token } = await createClient();
      await createBooking({
        userId: user.id,
        startDate: '2027-04-10',
        endDate: '2027-04-10',
        status: 'CANCELLED',
      });
      await createBooking({
        userId: user.id,
        startDate: '2027-05-10',
        endDate: '2027-05-10',
        status: 'COMPLETED',
      });

      const response = await get(token, '/api/bookings/me');

      expect(response.json().map((booking: { status: string }) => booking.status)).toEqual([
        'COMPLETED',
        'CANCELLED',
      ]);
    });

    it('exige sessão', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/bookings/me' });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /bookings/:id', () => {
    it('devolve o detalhe com o snapshot', async () => {
      const { user, token } = await createClient();
      const booking = await createBooking({
        userId: user.id,
        startDate: '2027-04-09',
        endDate: '2027-04-10',
        eventType: 'WEDDING',
        guestCount: 80,
      });

      const response = await get(token, `/api/bookings/${booking.id}`);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(
        expect.objectContaining({
          id: booking.id,
          startDate: '2027-04-09',
          endDate: '2027-04-10',
          eventType: 'WEDDING',
          guestCount: 80,
          status: 'PENDING',
        }),
      );
    });

    /* 403 confirmaria que o id existe, e dá para varrer ids (§10.6). */
    it('responde 404 para reserva de outra pessoa, não 403', async () => {
      const mine = await createClient('ana@exemplo.com');
      const other = await createClient('bia@exemplo.com');
      const booking = await createBooking({
        userId: other.user.id,
        startDate: '2027-04-10',
        endDate: '2027-04-10',
      });

      const response = await get(mine.token, `/api/bookings/${booking.id}`);

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('NOT_FOUND');
    });

    it('responde 404 para id que não existe', async () => {
      const { token } = await createClient();

      const response = await get(token, '/api/bookings/00000000-0000-4000-8000-000000000000');

      expect(response.statusCode).toBe(404);
    });

    /* Nota interna do dono não sai para o cliente (§13). */
    it('não devolve as notas internas do admin', async () => {
      const { user, token } = await createClient();
      const booking = await createBooking({
        userId: user.id,
        startDate: '2027-04-10',
        endDate: '2027-04-10',
      });
      await prisma.booking.update({
        where: { id: booking.id },
        data: { adminNotes: 'Cliente pediu desconto por telefone.' },
      });

      const response = await get(token, `/api/bookings/${booking.id}`);

      expect(response.body).not.toContain('desconto por telefone');
      expect(response.json()).not.toHaveProperty('adminNotes');
    });
  });

  /**
   * Permissão de cancelar, decidida pelo servidor (§9.2, §13.3).
   *
   * A tela não recalcula o prazo: ele depende de "hoje" na chácara, e o relógio
   * de quem olha pode estar em outro fuso. É a **mesma** função que recusa o
   * cancelamento, então o botão e a recusa não podem discordar — e é isso que
   * estes casos cobrem.
   */
  describe('canCancel e cancelUntil', () => {
    it('pedido aguardando confirmação pode ser cancelado, sem prazo a explicar', async () => {
      const { user, token } = await createClient();
      const tomorrow = addDays(todayInSaoPaulo(), 1);
      const booking = await createBooking({
        userId: user.id,
        startDate: tomorrow,
        endDate: tomorrow,
      });

      const response = await get(token, `/api/bookings/${booking.id}`);

      expect(response.json()).toMatchObject({ canCancel: true, cancelUntil: null });
    });

    it('confirmada longe da data pode ser cancelada e informa o prazo', async () => {
      const { user, token } = await createClient();
      const booking = await createBooking({
        userId: user.id,
        startDate: '2027-04-10',
        endDate: '2027-04-10',
        status: 'CONFIRMED',
      });

      const response = await get(token, `/api/bookings/${booking.id}`);

      expect(response.json()).toMatchObject({
        canCancel: true,
        cancelUntil: addDays(todayInSaoPaulo(), FREE_CANCEL_DAYS),
      });
    });

    it('confirmada dentro do prazo não pode mais ser cancelada pelo site', async () => {
      const { user, token } = await createClient();
      // Depois de amanhã: dentro da janela de 7 dias.
      const soon = addDays(todayInSaoPaulo(), 2);
      const booking = await createBooking({
        userId: user.id,
        startDate: soon,
        endDate: soon,
        status: 'CONFIRMED',
      });

      const response = await get(token, `/api/bookings/${booking.id}`);

      expect(response.json().canCancel).toBe(false);
      // O prazo volta mesmo tendo passado: é ele que a tela explica (§13.3).
      expect(response.json().cancelUntil).toBe(addDays(todayInSaoPaulo(), FREE_CANCEL_DAYS));
    });

    /* A borda: começar exatamente no último dia permitido ainda vale. */
    it('o último dia do prazo ainda permite cancelar', async () => {
      const { user, token } = await createClient();
      const deadline = addDays(todayInSaoPaulo(), FREE_CANCEL_DAYS);
      const booking = await createBooking({
        userId: user.id,
        startDate: deadline,
        endDate: deadline,
        status: 'CONFIRMED',
      });

      const response = await get(token, `/api/bookings/${booking.id}`);

      expect(response.json().canCancel).toBe(true);
    });

    it('um dia antes do limite já está fora do prazo', async () => {
      const { user, token } = await createClient();
      const inside = addDays(todayInSaoPaulo(), FREE_CANCEL_DAYS - 1);
      const booking = await createBooking({
        userId: user.id,
        startDate: inside,
        endDate: inside,
        status: 'CONFIRMED',
      });

      const response = await get(token, `/api/bookings/${booking.id}`);

      expect(response.json().canCancel).toBe(false);
    });

    it('cancelada e concluída não têm o que cancelar, nem prazo', async () => {
      const { user, token } = await createClient();

      for (const status of ['CANCELLED', 'COMPLETED'] as const) {
        const booking = await createBooking({
          userId: user.id,
          startDate: '2027-04-10',
          endDate: '2027-04-10',
          status,
        });

        const response = await get(token, `/api/bookings/${booking.id}`);

        expect(response.json()).toMatchObject({ canCancel: false, cancelUntil: null });
      }
    });

    it('a lista também traz a permissão, para a tela não precisar abrir cada uma', async () => {
      const { user, token } = await createClient();
      await createBooking({ userId: user.id, startDate: '2027-04-10', endDate: '2027-04-10' });

      const response = await get(token, '/api/bookings/me');

      expect(response.json()[0]).toMatchObject({ canCancel: true });
    });

    /*
     * A garantia que justifica o campo existir: se o servidor diz que não pode,
     * tentar recebe `CANCEL_WINDOW_CLOSED`. Botão e recusa saem da mesma função.
     */
    it('o que vem com canCancel falso é recusado quando se tenta cancelar', async () => {
      const { user, token } = await createClient();
      const soon = addDays(todayInSaoPaulo(), 2);
      const booking = await createBooking({
        userId: user.id,
        startDate: soon,
        endDate: soon,
        status: 'CONFIRMED',
      });

      expect((await get(token, `/api/bookings/${booking.id}`)).json().canCancel).toBe(false);

      const refused = await cancel(token, booking.id);

      expect(refused.statusCode).toBe(422);
      expect(refused.json().error.code).toBe('CANCEL_WINDOW_CLOSED');
    });

    it('o que vem com canCancel verdadeiro é aceito', async () => {
      const { user, token } = await createClient();
      const booking = await createBooking({
        userId: user.id,
        startDate: '2027-04-10',
        endDate: '2027-04-10',
        status: 'CONFIRMED',
      });

      expect((await get(token, `/api/bookings/${booking.id}`)).json().canCancel).toBe(true);

      expect((await cancel(token, booking.id)).statusCode).toBe(200);
    });

    it('a resposta do cancelamento já vem sem permissão de cancelar de novo', async () => {
      const { user, token } = await createClient();
      const booking = await createBooking({
        userId: user.id,
        startDate: '2027-04-10',
        endDate: '2027-04-10',
        status: 'CONFIRMED',
      });

      const response = await cancel(token, booking.id);

      expect(response.json()).toMatchObject({ canCancel: false, cancelUntil: null });
    });
  });

  describe('PATCH /bookings/:id/cancel', () => {
    /* Desistir de um pedido é o mesmo que deixá-lo vencer: sem prazo (§9.2). */
    it('cancela pedido aguardando confirmação sem restrição de prazo', async () => {
      const { user, token } = await createClient();
      // Amanhã: bem dentro da janela de 7 dias, e ainda assim permitido.
      const tomorrow = addDays(todayInSaoPaulo(), 1);
      const booking = await createBooking({
        userId: user.id,
        startDate: tomorrow,
        endDate: tomorrow,
        holdExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      const response = await cancel(token, booking.id, 'Mudamos a data da festa.');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(
        expect.objectContaining({
          status: 'CANCELLED',
          cancelReason: 'Mudamos a data da festa.',
          // Reserva cancelada não segura mais data nenhuma.
          holdExpiresAt: null,
        }),
      );
    });

    it('registra que foi o cliente quem cancelou', async () => {
      const { user, token } = await createClient();
      const booking = await createBooking({
        userId: user.id,
        startDate: '2027-04-10',
        endDate: '2027-04-10',
      });

      await cancel(token, booking.id);

      expect(await prisma.booking.findUnique({ where: { id: booking.id } })).toMatchObject({
        cancelledBy: 'CLIENT',
        cancelReason: null,
      });
    });

    it('aceita cancelamento sem motivo', async () => {
      const { user, token } = await createClient();
      const booking = await createBooking({
        userId: user.id,
        startDate: '2027-04-10',
        endDate: '2027-04-10',
      });

      const response = await cancel(token, booking.id);

      expect(response.statusCode).toBe(200);
      expect(response.json().cancelReason).toBeNull();
    });

    it('cancela reserva confirmada dentro do prazo', async () => {
      const { user, token } = await createClient();
      // Bem longe: o prazo de 7 dias nem entra em questão.
      const booking = await createBooking({
        userId: user.id,
        startDate: '2027-04-10',
        endDate: '2027-04-10',
        status: 'CONFIRMED',
      });

      const response = await cancel(token, booking.id);

      expect(response.statusCode).toBe(200);
      expect(response.json().status).toBe('CANCELLED');
    });

    /*
     * Depois do prazo a chácara já organizou o dia em volta da reserva, e quem
     * decide é o dono. A recusa manda falar pelo WhatsApp em vez de fechar a
     * porta (§16.4).
     */
    it('recusa cancelar reserva confirmada perto da data, mandando falar pelo WhatsApp', async () => {
      const { user, token } = await createClient();
      // Daqui a 3 dias, com janela de 7: fora do prazo.
      const soon = addDays(todayInSaoPaulo(), 3);
      const booking = await createBooking({
        userId: user.id,
        startDate: soon,
        endDate: soon,
        status: 'CONFIRMED',
      });

      const response = await cancel(token, booking.id);

      expect(response.statusCode).toBe(422);
      expect(response.json().error.code).toBe('CANCEL_WINDOW_CLOSED');
      expect(response.json().error.message).toContain('11988887777');
      expect(response.json().error.details).toEqual({
        freeCancelUntilDays: FREE_CANCEL_DAYS,
        startDate: soon,
      });
    });

    /* O limite é exatamente `freeCancelUntilDays` antes do início. */
    it('o último dia do prazo ainda permite cancelar', async () => {
      const { user, token } = await createClient();
      const edge = addDays(todayInSaoPaulo(), FREE_CANCEL_DAYS);
      const booking = await createBooking({
        userId: user.id,
        startDate: edge,
        endDate: edge,
        status: 'CONFIRMED',
      });

      const response = await cancel(token, booking.id);

      expect(response.statusCode).toBe(200);
    });

    it('um dia depois do limite já recusa', async () => {
      const { user, token } = await createClient();
      const justInside = addDays(todayInSaoPaulo(), FREE_CANCEL_DAYS - 1);
      const booking = await createBooking({
        userId: user.id,
        startDate: justInside,
        endDate: justInside,
        status: 'CONFIRMED',
      });

      const response = await cancel(token, booking.id);

      expect(response.statusCode).toBe(422);
      expect(response.json().error.code).toBe('CANCEL_WINDOW_CLOSED');
    });

    /*
     * Cancelar o que já está cancelado parece inofensivo, mas trocaria
     * `cancelledBy` e `cancelReason` de uma reserva que o **dono** cancelou,
     * apagando o registro de quem cancelou e por quê.
     */
    it('recusa cancelar o que já está cancelado', async () => {
      const { user, token } = await createClient();
      const booking = await createBooking({
        userId: user.id,
        startDate: '2027-04-10',
        endDate: '2027-04-10',
        status: 'CANCELLED',
      });
      await prisma.booking.update({
        where: { id: booking.id },
        data: { cancelledBy: 'ADMIN', cancelReason: 'Chuva forte prevista.' },
      });

      const response = await cancel(token, booking.id, 'Desisti.');

      expect(response.statusCode).toBe(422);
      expect(response.json().error.code).toBe('INVALID_TRANSITION');
      // O registro do cancelamento do dono permanece.
      expect(await prisma.booking.findUnique({ where: { id: booking.id } })).toMatchObject({
        cancelledBy: 'ADMIN',
        cancelReason: 'Chuva forte prevista.',
      });
    });

    it('recusa cancelar reserva já concluída', async () => {
      const { user, token } = await createClient();
      const booking = await createBooking({
        userId: user.id,
        startDate: '2026-01-10',
        endDate: '2026-01-10',
        status: 'COMPLETED',
      });

      const response = await cancel(token, booking.id);

      expect(response.statusCode).toBe(422);
      expect(response.json().error.code).toBe('INVALID_TRANSITION');
    });

    it('responde 404 ao cancelar reserva de outra pessoa', async () => {
      const mine = await createClient('ana@exemplo.com');
      const other = await createClient('bia@exemplo.com');
      const booking = await createBooking({
        userId: other.user.id,
        startDate: '2027-04-10',
        endDate: '2027-04-10',
      });

      const response = await cancel(mine.token, booking.id);

      expect(response.statusCode).toBe(404);
      // A reserva da outra pessoa continua de pé.
      expect(await prisma.booking.findUnique({ where: { id: booking.id } })).toMatchObject({
        status: 'PENDING',
      });
    });

    it('a data cancelada volta a aparecer como livre', async () => {
      const { user, token } = await createClient();
      const booking = await createBooking({
        userId: user.id,
        startDate: '2027-04-10',
        endDate: '2027-04-10',
        status: 'CONFIRMED',
      });

      const before = await app.inject({
        method: 'GET',
        url: '/api/availability?from=2027-04-10&to=2027-04-10',
      });
      expect(before.json().days[0].status).toBe('booked');

      await cancel(token, booking.id);

      const after = await app.inject({
        method: 'GET',
        url: '/api/availability?from=2027-04-10&to=2027-04-10',
      });
      expect(after.json().days[0].status).toBe('free');
    });

    describe('e-mail (§17)', () => {
      it('avisa o cliente, com o motivo e o WhatsApp da chácara', async () => {
        const { user, token } = await createClient();
        const booking = await createBooking({
          userId: user.id,
          startDate: '2027-04-09',
          endDate: '2027-04-10',
        });

        await cancel(token, booking.id, 'Mudamos a data da festa.');

        expect(outbox).toHaveLength(1);
        expect(outbox[0]?.to).toBe('ana@exemplo.com');
        expect(outbox[0]?.subject).toBe('Sua reserva foi cancelada');
        expect(outbox[0]?.text).toContain('Mudamos a data da festa.');
        expect(outbox[0]?.text).toContain('11988887777');
        expect(outbox[0]?.text).toContain('9 a 10 de abril de 2027');
      });

      it('omite a linha de motivo quando não há motivo', async () => {
        const { user, token } = await createClient();
        const booking = await createBooking({
          userId: user.id,
          startDate: '2027-04-10',
          endDate: '2027-04-10',
        });

        await cancel(token, booking.id);

        expect(outbox[0]?.text).not.toContain('Motivo:');
      });

      /* A §16.6 proíbe inventar fato: sem WhatsApp cadastrado, outro caminho. */
      it('oferece responder o e-mail quando a chácara não tem WhatsApp', async () => {
        await prisma.venueSettings.update({ where: { id: 1 }, data: { whatsapp: null } });
        const { user, token } = await createClient();
        const booking = await createBooking({
          userId: user.id,
          startDate: '2027-04-10',
          endDate: '2027-04-10',
        });

        await cancel(token, booking.id);

        expect(outbox[0]?.text).toContain('responda este e-mail');
      });

      it('não manda e-mail quando o cancelamento é recusado', async () => {
        const { user, token } = await createClient();
        const booking = await createBooking({
          userId: user.id,
          startDate: '2026-01-10',
          endDate: '2026-01-10',
          status: 'COMPLETED',
        });

        await cancel(token, booking.id);

        expect(outbox).toHaveLength(0);
      });
    });
  });

  /**
   * Lacuna da T19 fechada aqui: a §17 prevê o aviso de pedido novo para o dono, e
   * ele não existia. Sem isso o pedido só seria descoberto se alguém abrisse o
   * painel por conta própria, com o prazo de bloqueio correndo.
   */
  describe('aviso de pedido novo para o dono (§17)', () => {
    async function postBooking(token: string) {
      return app.inject({
        method: 'POST',
        url: '/api/bookings',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          startDate: '2027-04-09',
          endDate: '2027-04-10',
          eventType: 'BABY_SHOWER',
          guestCount: 60,
          expectedTotalCents: 300000,
        },
      });
    }

    it('manda para todos os admins, com o link do painel', async () => {
      const { token } = await createClient();
      await createUser({ name: 'Dono', email: 'dono@chacara.local', role: 'ADMIN' });
      await createUser({ name: 'Equipe', email: 'equipe@chacara.local', role: 'ADMIN' });

      const created = await postBooking(token);
      expect(created.statusCode).toBe(201);

      const notices = outbox.filter((mail) => mail.subject.startsWith('Novo pedido de reserva'));
      expect(notices.map((mail) => mail.to).sort()).toEqual([
        'dono@chacara.local',
        'equipe@chacara.local',
      ]);
      expect(notices[0]?.text).toContain(`/admin/reservas/${created.json().id}`);
    });

    it('leva o nome, o telefone e o total do cliente', async () => {
      const { token } = await createClient();
      await createUser({ name: 'Dono', email: 'dono@chacara.local', role: 'ADMIN' });

      await postBooking(token);

      const notice = outbox.find((mail) => mail.subject.startsWith('Novo pedido de reserva'));
      expect(notice?.text).toContain('Ana Beatriz');
      expect(notice?.text).toContain('11999990000');
      expect(notice?.text).toContain('60 pessoas');
    });

    /* Sem admin cadastrado o pedido continua valendo: e-mail não desfaz nada. */
    it('não derruba a reserva quando não há admin com e-mail', async () => {
      const { token } = await createClient();

      const response = await postBooking(token);

      expect(response.statusCode).toBe(201);
      expect(outbox.filter((mail) => mail.subject.startsWith('Novo pedido'))).toHaveLength(0);
    });
  });
});
