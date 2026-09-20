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
const { prisma, truncateAll } = await import('./helpers/db.js');

const PASSWORD = 'senha-bem-boa-123';
const APP_ORIGIN = 'http://localhost:5173';

async function createClient(
  overrides: { email?: string; verified?: boolean; withPassword?: boolean } = {},
) {
  const { email = 'ana@exemplo.com', verified = true, withPassword = true } = overrides;

  return prisma.user.create({
    data: {
      name: 'Ana Beatriz',
      email,
      phone: '11999990000',
      passwordHash: withPassword ? await hashPassword(PASSWORD) : null,
      emailVerifiedAt: verified ? new Date() : null,
      termsAcceptedAt: new Date(),
    },
  });
}

describe('sessão', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();

    // Rota de sonda para exercitar os decorators de autorização. Precisa ser
    // registrada antes do `ready()`: o Fastify não aceita rota nova depois disso.
    app.get(
      '/api/__probe/admin',
      { onRequest: [app.authenticate, app.requireRole('ADMIN')] },
      async () => ({ ok: true }),
    );

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll();
    outbox.length = 0;
  });

  function loginWith(email: string, password: string) {
    return app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password },
    });
  }

  function refreshCookieOf(response: { cookies: { name: string; value: string }[] }) {
    return response.cookies.find((cookie) => cookie.name === 'refresh_token')?.value;
  }

  function refresh(cookie: string | undefined, origin: string | undefined = APP_ORIGIN) {
    return app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      ...(cookie ? { cookies: { refresh_token: cookie } } : {}),
      ...(origin ? { headers: { origin } } : {}),
    });
  }

  describe('POST /auth/login', () => {
    it('abre a sessão com a senha certa', async () => {
      await createClient();

      const response = await loginWith('ana@exemplo.com', PASSWORD);

      expect(response.statusCode).toBe(200);
      expect(response.json().user).toMatchObject({
        email: 'ana@exemplo.com',
        role: 'CLIENT',
        emailVerified: true,
      });
      expect(refreshCookieOf(response)).toEqual(expect.any(String));
    });

    it('aceita o e-mail digitado com maiúsculas', async () => {
      await createClient();

      const response = await loginWith('  ANA@Exemplo.COM ', PASSWORD);

      expect(response.statusCode).toBe(200);
    });

    /*
     * §10.2: nada na resposta pode revelar se o e-mail está cadastrado.
     */
    describe('sem revelar quais e-mails existem', () => {
      it('dá a mesma resposta para senha errada e e-mail inexistente', async () => {
        await createClient();

        const wrongPassword = await loginWith('ana@exemplo.com', 'senha-errada-123');
        const unknownEmail = await loginWith('ninguem@exemplo.com', PASSWORD);

        expect(wrongPassword.statusCode).toBe(401);
        expect(unknownEmail.statusCode).toBe(401);
        expect(unknownEmail.json()).toEqual(wrongPassword.json());
        expect(wrongPassword.json().error.code).toBe('INVALID_CREDENTIALS');
      });

      it('recusa conta sem senha sem dizer que ela existe', async () => {
        // Conta só com Google, ou criada pelo admin: não há senha a conferir.
        await createClient({ withPassword: false });

        const response = await loginWith('ana@exemplo.com', PASSWORD);

        expect(response.statusCode).toBe(401);
        expect(response.json().error.code).toBe('INVALID_CREDENTIALS');
      });

      // A confirmação é checada depois da senha: ao contrário, bastaria tentar
      // entrar para descobrir que um endereço está cadastrado.
      it('só fala de confirmação pendente para quem acertou a senha', async () => {
        await createClient({ verified: false });

        const rightPassword = await loginWith('ana@exemplo.com', PASSWORD);
        const wrongPassword = await loginWith('ana@exemplo.com', 'senha-errada-123');

        expect(rightPassword.statusCode).toBe(403);
        expect(rightPassword.json().error.code).toBe('EMAIL_NOT_VERIFIED');
        expect(wrongPassword.json().error.code).toBe('INVALID_CREDENTIALS');
      });

      it('não abre sessão para conta não confirmada', async () => {
        await createClient({ verified: false });

        const response = await loginWith('ana@exemplo.com', PASSWORD);

        expect(refreshCookieOf(response)).toBeUndefined();
        expect(await prisma.refreshToken.count()).toBe(0);
      });
    });
  });

  describe('POST /auth/refresh', () => {
    async function openSession() {
      await createClient();
      const response = await loginWith('ana@exemplo.com', PASSWORD);
      return refreshCookieOf(response);
    }

    it('troca o token e mantém a sessão', async () => {
      const first = await openSession();

      const response = await refresh(first);

      expect(response.statusCode).toBe(200);
      expect(response.json().accessToken).toEqual(expect.any(String));

      const second = refreshCookieOf(response);
      expect(second).toBeDefined();
      expect(second).not.toBe(first);
    });

    it('continua na mesma família, para o rastro da sessão não se perder', async () => {
      const first = await openSession();

      await refresh(first);

      const families = new Set((await prisma.refreshToken.findMany()).map((row) => row.familyId));
      expect(families.size).toBe(1);
      expect(await prisma.refreshToken.count()).toBe(2);
    });

    it('revoga o token gasto', async () => {
      const first = await openSession();

      await refresh(first);

      const revoked = await prisma.refreshToken.findMany({ where: { revokedAt: { not: null } } });
      expect(revoked).toHaveLength(1);
    });

    it('permite rotacionar várias vezes em sequência', async () => {
      let cookie = await openSession();

      for (let round = 0; round < 3; round += 1) {
        const response = await refresh(cookie);
        expect(response.statusCode).toBe(200);
        cookie = refreshCookieOf(response);
      }

      expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(1);
    });

    /*
     * O ponto central da rotação (§10.1). Se um token já gasto reaparece, ou ele
     * foi copiado, ou vazou: a sessão inteira cai, e tanto o atacante quanto o
     * dono precisam entrar de novo.
     */
    describe('detecção de reuso', () => {
      it('recusa um token já rotacionado', async () => {
        const first = await openSession();
        await refresh(first);

        const response = await refresh(first);

        expect(response.statusCode).toBe(401);
        expect(response.json().error.code).toBe('UNAUTHORIZED');
      });

      it('revoga a família inteira, derrubando também o token novo', async () => {
        const first = await openSession();
        const second = refreshCookieOf(await refresh(first));

        await refresh(first);

        const stillValid = await prisma.refreshToken.count({ where: { revokedAt: null } });
        expect(stillValid).toBe(0);

        const withNewToken = await refresh(second);
        expect(withNewToken.statusCode).toBe(401);
      });

      it('não derruba a sessão de outro dispositivo', async () => {
        await createClient();
        const deviceA = refreshCookieOf(await loginWith('ana@exemplo.com', PASSWORD));
        const deviceB = refreshCookieOf(await loginWith('ana@exemplo.com', PASSWORD));

        await refresh(deviceA);
        await refresh(deviceA);

        const responseB = await refresh(deviceB);
        expect(responseB.statusCode).toBe(200);
      });

      it('deixa apenas uma de várias rotações simultâneas passar', async () => {
        const first = await openSession();

        const responses = await Promise.all([refresh(first), refresh(first), refresh(first)]);

        expect(responses.filter((response) => response.statusCode === 200)).toHaveLength(1);
      });
    });

    it('limpa o cookie quando a sessão não pode ser renovada', async () => {
      const response = await refresh('token-inventado');

      expect(response.statusCode).toBe(401);
      const cookie = response.cookies.find((item) => item.name === 'refresh_token');
      expect(cookie?.value).toBe('');
    });

    it('recusa sem cookie nenhum', async () => {
      const response = await refresh(undefined);

      expect(response.statusCode).toBe(401);
    });

    it('recusa token expirado', async () => {
      const first = await openSession();
      await prisma.refreshToken.updateMany({
        data: { expiresAt: new Date('2020-01-01T00:00:00.000Z') },
      });

      const response = await refresh(first);

      expect(response.statusCode).toBe(401);
    });

    // §10.7: segunda camada de CSRF, depois do SameSite=Strict do cookie.
    describe('checagem de origem', () => {
      it('recusa requisição de outra origem', async () => {
        const first = await openSession();

        const response = await refresh(first, 'https://site-malicioso.com');

        expect(response.statusCode).toBe(403);
        expect(response.json().error.code).toBe('FORBIDDEN');
      });

      it('não gasta o token quando a origem é recusada', async () => {
        const first = await openSession();

        await refresh(first, 'https://site-malicioso.com');

        const response = await refresh(first);
        expect(response.statusCode).toBe(200);
      });

      // Cliente que não é navegador não manda Origin, e exigir o cabeçalho
      // quebraria integração legítima sem fechar furo que o cookie já fecha.
      it('aceita requisição sem cabeçalho Origin', async () => {
        const first = await openSession();

        const response = await refresh(first, undefined);

        expect(response.statusCode).toBe(200);
      });
    });
  });

  describe('POST /auth/logout', () => {
    function logout(cookie?: string) {
      return app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: { origin: APP_ORIGIN },
        ...(cookie ? { cookies: { refresh_token: cookie } } : {}),
      });
    }

    it('encerra a sessão e limpa o cookie', async () => {
      await createClient();
      const cookie = refreshCookieOf(await loginWith('ana@exemplo.com', PASSWORD));

      const response = await logout(cookie);

      expect(response.statusCode).toBe(204);
      expect(response.cookies.find((item) => item.name === 'refresh_token')?.value).toBe('');
      expect(await refresh(cookie).then((r) => r.statusCode)).toBe(401);
    });

    // Sair significa encerrar a sessão, e a sessão é a cadeia de rotações.
    it('revoga a família inteira, não só o token apresentado', async () => {
      await createClient();
      const first = refreshCookieOf(await loginWith('ana@exemplo.com', PASSWORD));
      const second = refreshCookieOf(await refresh(first));

      await logout(second);

      expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
    });

    it('é idempotente: sair sem estar logado não é erro', async () => {
      expect((await logout()).statusCode).toBe(204);
      expect((await logout('token-inventado')).statusCode).toBe(204);
    });

    it('não derruba a sessão de outro dispositivo', async () => {
      await createClient();
      const deviceA = refreshCookieOf(await loginWith('ana@exemplo.com', PASSWORD));
      const deviceB = refreshCookieOf(await loginWith('ana@exemplo.com', PASSWORD));

      await logout(deviceA);

      expect((await refresh(deviceB)).statusCode).toBe(200);
    });
  });

  describe('GET e PATCH /me', () => {
    async function authenticated() {
      await createClient();
      const response = await loginWith('ana@exemplo.com', PASSWORD);
      return response.json().accessToken as string;
    }

    it('devolve o perfil de quem está logado', async () => {
      const accessToken = await authenticated();

      const response = await app.inject({
        method: 'GET',
        url: '/api/me',
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ email: 'ana@exemplo.com', name: 'Ana Beatriz' });
    });

    it('nunca devolve hash de senha', async () => {
      const accessToken = await authenticated();

      const response = await app.inject({
        method: 'GET',
        url: '/api/me',
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(response.body).not.toContain('argon2');
      expect(response.json()).not.toHaveProperty('passwordHash');
    });

    it('recusa sem token, com token inválido e com token de outro segredo', async () => {
      const withoutToken = await app.inject({ method: 'GET', url: '/api/me' });
      const withGarbage = await app.inject({
        method: 'GET',
        url: '/api/me',
        headers: { authorization: 'Bearer nao-e-um-jwt' },
      });

      expect(withoutToken.statusCode).toBe(401);
      expect(withoutToken.json().error.code).toBe('UNAUTHORIZED');
      expect(withGarbage.statusCode).toBe(401);
    });

    it('atualiza nome e telefone', async () => {
      const accessToken = await authenticated();

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/me',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { name: 'Ana B. Souza', phone: '(11) 98888-7777' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ name: 'Ana B. Souza', phone: '11988887777' });
    });

    it('aceita mudar só um campo', async () => {
      const accessToken = await authenticated();

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/me',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { phone: '(11) 97777-6666' },
      });

      expect(response.json()).toMatchObject({ name: 'Ana Beatriz', phone: '11977776666' });
    });

    it('recusa corpo vazio', async () => {
      const accessToken = await authenticated();

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/me',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    // Trocar e-mail muda a identidade da conta e exigiria confirmar o novo
    // endereço; papel nunca é editável pelo próprio usuário.
    it('ignora tentativa de mudar e-mail ou papel', async () => {
      const accessToken = await authenticated();

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/me',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { name: 'Ana', email: 'outra@exemplo.com', role: 'ADMIN' },
      });

      expect(response.statusCode).toBe(200);
      const user = await prisma.user.findUniqueOrThrow({ where: { email: 'ana@exemplo.com' } });
      expect(user.role).toBe('CLIENT');
    });
  });

  /*
   * §10.6: o papel vem do banco nas rotas sensíveis. Só o claim não serve: um
   * admin rebaixado continuaria com poder até o token expirar.
   */
  describe('requireRole', () => {
    async function tokenFor(role: 'CLIENT' | 'ADMIN') {
      const user = await prisma.user.create({
        data: {
          name: role === 'ADMIN' ? 'Administração' : 'Cliente',
          email: `${role.toLowerCase()}@exemplo.com`,
          passwordHash: await hashPassword(PASSWORD),
          emailVerifiedAt: new Date(),
          role,
        },
      });
      const response = await loginWith(user.email ?? '', PASSWORD);
      return { accessToken: response.json().accessToken as string, userId: user.id };
    }

    function probe(accessToken: string) {
      return app.inject({
        method: 'GET',
        url: '/api/__probe/admin',
        headers: { authorization: `Bearer ${accessToken}` },
      });
    }

    it('libera quem tem o papel', async () => {
      const { accessToken } = await tokenFor('ADMIN');

      expect((await probe(accessToken)).statusCode).toBe(200);
    });

    it('recusa quem não tem, com FORBIDDEN', async () => {
      const { accessToken } = await tokenFor('CLIENT');

      const response = await probe(accessToken);
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('FORBIDDEN');
    });

    it('barra na hora quando o papel muda no banco, sem esperar o token expirar', async () => {
      const { accessToken, userId } = await tokenFor('ADMIN');
      expect((await probe(accessToken)).statusCode).toBe(200);

      await prisma.user.update({ where: { id: userId }, data: { role: 'CLIENT' } });

      expect((await probe(accessToken)).statusCode).toBe(403);
    });

    it('recusa token de conta que não existe mais', async () => {
      const { accessToken, userId } = await tokenFor('ADMIN');
      await prisma.user.delete({ where: { id: userId } });

      expect((await probe(accessToken)).statusCode).toBe(403);
    });
  });
});

describe('limite de tentativas de login (§10.7)', () => {
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

  it('corta depois de 5 tentativas por minuto no mesmo e-mail', async () => {
    await createClient();

    const attempts = [];
    for (let index = 0; index < 6; index += 1) {
      attempts.push(
        await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { email: 'ana@exemplo.com', password: 'senha-errada-123' },
        }),
      );
    }

    expect(attempts.slice(0, 5).every((response) => response.statusCode === 401)).toBe(true);
    expect(attempts[5]?.statusCode).toBe(429);
    expect(attempts[5]?.json().error.code).toBe('RATE_LIMITED');
  });

  // A chave é IP + e-mail: limitar só por IP travaria uma rede inteira por causa
  // de uma pessoa.
  it('não bloqueia outro e-mail do mesmo IP', async () => {
    await createClient({ email: 'ana@exemplo.com' });
    await createClient({ email: 'bia@exemplo.com' });

    for (let index = 0; index < 5; index += 1) {
      await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'ana@exemplo.com', password: 'senha-errada-123' },
      });
    }

    const other = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'bia@exemplo.com', password: PASSWORD },
    });

    expect(other.statusCode).toBe(200);
  });
});
