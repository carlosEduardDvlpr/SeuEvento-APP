import {
  adminComboSchema,
  createComboBodySchema,
  deleteResultSchema,
  idParamsSchema,
  updateComboBodySchema,
} from '@chacara/shared';
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  createCombo,
  deleteCombo,
  getAdminCombo,
  listAdminCombos,
  updateCombo,
} from '../combos/service.js';

/**
 * CRUD de combos (§11.2).
 *
 * A resposta traz `itemsTotalCents`, `discountCents` e `priceCents`, que é a
 * prévia da economia pedida pela §13 ("soma dos itens R$ X, o cliente paga
 * R$ Y") já pronta, sem o painel recalcular nada.
 */
export const adminComboRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/combos', { schema: { response: { 200: z.array(adminComboSchema) } } }, async () =>
    listAdminCombos(app.prisma),
  );

  app.get(
    '/combos/:id',
    { schema: { params: idParamsSchema, response: { 200: adminComboSchema } } },
    async (request) => getAdminCombo(app.prisma, request.params.id),
  );

  app.post(
    '/combos',
    { schema: { body: createComboBodySchema, response: { 201: adminComboSchema } } },
    async (request, reply) => {
      const combo = await createCombo(app.prisma, request.body);
      return reply.status(201).send(combo);
    },
  );

  app.patch(
    '/combos/:id',
    {
      schema: {
        params: idParamsSchema,
        body: updateComboBodySchema,
        response: { 200: adminComboSchema },
      },
    },
    async (request) => updateCombo(app.prisma, request.params.id, request.body),
  );

  // Combo já aplicado em reserva é desativado, não apagado (§11.2).
  app.delete(
    '/combos/:id',
    { schema: { params: idParamsSchema, response: { 200: deleteResultSchema } } },
    async (request) => deleteCombo(app.prisma, request.params.id),
  );
};
