import { randomUUID } from 'node:crypto';
import type { SessionResponse, SessionUser } from '@chacara/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
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

/** Revoga todas as rotações de uma sessão. */
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

function expiredSession(): AppError {
  return new AppError('UNAUTHORIZED', 401, 'Sua sessão expirou. Entre de novo para continuar.');
}

/**
 * Rotação do refresh token, com detecção de reuso (§10.1).
 *
 * Cada refresh **gasta** o token apresentado e emite outro na mesma família. Se
 * um token já gasto reaparecer, ou ele foi copiado por outra pessoa, ou vazou de
 * algum lugar: nos dois casos a sessão inteira é revogada, e tanto o atacante
 * quanto o dono precisam entrar de novo. É preferível o incômodo a manter viva
 * uma sessão possivelmente comprometida.
 *
 * O "gastar" é um único `UPDATE` com a guarda no `WHERE`, então duas requisições
 * simultâneas não conseguem ambas rotacionar o mesmo token.
 */
export async function rotateRefreshToken(
  prisma: PrismaClient,
  presentedToken: string,
  now = new Date(),
): Promise<{ user: UserModel; familyId: string }> {
  const tokenHash = hashToken(presentedToken);

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  // Token que nunca existiu não tem família para revogar.
  if (!stored) throw expiredSession();

  const claimed = await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
    data: { revokedAt: now },
  });

  if (claimed.count === 0) {
    // Já revogado (reuso) ou vencido. A sessão morre inteira nos dois casos.
    await revokeSessionFamily(prisma, stored.familyId, now);
    throw expiredSession();
  }

  return { user: stored.user, familyId: stored.familyId };
}

const APP_ORIGIN = new URL(env.APP_URL).origin;

/**
 * Barreira de CSRF nas rotas de sessão (§10.7).
 *
 * `SameSite=Strict` no cookie já impede que outro site o envie, então esta é a
 * segunda camada. Requisição sem `Origin` é aceita de propósito: cliente que não
 * é navegador não manda o cabeçalho, e exigi-lo quebraria integração legítima sem
 * fechar um furo que o cookie já fecha.
 */
export function assertTrustedOrigin(request: FastifyRequest): void {
  const origin = request.headers.origin;
  if (!origin) return;

  if (origin !== APP_ORIGIN) {
    throw new AppError('FORBIDDEN', 403, 'Origem da requisição não autorizada.');
  }
}
