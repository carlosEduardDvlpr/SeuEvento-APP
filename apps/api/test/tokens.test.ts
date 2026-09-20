import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../src/lib/errors.js';
import {
  TOKEN_TTL_MS,
  consumeAuthToken,
  generateToken,
  hashToken,
  issueAuthToken,
} from '../src/lib/tokens.js';
import { prisma, truncateAll } from './helpers/db.js';
import { createUser } from './helpers/factories.js';

describe('geração de token', () => {
  it('produz valor novo a cada chamada', () => {
    const tokens = new Set(Array.from({ length: 50 }, generateToken));

    expect(tokens.size).toBe(50);
  });

  it('cabe numa URL sem escape', () => {
    expect(generateToken()).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('tem 32 bytes de entropia', () => {
    // 32 bytes em base64url dão 43 caracteres, sem preenchimento.
    expect(generateToken()).toHaveLength(43);
  });
});

describe('hashToken', () => {
  // §10.1: o banco guarda só o hash. Vazamento do banco não permite confirmar
  // conta nem trocar senha de ninguém.
  it('nunca devolve o token em claro', () => {
    const token = generateToken();

    expect(hashToken(token)).not.toBe(token);
    expect(hashToken(token)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('é determinístico, para a consulta pelo hash funcionar', () => {
    const token = generateToken();

    expect(hashToken(token)).toBe(hashToken(token));
  });
});

describe('validade por tipo', () => {
  it('usa 24 h na confirmação de e-mail (§10.2)', () => {
    expect(TOKEN_TTL_MS.EMAIL_VERIFY).toBe(24 * 60 * 60 * 1000);
  });

  it('usa 1 h na redefinição de senha (§10.5)', () => {
    expect(TOKEN_TTL_MS.PASSWORD_RESET).toBe(60 * 60 * 1000);
  });
});

describe('ciclo de vida do token', () => {
  let userId: string;

  beforeEach(async () => {
    await truncateAll();
    const user = await createUser();
    userId = user.id;
  });

  it('grava apenas o hash no banco', async () => {
    const token = await issueAuthToken(prisma, { userId, type: 'EMAIL_VERIFY' });

    const stored = await prisma.authToken.findFirstOrThrow({ where: { userId } });
    expect(stored.tokenHash).toBe(hashToken(token));
    expect(stored.tokenHash).not.toBe(token);
    expect(stored.usedAt).toBeNull();
  });

  it('aceita o token e devolve de quem ele é', async () => {
    const token = await issueAuthToken(prisma, { userId, type: 'EMAIL_VERIFY' });

    await expect(consumeAuthToken(prisma, { token, type: 'EMAIL_VERIFY' })).resolves.toEqual({
      userId,
    });
  });

  it('marca o token como usado', async () => {
    const token = await issueAuthToken(prisma, { userId, type: 'EMAIL_VERIFY' });
    await consumeAuthToken(prisma, { token, type: 'EMAIL_VERIFY' });

    const stored = await prisma.authToken.findFirstOrThrow({ where: { userId } });
    expect(stored.usedAt).not.toBeNull();
  });

  it('recusa o mesmo token duas vezes', async () => {
    const token = await issueAuthToken(prisma, { userId, type: 'EMAIL_VERIFY' });
    await consumeAuthToken(prisma, { token, type: 'EMAIL_VERIFY' });

    const error = await consumeAuthToken(prisma, { token, type: 'EMAIL_VERIFY' }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: 'INVALID_TOKEN', status: 400 });
  });

  it('recusa token expirado', async () => {
    const issuedAt = new Date('2026-09-01T12:00:00.000Z');
    const token = await issueAuthToken(prisma, { userId, type: 'EMAIL_VERIFY', now: issuedAt });

    const justAfterExpiry = new Date(issuedAt.getTime() + TOKEN_TTL_MS.EMAIL_VERIFY + 1000);
    const error = await consumeAuthToken(prisma, {
      token,
      type: 'EMAIL_VERIFY',
      now: justAfterExpiry,
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: 'INVALID_TOKEN' });
  });

  it('aceita token no último instante de validade', async () => {
    const issuedAt = new Date('2026-09-01T12:00:00.000Z');
    const token = await issueAuthToken(prisma, { userId, type: 'PASSWORD_RESET', now: issuedAt });

    const justBeforeExpiry = new Date(issuedAt.getTime() + TOKEN_TTL_MS.PASSWORD_RESET - 1000);
    await expect(
      consumeAuthToken(prisma, { token, type: 'PASSWORD_RESET', now: justBeforeExpiry }),
    ).resolves.toEqual({ userId });
  });

  // Token de confirmação não pode servir para trocar senha.
  it('recusa token do tipo errado', async () => {
    const token = await issueAuthToken(prisma, { userId, type: 'EMAIL_VERIFY' });

    const error = await consumeAuthToken(prisma, { token, type: 'PASSWORD_RESET' }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toMatchObject({ code: 'INVALID_TOKEN' });
  });

  it('recusa token que nunca existiu', async () => {
    const error = await consumeAuthToken(prisma, {
      token: generateToken(),
      type: 'EMAIL_VERIFY',
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: 'INVALID_TOKEN' });
  });

  // Mensagem igual para inexistente, expirado e usado: distinguir contaria a um
  // atacante que o token existe.
  it('dá a mesma mensagem para todos os motivos de recusa', async () => {
    const used = await issueAuthToken(prisma, { userId, type: 'EMAIL_VERIFY' });
    await consumeAuthToken(prisma, { token: used, type: 'EMAIL_VERIFY' });

    const messages = await Promise.all(
      [used, generateToken()].map((token) =>
        consumeAuthToken(prisma, { token, type: 'EMAIL_VERIFY' }).catch(
          (error: unknown) => (error as AppError).message,
        ),
      ),
    );

    expect(new Set(messages).size).toBe(1);
  });

  describe('reenvio', () => {
    // Depois de pedir um link novo, só o mais novo vale: o pedido antigo não pode
    // continuar aberto na caixa de entrada.
    it('invalida o token anterior do mesmo tipo', async () => {
      const first = await issueAuthToken(prisma, { userId, type: 'PASSWORD_RESET' });
      const second = await issueAuthToken(prisma, { userId, type: 'PASSWORD_RESET' });

      const error = await consumeAuthToken(prisma, { token: first, type: 'PASSWORD_RESET' }).catch(
        (caught: unknown) => caught,
      );
      expect(error).toMatchObject({ code: 'INVALID_TOKEN' });

      await expect(
        consumeAuthToken(prisma, { token: second, type: 'PASSWORD_RESET' }),
      ).resolves.toEqual({ userId });
    });

    it('não mexe em token de outro tipo', async () => {
      const verify = await issueAuthToken(prisma, { userId, type: 'EMAIL_VERIFY' });
      await issueAuthToken(prisma, { userId, type: 'PASSWORD_RESET' });

      await expect(
        consumeAuthToken(prisma, { token: verify, type: 'EMAIL_VERIFY' }),
      ).resolves.toEqual({ userId });
    });

    it('não mexe em token de outro usuário', async () => {
      const other = await createUser();
      const otherToken = await issueAuthToken(prisma, {
        userId: other.id,
        type: 'EMAIL_VERIFY',
      });
      await issueAuthToken(prisma, { userId, type: 'EMAIL_VERIFY' });

      await expect(
        consumeAuthToken(prisma, { token: otherToken, type: 'EMAIL_VERIFY' }),
      ).resolves.toEqual({ userId: other.id });
    });
  });

  // O uso único vem de um UPDATE com a guarda no WHERE, então a corrida é
  // resolvida pelo banco, não pela aplicação.
  it('deixa apenas uma de várias tentativas simultâneas passar', async () => {
    const token = await issueAuthToken(prisma, { userId, type: 'PASSWORD_RESET' });

    const attempts = await Promise.allSettled(
      Array.from({ length: 5 }, () => consumeAuthToken(prisma, { token, type: 'PASSWORD_RESET' })),
    );

    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
  });
});
