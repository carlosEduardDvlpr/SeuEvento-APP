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
      /*
       * `no-cache`, e não o `max-age` do catálogo: a galeria é o que o dono
       * troca pelo painel para ver no site em seguida, e com cache no navegador a
       * foto antiga voltava por até um minuto, mesmo recarregando a página. Na
       * mesma visita, quem evita repetir a requisição é o cache do Query no SPA.
       */
      reply.header('Cache-Control', 'no-cache');
      return listPublicGallery(app.prisma, request.query);
    },
  );
};
