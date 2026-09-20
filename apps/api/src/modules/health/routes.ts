import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';

/**
 * Health check (§20.2). Não basta responder 200: confere a conexão com o banco,
 * porque uma API de pé com banco fora não serve para nada.
 */
export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/health',
    {
      // Monitoramento bate aqui de minuto em minuto; não faz sentido limitar.
      config: { rateLimit: false },
      schema: {
        response: {
          200: z.object({
            status: z.literal('ok'),
            database: z.literal('up'),
          }),
        },
      },
    },
    async (request) => {
      try {
        await app.prisma.$queryRaw`SELECT 1`;
      } catch (error) {
        request.log.error({ err: error }, 'Health check não conseguiu falar com o banco');
        // A lista de códigos da §11.1 é fechada e não tem um para indisponibilidade,
        // então reaproveita INTERNAL com 503, que é o status que o monitoramento lê.
        throw new AppError('INTERNAL', 503, 'Banco de dados indisponível.');
      }

      return { status: 'ok', database: 'up' } as const;
    },
  );
};
