import {
  catalogItemSchema,
  categorySchema,
  itemsAvailabilityQuerySchema,
  itemsAvailabilitySchema,
  itemsQuerySchema,
} from '@chacara/shared';
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { listCategories } from './categories.js';
import { listPublicItems } from './service.js';
import { getItemsAvailability } from './stock.js';

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

  /*
   * Unidades livres de cada decoração no período (novembro de 2026), para o
   * passo de decoração do pedido mostrar a que já saiu para outra festa.
   *
   * Pública como a agenda: diz quantas unidades sobram, nunca quem levou. Não
   * existe `/items/:id` público; se um dia existir, a rota estática continua
   * vencendo a com parâmetro no roteador do Fastify, e "availability" não vira
   * um id.
   */
  app.get(
    '/items/availability',
    {
      schema: {
        querystring: itemsAvailabilityQuerySchema,
        response: { 200: itemsAvailabilitySchema },
      },
    },
    async (request, reply) => {
      // O mesmo cache curto da agenda (§11.3): o estoque muda a cada pedido.
      reply.header('Cache-Control', 'public, max-age=30');
      return getItemsAvailability(app.prisma, request.query);
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
