import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import { env, isProduction, isTest } from '../config/env.js';
import { AppError } from '../lib/errors.js';

/**
 * Proteções de borda (§10.7).
 *
 * CORS só existe em desenvolvimento: em produção o SPA chama `/api` no próprio
 * domínio, com rewrite na Vercel, então o navegador vê same-origin e não há
 * requisição cross-site para liberar.
 */
export async function registerSecurity(app: FastifyInstance) {
  await app.register(helmet, {
    // A API serve JSON, não HTML. A CSP que importa é a do SPA (§20.3).
    contentSecurityPolicy: false,
  });

  if (!isProduction && env.CORS_ORIGIN) {
    await app.register(cors, {
      origin: env.CORS_ORIGIN.split(',').map((origin) => origin.trim()),
      credentials: true,
    });
  }

  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
    // Testes fariam centenas de requisições no mesmo IP e começariam a receber
    // 429 sem relação com o que está sob teste.
    enableDraftSpec: true,
    allowList: () => isTest,
    // O handler de erro global cuida da resposta, para o formato da §11.1
    // valer também aqui.
    errorResponseBuilder: () => {
      throw new AppError(
        'RATE_LIMITED',
        429,
        'Muitas tentativas. Tente de novo em alguns minutos.',
      );
    },
  });
}
