import {
  bookingSchema,
  cancelBookingBodySchema,
  createBookingBodySchema,
  idParamsSchema,
} from '@chacara/shared';
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { AppError } from '../../lib/errors.js';
import { cancelMyBooking, createBooking, getMyBooking, listMyBookings } from './service.js';

/**
 * Reservas do cliente (§11.2).
 *
 * Toda rota aqui trabalha sobre o `userId` do token, nunca sobre um id vindo da
 * requisição: não existe o caminho "ver" nem "cancelar a reserva de outra
 * pessoa". Reserva de outro dono responde 404, não 403 (§10.6).
 */

/** O `authenticate` já barrou quem não tem token; isto é só a garantia de tipo. */
function requireUserId(auth: { userId: string } | undefined): string {
  if (!auth?.userId) {
    throw new AppError('UNAUTHORIZED', 401, 'Sua sessão expirou. Entre de novo para continuar.');
  }

  return auth.userId;
}

export const bookingRoutes: FastifyPluginAsyncZod = async (app) => {
  // Autenticação para todo o módulo: rota nova de cliente nasce protegida.
  app.addHook('onRequest', app.authenticate);

  app.post(
    '/bookings',
    { schema: { body: createBookingBodySchema, response: { 201: bookingSchema } } },
    async (request, reply) => {
      const booking = await createBooking({
        prisma: app.prisma,
        userId: requireUserId(request.auth),
        body: request.body,
      });

      return reply.status(201).send(booking);
    },
  );

  /*
   * Declarada antes de `/bookings/:id` para deixar explícito que "me" não é um
   * id. A árvore de rotas do Fastify já daria precedência à estática, mas quem lê
   * o arquivo não deveria precisar saber disso.
   */
  app.get(
    '/bookings/me',
    { schema: { response: { 200: z.array(bookingSchema) } } },
    async (request) => listMyBookings(app.prisma, requireUserId(request.auth)),
  );

  app.get(
    '/bookings/:id',
    { schema: { params: idParamsSchema, response: { 200: bookingSchema } } },
    async (request) => getMyBooking(app.prisma, requireUserId(request.auth), request.params.id),
  );

  /*
   * `PATCH` e não `DELETE`: cancelar não apaga a reserva, muda o status dela
   * (§9.2). O histórico continua no banco, e é o que permite o dono entender o
   * ano.
   */
  app.patch(
    '/bookings/:id/cancel',
    {
      schema: {
        params: idParamsSchema,
        body: cancelBookingBodySchema,
        response: { 200: bookingSchema },
      },
    },
    async (request) =>
      cancelMyBooking({
        prisma: app.prisma,
        userId: requireUserId(request.auth),
        id: request.params.id,
        reason: request.body.reason,
      }),
  );
};
