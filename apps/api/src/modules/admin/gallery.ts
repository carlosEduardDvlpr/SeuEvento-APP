import {
  adminGalleryImageSchema,
  createGalleryImageBodySchema,
  idParamsSchema,
  reorderGalleryBodySchema,
  updateGalleryImageBodySchema,
} from '@chacara/shared';
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  createGalleryImage,
  deleteGalleryImage,
  listAdminGallery,
  reorderGallery,
  updateGalleryImage,
} from '../gallery/service.js';

/** CRUD e reordenação da galeria (§11.2, §13). */
export const adminGalleryRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/gallery',
    { schema: { response: { 200: z.array(adminGalleryImageSchema) } } },
    async () => listAdminGallery(app.prisma),
  );

  /*
   * Declarada antes de `/gallery/:id` para o `:id` não capturar "order". O Fastify
   * usa árvore de rotas e daria precedência à estática de qualquer forma, mas a
   * ordem explícita evita a dúvida de quem lê.
   */
  app.patch(
    '/gallery/order',
    {
      schema: {
        body: reorderGalleryBodySchema,
        response: { 200: z.array(adminGalleryImageSchema) },
      },
    },
    async (request) => reorderGallery(app.prisma, request.body),
  );

  app.post(
    '/gallery',
    { schema: { body: createGalleryImageBodySchema, response: { 201: adminGalleryImageSchema } } },
    async (request, reply) => {
      const image = await createGalleryImage(app.prisma, request.body);
      return reply.status(201).send(image);
    },
  );

  app.patch(
    '/gallery/:id',
    {
      schema: {
        params: idParamsSchema,
        body: updateGalleryImageBodySchema,
        response: { 200: adminGalleryImageSchema },
      },
    },
    async (request) => updateGalleryImage(app.prisma, request.params.id, request.body),
  );

  app.delete(
    '/gallery/:id',
    { schema: { params: idParamsSchema, response: { 204: z.null() } } },
    async (request, reply) => {
      await deleteGalleryImage(app.prisma, request.params.id);
      return reply.status(204).send(null);
    },
  );
};
