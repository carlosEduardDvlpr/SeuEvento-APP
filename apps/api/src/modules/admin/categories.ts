import {
  categorySchema,
  createCategoryBodySchema,
  idParamsSchema,
  updateCategoryBodySchema,
} from '@chacara/shared';
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from '../items/categories.js';

/**
 * CRUD de categorias (§11.2).
 *
 * A autorização fica no plugin pai (`modules/admin/routes.ts`), que aplica
 * `authenticate` e `requireRole('ADMIN')` a tudo sob `/admin`.
 */
export const adminCategoryRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/categories', { schema: { response: { 200: z.array(categorySchema) } } }, async () =>
    listCategories(app.prisma),
  );

  app.post(
    '/categories',
    { schema: { body: createCategoryBodySchema, response: { 201: categorySchema } } },
    async (request, reply) => {
      const category = await createCategory(app.prisma, request.body);
      return reply.status(201).send(category);
    },
  );

  app.patch(
    '/categories/:id',
    {
      schema: {
        params: idParamsSchema,
        body: updateCategoryBodySchema,
        response: { 200: categorySchema },
      },
    },
    async (request) => updateCategory(app.prisma, request.params.id, request.body),
  );

  app.delete(
    '/categories/:id',
    { schema: { params: idParamsSchema, response: { 204: z.null() } } },
    async (request, reply) => {
      await deleteCategory(app.prisma, request.params.id);
      return reply.status(204).send(null);
    },
  );
};
