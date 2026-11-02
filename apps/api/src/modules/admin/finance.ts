import {
  adminFinanceQuerySchema,
  adminFinanceSchema,
  idParamsSchema,
  markPaymentBodySchema,
  paymentPlanSchema,
  savePaymentPlanBodySchema,
} from '@chacara/shared';
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  deletePaymentPlan,
  getAdminFinance,
  getPaymentPlan,
  markPayment,
  savePaymentPlan,
} from './finance-service.js';

/**
 * Plano de pagamento das reservas e financeiro do mês (§9.11, §11.2, §13.4).
 *
 * O plano mora embaixo da reserva (`/bookings/:id/payments`) porque só existe
 * dentro dela: é o total dela, dividido no tempo. O recebimento tem rota própria
 * (`/payments/:id`) porque anotar o dia em que o dinheiro entrou mexe numa linha
 * só, e o painel não precisa reenviar o plano inteiro para isso.
 *
 * Sem `Cache-Control`, pelo mesmo motivo do calendário: um recebimento anotado
 * agora precisa aparecer na próxima leitura.
 */
export const adminFinanceRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/bookings/:id/payments',
    { schema: { params: idParamsSchema, response: { 200: paymentPlanSchema } } },
    async (request) => getPaymentPlan(app.prisma, request.params.id),
  );

  app.put(
    '/bookings/:id/payments',
    {
      schema: {
        params: idParamsSchema,
        body: savePaymentPlanBodySchema,
        response: { 200: paymentPlanSchema },
      },
    },
    async (request) => savePaymentPlan(app.prisma, request.params.id, request.body),
  );

  app.delete(
    '/bookings/:id/payments',
    { schema: { params: idParamsSchema, response: { 204: z.null() } } },
    async (request, reply) => {
      await deletePaymentPlan(app.prisma, request.params.id);
      return reply.status(204).send(null);
    },
  );

  app.patch(
    '/payments/:id',
    {
      schema: {
        params: idParamsSchema,
        body: markPaymentBodySchema,
        response: { 200: paymentPlanSchema },
      },
    },
    async (request) => markPayment(app.prisma, request.params.id, request.body.paidOn),
  );

  app.get(
    '/finance',
    {
      schema: {
        querystring: adminFinanceQuerySchema,
        response: { 200: adminFinanceSchema },
      },
    },
    async (request) => getAdminFinance(app.prisma, request.query),
  );
};
