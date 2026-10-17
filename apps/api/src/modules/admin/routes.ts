import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { adminBlockedDateRoutes } from './blocked-dates.js';
import { adminBookingRoutes } from './bookings.js';
import { adminCategoryRoutes } from './categories.js';
import { adminComboRoutes } from './combos.js';
import { adminGalleryRoutes } from './gallery.js';
import { adminItemRoutes } from './items.js';
import { adminOverviewRoutes } from './overview.js';
import { adminPriceRuleRoutes } from './price-rules.js';
import { adminThemeRoutes } from './themes.js';

/**
 * Área administrativa (§11.2).
 *
 * A autorização está aqui, em um lugar só: o hook vale para todas as rotas
 * registradas dentro deste plugin, então uma rota nova de admin nasce protegida
 * sem ninguém precisar lembrar de repetir o `onRequest` (§10.6).
 *
 * As rotas reaproveitam os services dos módulos públicos em vez de duplicar
 * regra (§4).
 */
export const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.authenticate);
  app.addHook('onRequest', app.requireRole('ADMIN'));

  await app.register(adminOverviewRoutes);
  await app.register(adminBookingRoutes);
  await app.register(adminBlockedDateRoutes);
  await app.register(adminCategoryRoutes);
  await app.register(adminThemeRoutes);
  await app.register(adminItemRoutes);
  await app.register(adminComboRoutes);
  await app.register(adminPriceRuleRoutes);
  await app.register(adminGalleryRoutes);
};
