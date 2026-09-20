import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import type { FastifyInstance } from 'fastify';
import { env, isProduction } from '../config/env.js';

/**
 * Infraestrutura da sessão (§10.1).
 *
 * O access token é JWT HS256 de vida curta e fica só em memória no SPA. O
 * refresh token viaja em cookie `httpOnly` restrito a `/api/auth`, então ele não
 * é enviado em nenhuma outra requisição.
 *
 * Os hooks `authenticate` e `requireRole` entram junto com as rotas de login.
 */
export async function registerAuth(app: FastifyInstance) {
  await app.register(cookie);

  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_ACCESS_TTL },
    cookie: { cookieName: 'refresh_token', signed: false },
  });
}

/** Opções do cookie de refresh, num só lugar para login e logout não divergirem. */
export const REFRESH_COOKIE_NAME = 'refresh_token';

export const refreshCookieOptions = {
  httpOnly: true,
  // Em localhost o navegador aceita cookie sem Secure; em produção é obrigatório.
  secure: isProduction,
  sameSite: 'strict' as const,
  path: '/api/auth',
  maxAge: env.REFRESH_TTL_DAYS * 24 * 60 * 60,
};
