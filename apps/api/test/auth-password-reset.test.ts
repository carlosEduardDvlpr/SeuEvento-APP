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
const { hashPassword, verifyPassword } = await import('../src/lib/password.js');
const { ACCEPTED_MESSAGE } = await import('../src/modules/auth/service.js');
const { prisma, truncateAll } = await import('./helpers/db.js');

const EMAIL = 'ana@exemplo.com';
const OLD_PASSWORD = 'senha-antiga-123';
const NEW_PASSWORD = 'senha-nova-456789';
const APP_ORIGIN = 'http://localhost:5173';

describe('redefinição de senha (§10.5)', () => {
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

  async function createClient(
    overrides: { verified?: boolean; withPassword?: boolean; email?: string } = {},
  ) {
    const { verified = true, withPassword = true, email = EMAIL } = overrides;

    return prisma.user.create({
      data: {
        name: 'Ana Beatriz',
        email,
        passwordHash: withPassword ? await hashPassword(OLD_PASSWORD) : null,
        emailVerifiedAt: verified ? new Date() : null,
        termsAcceptedAt: new Date(),
      },
    });
  }

  function forgot(email: string) {
    return app.inject({ method: 'POST', url: '/api/auth/forgot-password', payload: { email } });
  }

  function reset(token: string, password = NEW_PASSWORD) {
    return app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token, password },
    });
  }

  function login(password: string, email = EMAIL) {
    return app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } });
  }

  /** Pega o token do link que foi para o e-mail, como a pessoa faria ao clicar. */
  function tokenFromLastEmail(): string {
    const last = outbox.at(-1);
    if (!last) throw new Error('Nenhum e-mail na caixa de saída.');

    const link = last.text.match(/https?:\/\/\S+/)?.[0];
    if (!link) throw new Error(`E-mail sem link: ${last.subject}`);

    const token = new URL(link).searchParams.get('token');
    if (!token) throw new Error(`Link sem token: ${link}`);
    return token;
  }

  describe('POST /auth/forgot-password', () => {
    it('manda o link e responde 202', async () => {
      await createClient();

      const response = await forgot(EMAIL);

      expect(response.statusCode).toBe(202);
      expect(response.json()).toEqual({ message: ACCEPTED_MESSAGE });
      expect(outbox).toHaveLength(1);
      expect(outbox[0]?.subject).toMatch(/redefinir a senha/i);
      expect(outbox[0]?.text).toContain('/redefinir-senha?token=');
    });

    it('avisa a validade de 1 hora e o efeito nas outras sessões', async () => {
      await createClient();

      await forgot(EMAIL);

      expect(outbox[0]?.text).toContain('1 hora');
      expect(outbox[0]?.text).toMatch(/outros aparelhos/i);
    });

    // §10.2: a resposta não pode revelar quais e-mails têm conta.
    it('responde igual para endereço sem conta, sem criar token nem enviar e-mail', async () => {
      await createClient();
      const withAccount = await forgot(EMAIL);
      outbox.length = 0;

      const withoutAccount = await forgot('ninguem@exemplo.com');

      expect(withoutAccount.statusCode).toBe(withAccount.statusCode);
      expect(withoutAccount.json()).toEqual(withAccount.json());
      expect(outbox).toHaveLength(0);
      expect(await prisma.authToken.count({ where: { type: 'PASSWORD_RESET' } })).toBe(1);
    });

    it('normaliza o e-mail antes de procurar a conta', async () => {
      await createClient();

      const response = await forgot('  ANA@Exemplo.COM ');

      expect(response.statusCode).toBe(202);
      expect(outbox).toHaveLength(1);
    });

    /*
     * Conta sem senha (só Google, ou criada pelo admin) também pode redefinir:
     * clicar no link prova ter a caixa de entrada, que é a mesma prova do
     * cadastro. Bloquear deixaria a pessoa sem caminho de entrada caso ela perca
     * o acesso ao Google.
     */
    it('atende conta que ainda não tem senha', async () => {
      await createClient({ withPassword: false });

      await forgot(EMAIL);
      const response = await reset(tokenFromLastEmail());

      expect(response.statusCode).toBe(204);
      expect((await login(NEW_PASSWORD)).statusCode).toBe(200);
    });

    it('pedir de novo invalida o link anterior', async () => {
      await createClient();
      await forgot(EMAIL);
      const first = tokenFromLastEmail();

      await forgot(EMAIL);
      const second = tokenFromLastEmail();

      expect((await reset(first)).statusCode).toBe(400);
      expect((await reset(second)).statusCode).toBe(204);
    });
  });

  describe('POST /auth/reset-password', () => {
    async function requestReset() {
      await createClient();
      await forgot(EMAIL);
      return tokenFromLastEmail();
    }

    it('troca a senha', async () => {
      const token = await requestReset();

      const response = await reset(token);

      expect(response.statusCode).toBe(204);
      const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
      expect(await verifyPassword(user.passwordHash ?? '', NEW_PASSWORD)).toBe(true);
    });

    it('a senha antiga deixa de valer', async () => {
      const token = await requestReset();

      await reset(token);

      expect((await login(OLD_PASSWORD)).statusCode).toBe(401);
      expect((await login(NEW_PASSWORD)).statusCode).toBe(200);
    });

    /*
     * O ponto central da §10.5. Se a senha antiga vazou, quem a usou pode estar
     * com uma sessão aberta; revogar só a família atual deixaria essa sessão viva.
     */
    it('derruba as sessões abertas em todos os aparelhos', async () => {
      await createClient();
      const deviceA = await login(OLD_PASSWORD);
      const deviceB = await login(OLD_PASSWORD);
      const cookieA = deviceA.cookies.find((c) => c.name === 'refresh_token')?.value;
      const cookieB = deviceB.cookies.find((c) => c.name === 'refresh_token')?.value;
      expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(2);

      await forgot(EMAIL);
      await reset(tokenFromLastEmail());

      expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
      for (const cookie of [cookieA, cookieB]) {
        const refreshed = await app.inject({
          method: 'POST',
          url: '/api/auth/refresh',
          headers: { origin: APP_ORIGIN },
          cookies: { refresh_token: cookie ?? '' },
        });
        expect(refreshed.statusCode).toBe(401);
      }
    });

    // A §10.2 diz que confirmar o e-mail autentica; o silêncio da §10.5 é
    // intencional. A pessoa entra com a senha nova, o que confirma que ela a
    // guardou.
    it('não abre sessão automaticamente', async () => {
      const token = await requestReset();

      const response = await reset(token);

      expect(response.body).toBe('');
      expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
    });

    /*
     * Clicar no link prova acesso à caixa de entrada, que é o que a confirmação de
     * e-mail verifica. Sem isto, quem se cadastrou, não confirmou e redefiniu a
     * senha ficaria num beco sem saída: senha nova em mãos e login barrado.
     */
    it('confirma o e-mail de quem ainda não havia confirmado', async () => {
      await createClient({ verified: false });
      await forgot(EMAIL);

      await reset(tokenFromLastEmail());

      const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
      expect(user.emailVerifiedAt).not.toBeNull();
      expect((await login(NEW_PASSWORD)).statusCode).toBe(200);
    });

    it('recusa o mesmo link duas vezes', async () => {
      const token = await requestReset();
      await reset(token);

      const response = await reset(token, 'outra-senha-ainda-987');

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_TOKEN');
      // A segunda tentativa não pode ter trocado a senha.
      expect((await login(NEW_PASSWORD)).statusCode).toBe(200);
    });

    it('recusa token expirado', async () => {
      const token = await requestReset();
      await prisma.authToken.updateMany({
        data: { expiresAt: new Date('2020-01-01T00:00:00.000Z') },
      });

      const response = await reset(token);

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_TOKEN');
      expect((await login(OLD_PASSWORD)).statusCode).toBe(200);
    });

    it('recusa token inventado', async () => {
      await createClient();

      const response = await reset('nao-e-um-token');

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_TOKEN');
    });

    // Token de confirmação de e-mail não serve para trocar senha.
    it('recusa token de outro tipo', async () => {
      const user = await createClient({ verified: false });
      const { issueAuthToken } = await import('../src/lib/tokens.js');
      const verifyToken = await issueAuthToken(prisma, {
        userId: user.id,
        type: 'EMAIL_VERIFY',
      });

      const response = await reset(verifyToken);

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_TOKEN');
    });

    it('recusa senha curta, sem gastar o link', async () => {
      const token = await requestReset();

      const tooShort = await reset(token, 'curta');
      expect(tooShort.statusCode).toBe(400);
      expect(tooShort.json().error.code).toBe('VALIDATION_ERROR');

      // O link precisa continuar valendo: quem errou o tamanho só tenta de novo.
      expect((await reset(token)).statusCode).toBe(204);
    });
  });

  it('completa o caminho de quem esqueceu a senha', async () => {
    await createClient();
    const openSession = await login(OLD_PASSWORD);
    expect(openSession.statusCode).toBe(200);

    expect((await forgot(EMAIL)).statusCode).toBe(202);
    expect((await reset(tokenFromLastEmail())).statusCode).toBe(204);

    expect((await login(OLD_PASSWORD)).statusCode).toBe(401);
    expect((await login(NEW_PASSWORD)).statusCode).toBe(200);
  });
});

describe('limite de pedidos de redefinição (§10.7)', () => {
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
    outbox.length = 0;
  });

  it('corta depois de 3 pedidos na mesma hora para o mesmo e-mail', async () => {
    const attempts = [];
    for (let index = 0; index < 4; index += 1) {
      attempts.push(
        await app.inject({
          method: 'POST',
          url: '/api/auth/forgot-password',
          payload: { email: EMAIL },
        }),
      );
    }

    expect(attempts.slice(0, 3).every((response) => response.statusCode === 202)).toBe(true);
    expect(attempts[3]?.statusCode).toBe(429);
    expect(attempts[3]?.json().error.code).toBe('RATE_LIMITED');
  });

  it('não bloqueia outro e-mail', async () => {
    for (let index = 0; index < 3; index += 1) {
      await app.inject({
        method: 'POST',
        url: '/api/auth/forgot-password',
        payload: { email: EMAIL },
      });
    }

    const other = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: 'bia@exemplo.com' },
    });

    expect(other.statusCode).toBe(202);
  });
});
