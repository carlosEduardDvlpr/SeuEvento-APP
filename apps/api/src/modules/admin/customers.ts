import {
  adminCustomerDetailSchema,
  adminCustomerSchema,
  adminCustomersPageSchema,
  adminCustomersQuerySchema,
  createCustomerBodySchema,
  idParamsSchema,
} from '@chacara/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { createAdminCustomer, getAdminCustomer, listAdminCustomers } from './customers-service.js';

/**
 * Clientes no painel (§11.2).
 *
 * Não há rota de edição nem de exclusão: a §13.4 pede lista, contato, histórico e
 * criação sem senha. Quem edita o próprio perfil é o cliente (`PATCH /me`), e
 * apagar cliente apagaria o histórico de reservas junto — a §10.8 trata isso como
 * anonimização, que é outra coisa e vem na Fase 6.
 */
export const adminCustomerRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/customers',
    {
      schema: {
        querystring: adminCustomersQuerySchema,
        response: { 200: adminCustomersPageSchema },
      },
    },
    async (request) => listAdminCustomers(app.prisma, request.query),
  );

  app.get(
    '/customers/:id',
    { schema: { params: idParamsSchema, response: { 200: adminCustomerDetailSchema } } },
    async (request) => getAdminCustomer(app.prisma, request.params.id),
  );

  app.post(
    '/customers',
    { schema: { body: createCustomerBodySchema, response: { 201: adminCustomerSchema } } },
    async (request, reply) => {
      const customer = await createAdminCustomer(app.prisma, request.body);
      return reply.code(201).send(customer);
    },
  );
};
