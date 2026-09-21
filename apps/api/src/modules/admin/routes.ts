import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { adminCategoryRoutes } from './categories.js';
import { adminGalleryRoutes } from './gallery.js';
import { adminItemRoutes } from './items.js';
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

  await app.register(adminCategoryRoutes);
  await app.register(adminThemeRoutes);
  await app.register(adminItemRoutes);
  await app.register(adminGalleryRoutes);
};
