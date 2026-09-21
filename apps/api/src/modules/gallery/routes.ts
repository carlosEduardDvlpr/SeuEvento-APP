import { galleryImageSchema, galleryQuerySchema } from '@chacara/shared';
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { listPublicGallery } from './service.js';

/** Galeria pública (§11.2): imagens ativas, ordenadas, filtráveis por seção. */
export const galleryRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/gallery',
    {
      schema: {
        querystring: galleryQuerySchema,
        response: { 200: z.array(galleryImageSchema) },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'public, max-age=60');
      return listPublicGallery(app.prisma, request.query);
    },
  );
};
