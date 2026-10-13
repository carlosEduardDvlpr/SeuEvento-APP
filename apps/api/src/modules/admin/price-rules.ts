import {
  createPriceRuleBodySchema,
  idParamsSchema,
  priceRuleSchema,
  priceSimulationSchema,
  simulatePriceQuerySchema,
  updatePriceRuleBodySchema,
} from '@chacara/shared';
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  createPriceRule,
  deletePriceRule,
  listPriceRules,
  simulatePrices,
  updatePriceRule,
} from '../pricing/rules.js';

/** CRUD de regras de preço e o simulador de período (§11.2, §13). */
export const adminPriceRuleRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/price-rules', { schema: { response: { 200: z.array(priceRuleSchema) } } }, async () =>
    listPriceRules(app.prisma),
  );

  /*
   * Antes de `/price-rules/:id` para deixar explícito que "simulate" não é um id.
   * A árvore de rotas do Fastify já daria precedência à estática, mas quem lê o
   * arquivo não deveria precisar saber disso.
   */
  app.get(
    '/price-rules/simulate',
    {
      schema: {
        querystring: simulatePriceQuerySchema,
        response: { 200: priceSimulationSchema },
      },
    },
    async (request) => simulatePrices(app.prisma, request.query),
  );

  app.post(
    '/price-rules',
    { schema: { body: createPriceRuleBodySchema, response: { 201: priceRuleSchema } } },
    async (request, reply) => {
      const rule = await createPriceRule(app.prisma, request.body);
      return reply.status(201).send(rule);
    },
  );

  app.patch(
    '/price-rules/:id',
    {
      schema: {
        params: idParamsSchema,
        body: updatePriceRuleBodySchema,
        response: { 200: priceRuleSchema },
      },
    },
    async (request) => updatePriceRule(app.prisma, request.params.id, request.body),
  );

  // Regra não é referenciada por reserva (o snapshot guarda o nome), então some.
  app.delete(
    '/price-rules/:id',
    { schema: { params: idParamsSchema, response: { 204: z.null() } } },
    async (request, reply) => {
      await deletePriceRule(app.prisma, request.params.id);
      return reply.status(204).send(null);
    },
  );
};
