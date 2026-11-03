import { availabilityQuerySchema, availabilitySchema } from '@chacara/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { getDecorationAvailability } from './decoration.js';
import { getAvailability } from './service.js';

/**
 * `GET /availability` (§11.2, §11.3).
 *
 * Pública e anônima. Nunca inclui nome, e-mail ou qualquer detalhe de quem
 * reservou: o visitante só precisa saber se o dia está livre.
 */
export const availabilityRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/availability',
    {
      schema: {
        querystring: availabilityQuerySchema,
        response: { 200: availabilitySchema },
      },
    },
    async (request, reply) => {
      /*
       * Cache curto (§11.3). Trinta segundos tiram a maior parte da carga de um
       * calendário sendo navegado, e é pouco o bastante para a data que acabou
       * de ser reservada aparecer como ocupada quase imediatamente — e, de todo
       * modo, quem decide no fim é a constraint da §8.1 na hora de reservar.
       */
      reply.header('Cache-Control', 'public, max-age=30');

      // Com `itemId`, a agenda é a de uma decoração: o estoque dela entra na conta.
      const { itemId, ...query } = request.query;

      return itemId === undefined
        ? getAvailability(app.prisma, query)
        : getDecorationAvailability(app.prisma, { ...query, itemId });
    },
  );
};
