import {
  blockedDateParamsSchema,
  blockedDateSchema,
  blockedDatesQuerySchema,
  createBlockedDateBodySchema,
} from '@chacara/shared';
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { blockDate, listBlockedDates, unblockDate } from '../availability/service.js';

/**
 * Dias indisponíveis definidos pelo dono: manutenção, uso próprio, férias (§11.2).
 *
 * O `:date` é um dia (`YYYY-MM-DD`), não um identificador: `BlockedDate` usa a
 * própria data como chave primária (§8), então não existe id a carregar.
 */
export const adminBlockedDateRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/blocked-dates',
    {
      schema: {
        querystring: blockedDatesQuerySchema,
        response: { 200: z.array(blockedDateSchema) },
      },
    },
    async (request) => listBlockedDates(app.prisma, request.query),
  );

  // Bloquear um dia já bloqueado atualiza o motivo, em vez de recusar.
  app.post(
    '/blocked-dates',
    { schema: { body: createBlockedDateBodySchema, response: { 200: blockedDateSchema } } },
    async (request) => blockDate(app.prisma, request.body),
  );

  app.delete(
    '/blocked-dates/:date',
    { schema: { params: blockedDateParamsSchema, response: { 204: z.null() } } },
    async (request, reply) => {
      await unblockDate(app.prisma, request.params.date);
      return reply.status(204).send(null);
    },
  );
};
