import { publicVenueSchema } from '@chacara/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { getPublicVenue } from './service.js';

export const venueRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/public/venue',
    {
      // O schema vem do packages/shared, o mesmo que o SPA usa para tipar.
      schema: { response: { 200: publicVenueSchema } },
    },
    async (_request, reply) => {
      // Dado que muda raramente e é igual para todo mundo.
      reply.header('Cache-Control', 'public, max-age=60');
      return getPublicVenue(app.prisma);
    },
  );
};
