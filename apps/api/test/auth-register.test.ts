import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O mailer é substituído por uma caixa de saída em memória: os testes precisam
 * ler o link de confirmação para completar o fluxo, e nada deve sair na rede.
 */
type SentEmail = { to: string; subject: string; text: string; html: string };

const { outbox } = vi.hoisted(() => ({ outbox: [] as SentEmail[] }));

vi.mock('../src/lib/mailer.js', () => ({
  sendMail: async (mail: SentEmail) => {
    outbox.push(mail);
  },
  resetMailerForTests: () => {},
}));

const { buildApp } = await import('../src/app.js');
const { verifyPassword } = await import('../src/lib/password.js');
const { ACCEPTED_MESSAGE } = await import('../src/modules/auth/service.js');
const { prisma, truncateAll } = await import('./helpers/db.js');

const NEW_ACCOUNT = {
  name: 'Ana Beatriz',
  email: 'ana@exemplo.com',
  password: 'senha-bem-boa-123',
  phone: '(11) 99999-0000',
  acceptTerms: true as const,
};

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

describe('cadastro e confirmação de e-mail', () => {
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

  function register(body: Record<string, unknown> = NEW_ACCOUNT) {
    return app.inject({ method: 'POST', url: '/api/auth/register', payload: body });
  }

  describe('POST /auth/register', () => {
    it('cria a conta ainda não confirmada e responde 202', async () => {
      const response = await register();

      expect(response.statusCode).toBe(202);
      expect(response.json()).toEqual({ message: ACCEPTED_MESSAGE });

      const user = await prisma.user.findUniqueOrThrow({ where: { email: NEW_ACCOUNT.email } });
      expect(user.emailVerifiedAt).toBeNull();
      expect(user.role).toBe('CLIENT');
    });

    it('registra o aceite dos termos (§10.8)', async () => {
      await register();

      const user = await prisma.user.findUniqueOrThrow({ where: { email: NEW_ACCOUNT.email } });
      expect(user.termsAcceptedAt).not.toBeNull();
    });

    it('guarda a senha como hash argon2id, nunca em texto puro', async () => {
      await register();

      const user = await prisma.user.findUniqueOrThrow({ where: { email: NEW_ACCOUNT.email } });
      expect(user.passwordHash).not.toBe(NEW_ACCOUNT.password);
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
      expect(await verifyPassword(user.passwordHash ?? '', NEW_ACCOUNT.password)).toBe(true);
    });

    it('normaliza o e-mail antes de gravar (§10.1)', async () => {
      await register({ ...NEW_ACCOUNT, email: '  ANA@Exemplo.COM  ' });

      const user = await prisma.user.findUnique({ where: { email: 'ana@exemplo.com' } });
      expect(user).not.toBeNull();
    });

    it('guarda o telefone só com dígitos, e aceita cadastro sem telefone', async () => {
      await register();
      const withPhone = await prisma.user.findUniqueOrThrow({
        where: { email: NEW_ACCOUNT.email },
      });
      expect(withPhone.phone).toBe('11999990000');

      await register({ ...NEW_ACCOUNT, email: 'bia@exemplo.com', phone: undefined });
      const withoutPhone = await prisma.user.findUniqueOrThrow({
        where: { email: 'bia@exemplo.com' },
      });
      expect(withoutPhone.phone).toBeNull();
    });

    it('envia o link de confirmação', async () => {
      await register();

      expect(outbox).toHaveLength(1);
      expect(outbox[0]?.to).toBe(NEW_ACCOUNT.email);
      expect(outbox[0]?.subject).toMatch(/confirme seu e-mail/i);
      expect(outbox[0]?.text).toContain('/verificar-email?token=');
    });

    describe('validação', () => {
      it('recusa cadastro sem aceitar os termos', async () => {
        const response = await register({ ...NEW_ACCOUNT, acceptTerms: false });

        expect(response.statusCode).toBe(400);
        expect(response.json().error.code).toBe('VALIDATION_ERROR');
        expect(await prisma.user.count()).toBe(0);
      });

      it('recusa senha curta', async () => {
        const response = await register({ ...NEW_ACCOUNT, password: 'curta' });

        expect(response.statusCode).toBe(400);
        expect(response.json().error.details.fields).toEqual(
          expect.arrayContaining([expect.objectContaining({ field: 'password' })]),
        );
      });

      it('recusa e-mail malformado', async () => {
        const response = await register({ ...NEW_ACCOUNT, email: 'ana@' });

        expect(response.statusCode).toBe(400);
      });
    });

    /*
     * §10.2: a resposta não pode revelar quais e-mails têm conta. Quem tenta se
     * cadastrar vê sempre a mesma coisa; só o dono da caixa de entrada descobre
     * qual dos dois casos aconteceu.
     */
    describe('sem enumeração de contas', () => {
      it('responde igual para e-mail novo e para e-mail já cadastrado', async () => {
        const first = await register();
        outbox.length = 0;
        const second = await register();

        expect(second.statusCode).toBe(first.statusCode);
        expect(second.json()).toEqual(first.json());
      });

      it('não cria um segundo usuário', async () => {
        await register();
        await register();

        expect(await prisma.user.count()).toBe(1);
      });

      it('avisa o dono do e-mail em vez de mandar link de confirmação', async () => {
        await register();
        outbox.length = 0;

        await register();

        expect(outbox).toHaveLength(1);
        expect(outbox[0]?.subject).toMatch(/já tem conta/i);
        expect(outbox[0]?.text).not.toContain('/verificar-email?token=');
      });

      it('não troca a senha de uma conta que já tem senha', async () => {
        await register();
        const before = await prisma.user.findUniqueOrThrow({
          where: { email: NEW_ACCOUNT.email },
        });

        await register({ ...NEW_ACCOUNT, password: 'senha-do-atacante-999' });

        const after = await prisma.user.findUniqueOrThrow({ where: { email: NEW_ACCOUNT.email } });
        expect(after.passwordHash).toBe(before.passwordHash);
      });
    });

    /*
     * §9.8: cliente que o admin cadastrou (sem senha e sem Google) pode assumir a
     * conta se cadastrando com o mesmo e-mail.
     */
    describe('assunção de conta criada pelo admin', () => {
      async function createAdminMadeCustomer() {
        return prisma.user.create({
          data: { name: 'Ana B. (pelo WhatsApp)', email: NEW_ACCOUNT.email, phone: '1133334444' },
        });
      }

      it('define a senha e manda o link de confirmação', async () => {
        await createAdminMadeCustomer();

        await register();

        const user = await prisma.user.findUniqueOrThrow({ where: { email: NEW_ACCOUNT.email } });
        expect(await verifyPassword(user.passwordHash ?? '', NEW_ACCOUNT.password)).toBe(true);
        expect(outbox[0]?.text).toContain('/verificar-email?token=');
      });

      // Sem confirmar o e-mail, ninguém provou ser o dono: deixar sobrescrever
      // nome e telefone daria a um estranho o poder de alterar o cadastro de um
      // cliente real.
      it('preserva o nome e o telefone que o admin registrou', async () => {
        const created = await createAdminMadeCustomer();

        await register({ ...NEW_ACCOUNT, name: 'Nome Qualquer', phone: '11912345678' });

        const user = await prisma.user.findUniqueOrThrow({ where: { email: NEW_ACCOUNT.email } });
        expect(user.name).toBe(created.name);
        expect(user.phone).toBe(created.phone);
      });

      it('não assume conta que já usa Google', async () => {
        await prisma.user.create({
          data: { name: 'Ana', email: NEW_ACCOUNT.email, googleId: 'google-123' },
        });

        await register();

        const user = await prisma.user.findUniqueOrThrow({ where: { email: NEW_ACCOUNT.email } });
        expect(user.passwordHash).toBeNull();
        expect(outbox[0]?.subject).toMatch(/já tem conta/i);
      });
    });
  });

  describe('POST /auth/verify-email', () => {
    async function registerAndGetToken() {
      await register();
      return tokenFromLastEmail();
    }

    it('confirma o e-mail e abre a sessão (§10.2, passo 5)', async () => {
      const token = await registerAndGetToken();

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/verify-email',
        payload: { token },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.accessToken).toEqual(expect.any(String));
      expect(body.user).toMatchObject({ email: NEW_ACCOUNT.email, emailVerified: true });

      const user = await prisma.user.findUniqueOrThrow({ where: { email: NEW_ACCOUNT.email } });
      expect(user.emailVerifiedAt).not.toBeNull();
    });

    it('nunca devolve hash de senha na resposta', async () => {
      const token = await registerAndGetToken();

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/verify-email',
        payload: { token },
      });

      expect(response.body).not.toContain('argon2');
      expect(response.json().user).not.toHaveProperty('passwordHash');
    });

    // §10.1: o refresh token não pode ser alcançável por JavaScript e não deve
    // viajar em requisição que não seja de sessão.
    it('entrega o refresh em cookie httpOnly restrito a /api/auth', async () => {
      const token = await registerAndGetToken();

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/verify-email',
        payload: { token },
      });

      const cookie = response.cookies.find((item) => item.name === 'refresh_token');
      expect(cookie).toBeDefined();
      expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/api/auth' });
      expect(response.body).not.toContain(cookie?.value);
    });

    it('guarda o refresh como hash, com família para a rotação', async () => {
      const token = await registerAndGetToken();

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/verify-email',
        payload: { token },
      });
      const cookieValue = response.cookies.find((item) => item.name === 'refresh_token')?.value;

      const stored = await prisma.refreshToken.findFirstOrThrow();
      expect(stored.tokenHash).not.toBe(cookieValue);
      expect(stored.familyId).toEqual(expect.any(String));
      expect(stored.revokedAt).toBeNull();
    });

    it('recusa o mesmo link duas vezes', async () => {
      const token = await registerAndGetToken();
      await app.inject({ method: 'POST', url: '/api/auth/verify-email', payload: { token } });

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/verify-email',
        payload: { token },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_TOKEN');
    });

    it('recusa token inventado', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/verify-email',
        payload: { token: 'nao-e-um-token' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_TOKEN');
    });
  });

  describe('POST /auth/resend-verification', () => {
    function resend(email: string) {
      return app.inject({
        method: 'POST',
        url: '/api/auth/resend-verification',
        payload: { email },
      });
    }

    it('responde 202 com a mesma mensagem para e-mail sem conta', async () => {
      const response = await resend('ninguem@exemplo.com');

      expect(response.statusCode).toBe(202);
      expect(response.json()).toEqual({ message: ACCEPTED_MESSAGE });
      expect(outbox).toHaveLength(0);
    });

    it('não reenvia para conta já confirmada', async () => {
      await register();
      await app.inject({
        method: 'POST',
        url: '/api/auth/verify-email',
        payload: { token: tokenFromLastEmail() },
      });
      outbox.length = 0;

      const response = await resend(NEW_ACCOUNT.email);

      expect(response.statusCode).toBe(202);
      expect(outbox).toHaveLength(0);
    });

    it('manda um link novo e invalida o anterior', async () => {
      await register();
      const firstToken = tokenFromLastEmail();
      outbox.length = 0;

      await resend(NEW_ACCOUNT.email);
      const secondToken = tokenFromLastEmail();

      expect(secondToken).not.toBe(firstToken);

      const withOld = await app.inject({
        method: 'POST',
        url: '/api/auth/verify-email',
        payload: { token: firstToken },
      });
      expect(withOld.statusCode).toBe(400);

      const withNew = await app.inject({
        method: 'POST',
        url: '/api/auth/verify-email',
        payload: { token: secondToken },
      });
      expect(withNew.statusCode).toBe(200);
    });
  });

  it('completa o caminho do cadastro do começo ao fim', async () => {
    const registered = await register();
    expect(registered.statusCode).toBe(202);

    const verified = await app.inject({
      method: 'POST',
      url: '/api/auth/verify-email',
      payload: { token: tokenFromLastEmail() },
    });

    expect(verified.statusCode).toBe(200);
    expect(verified.json().user.emailVerified).toBe(true);
    expect(verified.cookies.some((cookie) => cookie.name === 'refresh_token')).toBe(true);
  });
});

/**
 * O rate limit fica desligado no resto da suíte, senão centenas de requisições do
 * mesmo IP dariam 429 sem relação com o que está sob teste.
 */
describe('limites de tentativa (§10.7)', () => {
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

  it('corta o cadastro depois de 5 tentativas na mesma hora', async () => {
    const attempts = [];
    for (let index = 0; index < 6; index += 1) {
      attempts.push(
        await app.inject({
          method: 'POST',
          url: '/api/auth/register',
          payload: { ...NEW_ACCOUNT, email: `pessoa-${index}@exemplo.com` },
        }),
      );
    }

    expect(attempts.slice(0, 5).map((response) => response.statusCode)).toEqual([
      202, 202, 202, 202, 202,
    ]);

    const blocked = attempts[5];
    expect(blocked?.statusCode).toBe(429);
    expect(blocked?.json().error.code).toBe('RATE_LIMITED');
  });
});
