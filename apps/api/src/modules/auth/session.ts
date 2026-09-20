import { randomUUID } from 'node:crypto';
import type { SessionResponse, SessionUser } from '@chacara/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { env } from '../../config/env.js';
import type { UserModel } from '../../generated/prisma/models.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { REFRESH_COOKIE_NAME, refreshCookieOptions } from '../../plugins/auth.js';
import { generateToken, hashToken } from '../../lib/tokens.js';

/**
 * Emissão e encerramento de sessão (§10.1).
 *
 * O access token é JWT de vida curta que o SPA guarda só em memória. O refresh
 * token é valor aleatório guardado como hash, entregue em cookie `httpOnly`
 * restrito a `/api/auth` — nem JavaScript o lê, nem ele viaja em requisição de
 * outra rota.
 *
 * `familyId` agrupa as rotações de uma mesma sessão. A detecção de reuso, que
 * revoga a família inteira, mora no fluxo de refresh.
 */

export function toSessionUser(user: UserModel): SessionUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    emailVerified: user.emailVerifiedAt !== null,
  };
}

export type IssueSessionInput = {
  app: FastifyInstance;
  reply: FastifyReply;
  user: UserModel;
  /** Continua uma sessão existente ao rotacionar; ausente começa uma nova. */
  familyId?: string;
  now?: Date;
};

export async function issueSession({
  app,
  reply,
  user,
  familyId,
  now = new Date(),
}: IssueSessionInput): Promise<SessionResponse> {
  const refreshToken = generateToken();

  await app.prisma.refreshToken.create({
    data: {
      userId: user.id,
      familyId: familyId ?? randomUUID(),
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(now.getTime() + env.REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  reply.setCookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions);

  // §10.1: claims `sub` e `role`; o `iat` e o `exp` são do @fastify/jwt.
  const accessToken = app.jwt.sign({ sub: user.id, role: user.role });

  return { accessToken, user: toSessionUser(user) };
}

/** Revoga a família inteira da sessão e limpa o cookie. */
export async function revokeSessionFamily(
  prisma: PrismaClient,
  familyId: string,
  now = new Date(),
): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: now },
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(REFRESH_COOKIE_NAME, { path: refreshCookieOptions.path });
}
