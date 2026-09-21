import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GoogleIdentity } from '../src/modules/auth/google.js';

/**
 * O verificador do Google é substituído: validar um `id_token` de verdade exigiria
 * rede e uma credencial. O que está sob teste aqui é o que a API faz **depois** de
 * confiar na identidade — e é onde mora o risco de sequestro de conta.
 *
 * A validação do token em si (audience, assinatura, `email_verified`) vive em
 * `google.ts` e é exercitada pelo teste da rota desligada.
 */
const { googleMock } = vi.hoisted(() => ({
  googleMock: { verify: null as null | ((idToken: string) => Promise<GoogleIdentity>) },
}));

vi.mock('../src/modules/auth/google.js', () => ({
  verifyGoogleIdToken: (idToken: string) => {
    if (!googleMock.verify) throw new Error('Verificador do Google não configurado no teste.');
    return googleMock.verify(idToken);
  },
}));

vi.mock('../src/lib/mailer.js', () => ({
  sendMail: async () => {},
  resetMailerForTests: () => {},
}));

const { buildApp } = await import('../src/app.js');
const { hashPassword } = await import('../src/lib/password.js');
const { prisma, truncateAll } = await import('./helpers/db.js');

const GOOGLE_ID = 'google-sub-1234567890';
const EMAIL = 'ana@exemplo.com';
const PASSWORD = 'senha-antiga-123';

function respondWith(identity: Partial<GoogleIdentity> = {}) {
  googleMock.verify = async () => ({
    googleId: GOOGLE_ID,
    email: EMAIL,
    name: 'Ana Beatriz',
    ...identity,
  });
}

describe('login com Google (§10.3)', () => {
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
    googleMock.verify = null;
  });

  function signInWithGoogle(idToken = 'credencial-do-google') {
    return app.inject({ method: 'POST', url: '/api/auth/google', payload: { idToken } });
  }

  describe('conta nova', () => {
    it('cria o usuário já confirmado e abre a sessão', async () => {
      respondWith();

      const response = await signInWithGoogle();

      expect(response.statusCode).toBe(200);
      expect(response.json().user).toMatchObject({
        email: EMAIL,
        name: 'Ana Beatriz',
        role: 'CLIENT',
        // O Google já garantiu o e-mail, então não há link de confirmação a enviar.
        emailVerified: true,
      });
      expect(response.cookies.some((cookie) => cookie.name === 'refresh_token')).toBe(true);
    });

    it('guarda o googleId e registra o aceite dos termos', async () => {
      respondWith();

      await signInWithGoogle();

      const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
      expect(user.googleId).toBe(GOOGLE_ID);
      expect(user.termsAcceptedAt).not.toBeNull();
      expect(user.passwordHash).toBeNull();
    });

    it('normaliza o e-mail que vem do Google', async () => {
      respondWith({ email: 'ana@exemplo.com' });
      await signInWithGoogle();

      expect(await prisma.user.findUnique({ where: { email: EMAIL } })).not.toBeNull();
    });
  });

  describe('conta que já usa Google', () => {
    it('entra de novo sem duplicar', async () => {
      respondWith();
      await signInWithGoogle();
      await signInWithGoogle();

      expect(await prisma.user.count()).toBe(1);
    });

    // Procurar pelo `googleId` antes do e-mail é o que faz a conta sobreviver a
    // uma troca de endereço no Google.
    it('reconhece a conta mesmo com o e-mail trocado no Google', async () => {
      respondWith();
      await signInWithGoogle();

      respondWith({ email: 'ana.nova@exemplo.com' });
      const response = await signInWithGoogle();

      expect(response.statusCode).toBe(200);
      expect(await prisma.user.count()).toBe(1);
    });
  });

  describe('vinculação a conta existente pelo e-mail', () => {
    async function createLocalAccount(verified: boolean) {
      return prisma.user.create({
        data: {
          name: 'Ana B.',
          email: EMAIL,
          phone: '11999990000',
          passwordHash: await hashPassword(PASSWORD),
          emailVerifiedAt: verified ? new Date() : null,
          termsAcceptedAt: new Date(),
        },
      });
    }

    it('vincula em vez de criar uma segunda conta', async () => {
      await createLocalAccount(true);
      respondWith();

      const response = await signInWithGoogle();

      expect(response.statusCode).toBe(200);
      expect(await prisma.user.count()).toBe(1);
      const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
      expect(user.googleId).toBe(GOOGLE_ID);
    });

    it('preserva nome e telefone da conta existente', async () => {
      await createLocalAccount(true);
      respondWith();

      await signInWithGoogle();

      const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
      expect(user.name).toBe('Ana B.');
      expect(user.phone).toBe('11999990000');
    });

    it('mantém a senha de conta já confirmada', async () => {
      await createLocalAccount(true);
      respondWith();

      await signInWithGoogle();

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: EMAIL, password: PASSWORD },
      });
      expect(response.statusCode).toBe(200);
    });

    /*
     * O sequestro que esta regra impede:
     *
     * alguém se cadastra com o e-mail de outra pessoa e define uma senha. A conta
     * nasce não confirmada e o impostor não consegue entrar. Quando a dona de
     * verdade entra pelo Google, a conta é confirmada — e a senha do impostor
     * passaria a funcionar.
     */
    it('descarta a senha ao vincular conta que não estava confirmada', async () => {
      await createLocalAccount(false);
      respondWith();

      await signInWithGoogle();

      const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
      expect(user.passwordHash).toBeNull();
      expect(user.emailVerifiedAt).not.toBeNull();
      expect(user.googleId).toBe(GOOGLE_ID);
    });

    it('a senha do impostor deixa de funcionar', async () => {
      await createLocalAccount(false);
      respondWith();

      await signInWithGoogle();

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: EMAIL, password: PASSWORD },
      });
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('INVALID_CREDENTIALS');
    });

    // Conta criada pelo admin (§9.8) não tem senha nem Google: vincular é o
    // caminho natural de quem fechou pelo WhatsApp e depois entra pelo Google.
    it('vincula conta criada pelo admin e registra o aceite dos termos', async () => {
      await prisma.user.create({
        data: { name: 'Ana B. (pelo WhatsApp)', email: EMAIL, phone: '1133334444' },
      });
      respondWith();

      const response = await signInWithGoogle();

      expect(response.statusCode).toBe(200);
      const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
      expect(user.googleId).toBe(GOOGLE_ID);
      expect(user.name).toBe('Ana B. (pelo WhatsApp)');
      expect(user.termsAcceptedAt).not.toBeNull();
    });

    it('não rebaixa o papel de um admin que entra pelo Google', async () => {
      await prisma.user.create({
        data: {
          name: 'Administração',
          email: EMAIL,
          passwordHash: await hashPassword(PASSWORD),
          emailVerifiedAt: new Date(),
          role: 'ADMIN',
        },
      });
      respondWith();

      const response = await signInWithGoogle();

      expect(response.json().user.role).toBe('ADMIN');
    });
  });

  describe('credencial recusada', () => {
    it('repassa a recusa do verificador', async () => {
      const { AppError } = await import('../src/lib/errors.js');
      googleMock.verify = async () => {
        throw new AppError('INVALID_CREDENTIALS', 401, 'Não conseguimos confirmar sua conta.');
      };

      const response = await signInWithGoogle();

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('INVALID_CREDENTIALS');
      expect(await prisma.user.count()).toBe(0);
    });

    it('recusa corpo sem a credencial', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/google',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    });
  });
});
