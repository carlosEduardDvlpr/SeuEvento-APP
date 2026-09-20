import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import { env, isProduction } from '../config/env.js';

export type SecurityOptions = {
  /**
   * Desligado na suíte de testes, senão centenas de requisições no mesmo IP
   * começariam a receber 429 sem relação com o que está sob teste. O teste que
   * verifica o próprio limite monta a aplicação com isto ligado.
   */
  rateLimit: boolean;
};

/**
 * Proteções de borda (§10.7).
 *
 * CORS só existe em desenvolvimento: em produção o SPA chama `/api` no próprio
 * domínio, com rewrite na Vercel, então o navegador vê same-origin e não há
 * requisição cross-site para liberar.
 */
export async function registerSecurity(app: FastifyInstance, options: SecurityOptions) {
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
    allowList: () => !options.rateLimit,
    // Sem `errorResponseBuilder`: o plugin levanta um erro com status 429, que o
    // handler global converte em RATE_LIMITED no formato da §11.1.
  });
}
