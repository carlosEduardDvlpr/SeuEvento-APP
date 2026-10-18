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
const { hashPassword } = await import('../src/lib/password.js');
const { parseISODate, toISODate, addDays, todayInSaoPaulo } = await import('../src/lib/dates.js');
const { prisma, truncateAll } = await import('./helpers/db.js');

/**
 * Remoção da conta pelo próprio cliente (§10.8).
 *
 * A promessa tem duas metades que precisam valer juntas: os dados pessoais
 * saem, e as reservas ficam. Testar só a primeira deixaria passar uma
 * implementação que apaga o histórico; só a segunda, uma que não anonimiza nada.
 */

const PASSWORD = 'senha-bem-boa-123';
const EMAIL = 'ana@exemplo.com';

async function createClient(overrides: { googleId?: string } = {}) {
  return prisma.user.create({
    data: {
      name: 'Ana Beatriz',
      email: EMAIL,
      phone: '11999990000',
      passwordHash: await hashPassword(PASSWORD),
      googleId: overrides.googleId ?? null,
      emailVerifiedAt: new Date(),
      termsAcceptedAt: new Date(),
    },
  });
}

/** Reserva mínima: aqui o que importa é o status, não o valor. */
function createBooking(
  userId: string,
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED',
  options: { startDate?: string; holdExpiresAt?: Date | null } = {},
) {
  const start = options.startDate ?? addDays(todayInSaoPaulo(), 20);

  return prisma.booking.create({
    data: {
      userId,
      startDate: parseISODate(start),
      endDate: parseISODate(start),
      status,
      eventType: 'BABY_SHOWER',
      guestCount: 40,
      holdExpiresAt:
        options.holdExpiresAt === undefined
          ? status === 'PENDING'
            ? new Date(Date.now() + 48 * 60 * 60 * 1000)
            : null
          : options.holdExpiresAt,
      dailyBreakdown: [],
      appliedCombos: [],
      dailyTotalCents: 150_000,
      itemsTotalCents: 0,
      discountTotalCents: 0,
      totalCents: 150_000,
    },
  });
}

describe('remoção da conta (§10.8)', () => {
  let app: FastifyInstance;

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
  });

  async function session() {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: EMAIL, password: PASSWORD },
    });

    return {
      accessToken: response.json().accessToken as string,
      refreshCookie: response.cookies.find((cookie) => cookie.name === 'refresh_token')?.value,
    };
  }

  function deleteAccount(accessToken: string) {
    return app.inject({
      method: 'DELETE',
      url: '/api/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
  }

  it('exige sessão', async () => {
    const response = await app.inject({ method: 'DELETE', url: '/api/me' });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHORIZED');
  });

  it('apaga nome, e-mail e telefone, mantendo a linha', async () => {
    const user = await createClient();
    const { accessToken } = await session();

    const response = await deleteAccount(accessToken);

    expect(response.statusCode).toBe(204);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.name).toBe('Conta removida');
    expect(row.email).toBeNull();
    expect(row.phone).toBeNull();
    expect(row.emailVerifiedAt).toBeNull();
  });

  /*
   * O essencial da §10.8: a linha de `User` é o destino da chave estrangeira de
   * `Booking`, então apagá-la levaria o histórico fiscal junto.
   */
  it('mantém as reservas, ainda ligadas à linha anonimizada', async () => {
    const user = await createClient();
    await createBooking(user.id, 'COMPLETED');
    await createBooking(user.id, 'CANCELLED', { startDate: addDays(todayInSaoPaulo(), 30) });

    const { accessToken } = await session();
    await deleteAccount(accessToken);

    const bookings = await prisma.booking.findMany({ where: { userId: user.id } });
    expect(bookings).toHaveLength(2);
    expect(bookings.map((booking) => booking.totalCents)).toEqual([150_000, 150_000]);
  });

  /*
   * Com credencial preservada, quem apagou a conta voltaria a entrar nela e
   * encontraria o histórico — a remoção não teria valido nada.
   */
  it('derruba as credenciais, inclusive a do Google', async () => {
    const user = await createClient({ googleId: 'google-sub-123' });
    const { accessToken } = await session();

    await deleteAccount(accessToken);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.passwordHash).toBeNull();
    expect(row.googleId).toBeNull();
  });

  it('não deixa entrar de novo com a senha antiga', async () => {
    await createClient();
    const { accessToken } = await session();

    await deleteAccount(accessToken);

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: EMAIL, password: PASSWORD },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('INVALID_CREDENTIALS');
  });

  it('encerra as sessões de todos os aparelhos', async () => {
    const user = await createClient();
    const deviceA = await session();
    const deviceB = await session();

    await deleteAccount(deviceA.accessToken);

    expect(await prisma.refreshToken.count({ where: { userId: user.id } })).toBe(0);

    for (const cookie of [deviceA.refreshCookie, deviceB.refreshCookie]) {
      const refreshed = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        headers: { origin: 'http://localhost:5173' },
        cookies: { refresh_token: cookie ?? '' },
      });

      expect(refreshed.statusCode).toBe(401);
    }
  });

  // Link antigo na caixa de entrada não pode reabrir o caminho para a conta.
  it('invalida token de confirmação e de redefinição pendentes', async () => {
    const user = await createClient();

    await prisma.authToken.create({
      data: {
        userId: user.id,
        type: 'PASSWORD_RESET',
        tokenHash: 'hash-de-teste',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const { accessToken } = await session();
    await deleteAccount(accessToken);

    expect(await prisma.authToken.count({ where: { userId: user.id } })).toBe(0);
  });

  it('limpa o cookie de refresh do aparelho que pediu', async () => {
    await createClient();
    const { accessToken } = await session();

    const response = await deleteAccount(accessToken);

    expect(response.cookies.find((cookie) => cookie.name === 'refresh_token')?.value).toBe('');
  });

  describe('reserva em andamento', () => {
    /*
     * Apagar o telefone de quem tem festa marcada deixa a chácara sem como
     * avisar de imprevisto, e a pessoa sem como ser avisada. A LGPD reconhece a
     * guarda de dado necessário para executar o contrato (art. 16).
     */
    it('recusa quando há reserva confirmada', async () => {
      const user = await createClient();
      await createBooking(user.id, 'CONFIRMED');

      const { accessToken } = await session();
      const response = await deleteAccount(accessToken);

      expect(response.statusCode).toBe(422);
      expect(response.json().error.code).toBe('INVALID_TRANSITION');
      expect(response.json().error.details).toEqual({ activeBookings: 1 });

      // E nada foi tocado: recusa que anonimiza pela metade é o pior resultado.
      const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.email).toBe(EMAIL);
      expect(row.name).toBe('Ana Beatriz');
      expect(await prisma.refreshToken.count({ where: { userId: user.id } })).toBe(1);
    });

    it('recusa quando há pedido aguardando dentro do prazo', async () => {
      const user = await createClient();
      await createBooking(user.id, 'PENDING');

      const { accessToken } = await session();

      expect((await deleteAccount(accessToken)).statusCode).toBe(422);
    });

    /*
     * Pedido vencido não ocupa data (§9.1), então também não deveria segurar a
     * conta: a pessoa ficaria presa a um pedido que já caiu.
     */
    it('permite quando o único pedido aguardando já venceu', async () => {
      const user = await createClient();
      await createBooking(user.id, 'PENDING', {
        holdExpiresAt: new Date(Date.now() - 60 * 60 * 1000),
      });

      const { accessToken } = await session();

      expect((await deleteAccount(accessToken)).statusCode).toBe(204);
    });

    it('permite quando só há reserva encerrada ou cancelada', async () => {
      const user = await createClient();
      await createBooking(user.id, 'COMPLETED', {
        startDate: toISODate(parseISODate(addDays(todayInSaoPaulo(), -30))),
      });
      await createBooking(user.id, 'CANCELLED');

      const { accessToken } = await session();

      expect((await deleteAccount(accessToken)).statusCode).toBe(204);
    });

    it('conta todas as reservas em andamento na mensagem', async () => {
      const user = await createClient();
      await createBooking(user.id, 'CONFIRMED', { startDate: addDays(todayInSaoPaulo(), 20) });
      await createBooking(user.id, 'PENDING', { startDate: addDays(todayInSaoPaulo(), 40) });

      const { accessToken } = await session();
      const response = await deleteAccount(accessToken);

      expect(response.json().error.details).toEqual({ activeBookings: 2 });
      expect(response.json().error.message).toContain('2 reservas');
    });
  });

  /*
   * O access token vive 15 minutos e a linha continua existindo, então ele ainda
   * responde nesse intervalo. O que não pode é responder com dado pessoal.
   */
  it('não devolve dado pessoal no perfil depois da remoção', async () => {
    await createClient();
    const { accessToken } = await session();

    await deleteAccount(accessToken);

    const response = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ name: 'Conta removida', email: null, phone: null });
  });
});
