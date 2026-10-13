import { quoteRequestSchema, quoteSchema } from '@chacara/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { quoteFromDatabase } from './service.js';

/**
 * `POST /pricing/quote` (§11.2, §11.3).
 *
 * Pública e sem efeito: calcula o valor e confere disponibilidade e estoque sem
 * reservar nada. É POST porque o pedido tem corpo (a lista de itens não cabe
 * confortavelmente em query string), não porque muda estado.
 *
 * Nunca é cacheada: o resultado depende do que está reservado neste instante.
 */
export const pricingRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/pricing/quote',
    {
      schema: {
        body: quoteRequestSchema,
        response: { 200: quoteSchema },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      return quoteFromDatabase(app.prisma, request.body);
    },
  );
};
