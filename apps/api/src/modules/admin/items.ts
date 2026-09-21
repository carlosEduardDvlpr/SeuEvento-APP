import {
  adminItemSchema,
  createItemBodySchema,
  deleteResultSchema,
  idParamsSchema,
  itemsQuerySchema,
  paginatedSchema,
  paginationSchema,
  updateItemBodySchema,
} from '@chacara/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  createItem,
  deleteItem,
  getAdminItem,
  listAdminItems,
  updateItem,
} from '../items/service.js';

const adminItemsQuerySchema = itemsQuerySchema.extend(paginationSchema.shape);

/** CRUD de itens do pegue e monte (§11.2). */
export const adminItemRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/items',
    {
      schema: {
        querystring: adminItemsQuerySchema,
        response: { 200: paginatedSchema(adminItemSchema) },
      },
    },
    async (request) => listAdminItems(app.prisma, request.query),
  );

  app.get(
    '/items/:id',
    { schema: { params: idParamsSchema, response: { 200: adminItemSchema } } },
    async (request) => getAdminItem(app.prisma, request.params.id),
  );

  app.post(
    '/items',
    { schema: { body: createItemBodySchema, response: { 201: adminItemSchema } } },
    async (request, reply) => {
      const item = await createItem(app.prisma, request.body);
      return reply.status(201).send(item);
    },
  );

  app.patch(
    '/items/:id',
    {
      schema: {
        params: idParamsSchema,
        body: updateItemBodySchema,
        response: { 200: adminItemSchema },
      },
    },
    async (request) => updateItem(app.prisma, request.params.id, request.body),
  );

  // Item já usado em reserva ou combo é desativado, não apagado (§11.2).
  app.delete(
    '/items/:id',
    { schema: { params: idParamsSchema, response: { 200: deleteResultSchema } } },
    async (request) => deleteItem(app.prisma, request.params.id),
  );
};
