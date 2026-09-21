import { themeSchema } from '@chacara/shared';
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { listPublicThemes } from './service.js';

/** Vitrine de estilos (§11.2): só os ativos, na ordem que o admin definiu. */
export const themeRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/themes',
    { schema: { response: { 200: z.array(themeSchema) } } },
    async (_request, reply) => {
      // Catálogo muda raramente e é igual para todo mundo.
      reply.header('Cache-Control', 'public, max-age=60');
      return listPublicThemes(app.prisma);
    },
  );
};
