import { updateVenueSettingsBodySchema, venueSettingsSchema } from '@chacara/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { getVenueSettings, updateVenueSettings } from './settings-service.js';

/**
 * Configurações da chácara (§11.2).
 *
 * `PUT` porque a linha é única e o formulário manda tudo: num `PATCH`, campo
 * ausente ficaria entre "não mexi" e "apague".
 */
export const adminSettingsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/settings', { schema: { response: { 200: venueSettingsSchema } } }, async () =>
    getVenueSettings(app.prisma),
  );

  app.put(
    '/settings',
    { schema: { body: updateVenueSettingsBodySchema, response: { 200: venueSettingsSchema } } },
    async (request) => updateVenueSettings(app.prisma, request.body),
  );
};
