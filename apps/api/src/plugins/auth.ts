import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import type { Role } from '@chacara/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { env, isProduction } from '../config/env.js';
import { AppError } from '../lib/errors.js';

/**
 * Infraestrutura da sessão (§10.1) e autorização (§10.6).
 *
 * O access token é JWT HS256 de vida curta e fica só em memória no SPA. O refresh
 * token viaja em cookie `httpOnly` restrito a `/api/auth`, então ele não é enviado
 * em nenhuma outra requisição.
 */

/** Quem está falando com a API, resolvido pelo `authenticate`. */
export type RequestAuth = {
  userId: string;
  /** Papel que veio no token. `requireRole` confere no banco antes de liberar. */
  role: Role;
};

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
    requireRole: (role: Role) => (request: FastifyRequest) => Promise<void>;
  }

  interface FastifyRequest {
    auth?: RequestAuth;
  }
}

export const REFRESH_COOKIE_NAME = 'refresh_token';

/** Opções do cookie de refresh, num só lugar para login e logout não divergirem. */
export const refreshCookieOptions = {
  httpOnly: true,
  // Em localhost o navegador aceita cookie sem Secure; em produção é obrigatório.
  secure: isProduction,
  sameSite: 'strict' as const,
  path: '/api/auth',
  maxAge: env.REFRESH_TTL_DAYS * 24 * 60 * 60,
};

export async function registerAuth(app: FastifyInstance) {
  await app.register(cookie);

  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_ACCESS_TTL },
  });

  /**
   * Confere o access token e diz quem é o requisitante.
   *
   * Aqui basta o claim: o token dura 15 minutos, e ir ao banco em toda requisição
   * autenticada custaria uma consulta a mais por chamada sem ganho real.
   */
  app.decorate('authenticate', async (request: FastifyRequest) => {
    try {
      const payload = await request.jwtVerify<{ sub: string; role: Role }>();
      request.auth = { userId: payload.sub, role: payload.role };
    } catch {
      // Token ausente, malformado, expirado ou com assinatura inválida: para quem
      // chama é tudo a mesma coisa.
      throw new AppError('UNAUTHORIZED', 401, 'Sua sessão expirou. Entre de novo para continuar.');
    }
  });

  /**
   * Exige um papel, conferindo no **banco** (§10.6).
   *
   * O claim não serve aqui: se um admin for rebaixado, o token dele continuaria
   * valendo até expirar. Como a área administrativa tem poder sobre reservas e
   * preços, a consulta extra se paga.
   */
  app.decorate('requireRole', (role: Role) => async (request: FastifyRequest) => {
    if (!request.auth) {
      throw new AppError('UNAUTHORIZED', 401, 'Sua sessão expirou. Entre de novo para continuar.');
    }

    const user = await app.prisma.user.findUnique({
      where: { id: request.auth.userId },
      select: { role: true },
    });

    if (!user || user.role !== role) {
      throw new AppError('FORBIDDEN', 403, 'Você não tem acesso a esta área.');
    }

    // O papel do banco vence o do token pelo resto da requisição.
    request.auth.role = user.role;
  });
}
