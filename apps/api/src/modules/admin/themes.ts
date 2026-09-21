import {
  adminThemeSchema,
  createThemeBodySchema,
  deleteResultSchema,
  idParamsSchema,
  updateThemeBodySchema,
} from '@chacara/shared';
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { createTheme, deleteTheme, listAdminThemes, updateTheme } from '../themes/service.js';

/** CRUD de estilos de festa (§11.2, §15). */
export const adminThemeRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/themes', { schema: { response: { 200: z.array(adminThemeSchema) } } }, async () =>
    listAdminThemes(app.prisma),
  );

  app.post(
    '/themes',
    { schema: { body: createThemeBodySchema, response: { 201: adminThemeSchema } } },
    async (request, reply) => {
      const theme = await createTheme(app.prisma, request.body);
      return reply.status(201).send(theme);
    },
  );

  app.patch(
    '/themes/:id',
    {
      schema: {
        params: idParamsSchema,
        body: updateThemeBodySchema,
        response: { 200: adminThemeSchema },
      },
    },
    async (request) => updateTheme(app.prisma, request.params.id, request.body),
  );

  // Devolve o que aconteceu: estilo já usado é desativado, não apagado (§11.2).
  app.delete(
    '/themes/:id',
    { schema: { params: idParamsSchema, response: { 200: deleteResultSchema } } },
    async (request) => deleteTheme(app.prisma, request.params.id),
  );
};
