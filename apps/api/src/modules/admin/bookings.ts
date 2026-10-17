import {
  adminBookingSchema,
  adminBookingsPageSchema,
  adminBookingsQuerySchema,
  idParamsSchema,
  updateBookingNotesBodySchema,
  updateBookingStatusBodySchema,
} from '@chacara/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  getAdminBooking,
  listAdminBookings,
  updateAdminBookingNotes,
  updateAdminBookingStatus,
} from './bookings-service.js';

/**
 * Reservas no painel (§11.2).
 *
 * `POST /admin/bookings` — a reserva manual da §9.8 — entra na próxima entrega:
 * confirmar e recusar o que já existe é um conjunto de regras; criar uma reserva
 * em nome de alguém é outro, com cliente novo e cálculo de preço.
 */
export const adminBookingRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/bookings',
    {
      schema: {
        querystring: adminBookingsQuerySchema,
        response: { 200: adminBookingsPageSchema },
      },
    },
    async (request) => listAdminBookings(app.prisma, request.query),
  );

  app.get(
    '/bookings/:id',
    { schema: { params: idParamsSchema, response: { 200: adminBookingSchema } } },
    async (request) => getAdminBooking(app.prisma, request.params.id),
  );

  app.patch(
    '/bookings/:id/status',
    {
      schema: {
        params: idParamsSchema,
        body: updateBookingStatusBodySchema,
        response: { 200: adminBookingSchema },
      },
    },
    async (request) => updateAdminBookingStatus(app.prisma, request.params.id, request.body),
  );

  app.patch(
    '/bookings/:id/notes',
    {
      schema: {
        params: idParamsSchema,
        body: updateBookingNotesBodySchema,
        response: { 200: adminBookingSchema },
      },
    },
    async (request) => updateAdminBookingNotes(app.prisma, request.params.id, request.body),
  );
};
