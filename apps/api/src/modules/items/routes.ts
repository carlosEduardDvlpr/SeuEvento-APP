import { catalogItemSchema, categorySchema, itemsQuerySchema } from '@chacara/shared';
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { listCategories } from './categories.js';
import { listPublicItems } from './service.js';

/**
 * Vitrine do pegue e monte (§11.2).
 *
 * `/categories` não está na tabela de rotas públicas da §11.2, mas o filtro por
 * categoria precisa dos nomes para montar as abas, e a alternativa seria o SPA
 * deduzir a lista a partir dos itens, perdendo a categoria vazia e a ordem do
 * admin.
 */
export const itemRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/items',
    {
      schema: {
        querystring: itemsQuerySchema,
        response: { 200: z.array(catalogItemSchema) },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'public, max-age=60');
      return listPublicItems(app.prisma, request.query);
    },
  );

  app.get(
    '/categories',
    { schema: { response: { 200: z.array(categorySchema) } } },
    async (_request, reply) => {
      reply.header('Cache-Control', 'public, max-age=60');
      return listCategories(app.prisma);
    },
  );
};
