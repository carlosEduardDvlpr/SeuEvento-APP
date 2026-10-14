import { bookingSchema, createBookingBodySchema } from '@chacara/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { AppError } from '../../lib/errors.js';
import { createBooking } from './service.js';

/**
 * Reservas do cliente (§11.2).
 *
 * Sempre sobre o `userId` do token: não existe o caminho "criar reserva no nome
 * de outra pessoa". A listagem e o cancelamento entram na T20.
 */
export const bookingRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/bookings',
    {
      onRequest: app.authenticate,
      schema: { body: createBookingBodySchema, response: { 201: bookingSchema } },
    },
    async (request, reply) => {
      const userId = request.auth?.userId;

      if (!userId) {
        throw new AppError(
          'UNAUTHORIZED',
          401,
          'Sua sessão expirou. Entre de novo para continuar.',
        );
      }

      const booking = await createBooking({ prisma: app.prisma, userId, body: request.body });

      return reply.status(201).send(booking);
    },
  );
};
