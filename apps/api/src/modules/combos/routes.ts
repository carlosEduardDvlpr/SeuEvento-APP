import { comboSchema, combosQuerySchema } from '@chacara/shared';
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { listPublicCombos } from './service.js';

/**
 * Vitrine de combos (§11.2).
 *
 * A economia vem calculada pelo servidor, porque o front não calcula dinheiro
 * (§2.2) — e porque é o mesmo número que o orçamento vai aplicar.
 */
export const comboRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/combos',
    {
      schema: {
        querystring: combosQuerySchema,
        response: { 200: z.array(comboSchema) },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'public, max-age=60');
      return listPublicCombos(app.prisma, request.query);
    },
  );
};
