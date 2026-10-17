import {
  adminBookingSchema,
  adminBookingsPageSchema,
  adminBookingsQuerySchema,
  createAdminBookingBodySchema,
  idParamsSchema,
  updateBookingNotesBodySchema,
  updateBookingStatusBodySchema,
} from '@chacara/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  createManualBooking,
  getAdminBooking,
  listAdminBookings,
  updateAdminBookingNotes,
  updateAdminBookingStatus,
} from './bookings-service.js';

/** Reservas no painel (§11.2), incluindo a reserva manual da §9.8. */
export const adminBookingRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/bookings',
    { schema: { body: createAdminBookingBodySchema, response: { 201: adminBookingSchema } } },
    async (request, reply) => {
      const booking = await createManualBooking(app.prisma, request.body);
      return reply.code(201).send(booking);
    },
  );

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
