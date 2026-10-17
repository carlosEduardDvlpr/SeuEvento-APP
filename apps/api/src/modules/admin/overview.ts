import {
  adminCalendarQuerySchema,
  adminCalendarSchema,
  adminDashboardSchema,
} from '@chacara/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { getAdminCalendar, getAdminDashboard } from './overview-service.js';

/**
 * Calendário e visão geral do painel (§11.2, §13.4).
 *
 * Sem `Cache-Control`: a rota pública de disponibilidade pode guardar 30 segundos
 * porque o visitante só vê livre ou ocupado, mas aqui o dono está decidindo o que
 * responder — e um pedido que entrou há dez segundos precisa aparecer.
 */
export const adminOverviewRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/calendar',
    {
      schema: {
        querystring: adminCalendarQuerySchema,
        response: { 200: adminCalendarSchema },
      },
    },
    async (request) => getAdminCalendar(app.prisma, request.query),
  );

  app.get('/dashboard', { schema: { response: { 200: adminDashboardSchema } } }, async () =>
    getAdminDashboard(app.prisma),
  );
};
