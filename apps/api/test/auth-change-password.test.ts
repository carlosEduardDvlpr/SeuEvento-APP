import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/mailer.js', () => ({
  sendMail: async () => {},
  resetMailerForTests: () => {},
}));

const { buildApp } = await import('../src/app.js');
const { hashPassword, verifyPassword } = await import('../src/lib/password.js');
const { prisma, truncateAll } = await import('./helpers/db.js');

/**
 * Troca de senha por quem está logado (§10.5, novembro de 2026).
 *
 * Três garantias organizam o arquivo:
 *
 * - A senha atual é conferida, e errar responde `400` no campo, nunca `401`: o
 *   SPA trata `401` como sessão vencida e acabaria desconectando quem só digitou
 *   errado (§10.4).
 * - Toda sessão aberta cai, como na redefinição: a senha antiga pode ter vazado.
 * - A aba de onde a troca partiu continua logada, com uma sessão nova.
 */

const EMAIL = 'ana@exemplo.com';
const PASSWORD = 'senha-bem-boa-123';
const NEW_PASSWORD = 'outra-senha-forte-456';
const APP_ORIGIN = 'http://localhost:5173';

async function createClient(overrides: { withPassword?: boolean } = {}) {
  return prisma.user.create({
    data: {
      name: 'Ana Beatriz',
      email: EMAIL,
      phone: '11999990000',
      passwordHash: overrides.withPassword === false ? null : await hashPassword(PASSWORD),
      googleId: overrides.withPassword === false ? 'google-sub-123' : null,
      emailVerifiedAt: new Date(),
      termsAcceptedAt: new Date(),
    },
  });
}

function refreshCookieOf(response: { cookies: { name: string; value: string }[] }) {
  return response.cookies.find((cookie) => cookie.name === 'refresh_token')?.value;
}

describe('troca de senha', () => {
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
  });

  async function login(password = PASSWORD) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: EMAIL, password },
    });

    return {
      response,
      accessToken: response.json().accessToken as string,
      refreshCookie: refreshCookieOf(response),
    };
  }

  function changePassword(accessToken: string | undefined, payload: Record<string, unknown>) {
    return app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      ...(accessToken ? { headers: { authorization: `Bearer ${accessToken}` } } : {}),
      payload,
    });
  }

  function refresh(cookie: string | undefined) {
    return app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { origin: APP_ORIGIN },
      cookies: { refresh_token: cookie ?? '' },
    });
  }

  it('troca a senha: a nova entra, e a antiga não', async () => {
    const user = await createClient();
    const { accessToken } = await login();

    const response = await changePassword(accessToken, {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
    });

    expect(response.statusCode).toBe(200);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(row.passwordHash ?? '', NEW_PASSWORD)).toBe(true);

    const withOld = await login(PASSWORD);
    expect(withOld.response.statusCode).toBe(401);
    expect(withOld.response.json().error.code).toBe('INVALID_CREDENTIALS');

    expect((await login(NEW_PASSWORD)).response.statusCode).toBe(200);
  });

  /* A senha antiga pode ter vazado: nenhuma sessão aberta com ela sobrevive. */
  it('derruba todas as sessões abertas, em todos os aparelhos', async () => {
    const user = await createClient();
    const deviceA = await login();
    const deviceB = await login();

    await changePassword(deviceA.accessToken, {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
    });

    expect((await refresh(deviceA.refreshCookie)).statusCode).toBe(401);
    expect((await refresh(deviceB.refreshCookie)).statusCode).toBe(401);

    // Sobra só a sessão nova, aberta pela própria troca.
    expect(await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } })).toBe(
      1,
    );
  });

  /* A aba de onde a troca partiu continua logada, com uma sessão de família nova. */
  it('devolve uma sessão nova, que funciona e renova', async () => {
    const user = await createClient();
    const before = await login();

    const response = await changePassword(before.accessToken, {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
    });

    expect(response.json()).toMatchObject({
      accessToken: expect.any(String),
      user: { id: user.id, email: EMAIL, hasPassword: true },
    });
    expect(response.json()).not.toHaveProperty('user.passwordHash');

    const me = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { authorization: `Bearer ${response.json().accessToken}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().email).toBe(EMAIL);

    const newCookie = refreshCookieOf(response);
    expect(newCookie).toBeDefined();
    expect(newCookie).not.toBe(before.refreshCookie);
    expect((await refresh(newCookie)).statusCode).toBe(200);

    const families = new Set(
      (await prisma.refreshToken.findMany({ where: { userId: user.id } })).map(
        (row) => row.familyId,
      ),
    );
    expect(families.size).toBe(2);
  });

  /* 401 faria o SPA renovar, repetir e desconectar quem só errou a senha (§10.4). */
  it('senha atual errada é 400 no campo, e nada muda', async () => {
    const user = await createClient();
    const { accessToken, refreshCookie } = await login();

    const response = await changePassword(accessToken, {
      currentPassword: 'nao-e-a-senha-123',
      newPassword: NEW_PASSWORD,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
    expect(response.json().error.details.fields).toEqual([
      { field: 'currentPassword', message: 'A senha atual não confere.' },
    ]);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await verifyPassword(row.passwordHash ?? '', PASSWORD)).toBe(true);
    expect((await refresh(refreshCookie)).statusCode).toBe(200);
  });

  /* Conta só com o Google: não há senha para conferir, nem para trocar. */
  it('recusa a conta que não tem senha', async () => {
    const user = await createClient({ withPassword: false });
    const accessToken = app.jwt.sign({ sub: user.id, role: user.role });

    const response = await changePassword(accessToken, {
      currentPassword: 'qualquer-coisa',
      newPassword: NEW_PASSWORD,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Sua conta entra com o Google e não tem senha para trocar.',
    });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash).toBe(
      null,
    );
  });

  it('exige sessão', async () => {
    await createClient();

    const response = await changePassword(undefined, {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHORIZED');
  });

  it('recusa senha nova igual à atual e senha nova curta, apontando o campo', async () => {
    await createClient();
    const { accessToken } = await login();

    const same = await changePassword(accessToken, {
      currentPassword: PASSWORD,
      newPassword: PASSWORD,
    });
    const short = await changePassword(accessToken, {
      currentPassword: PASSWORD,
      newPassword: 'curta',
    });

    expect(same.statusCode).toBe(400);
    expect(same.json().error.details.fields[0].field).toBe('newPassword');
    expect(short.statusCode).toBe(400);
    expect(short.json().error.details.fields[0].field).toBe('newPassword');
  });
});

/* O mesmo ritmo do login (§10.7): cinco tentativas por minuto, contadas por conta. */
describe('limite de tentativas da troca de senha', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ rateLimit: true });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll();
  });

  it('corta depois de 5 tentativas por minuto', async () => {
    const user = await createClient();
    const accessToken = app.jwt.sign({ sub: user.id, role: user.role });

    const attempts = [];
    for (let index = 0; index < 6; index += 1) {
      attempts.push(
        await app.inject({
          method: 'POST',
          url: '/api/auth/change-password',
          headers: { authorization: `Bearer ${accessToken}` },
          payload: { currentPassword: 'nao-e-a-senha-123', newPassword: NEW_PASSWORD },
        }),
      );
    }

    expect(attempts.slice(0, 5).every((response) => response.statusCode === 400)).toBe(true);
    expect(attempts[5]?.statusCode).toBe(429);
    expect(attempts[5]?.json().error.code).toBe('RATE_LIMITED');
  });
});
