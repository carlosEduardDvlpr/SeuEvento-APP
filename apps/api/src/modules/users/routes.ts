import { sessionUserSchema, updateMeBodySchema } from '@chacara/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { AppError } from '../../lib/errors.js';
import { toSessionUser } from '../auth/session.js';

/**
 * Perfil do próprio cliente (§11.2).
 *
 * Toda rota aqui trabalha sobre o `userId` do token, nunca sobre um id vindo da
 * requisição: assim não existe o caminho "editar o perfil de outra pessoa".
 */
export const userRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/me',
    {
      onRequest: app.authenticate,
      schema: { response: { 200: sessionUserSchema } },
    },
    async (request) => {
      const user = await app.prisma.user.findUnique({ where: { id: request.auth?.userId } });

      // Token válido de uma conta que não existe mais (anonimização da §10.8).
      if (!user) {
        throw new AppError(
          'UNAUTHORIZED',
          401,
          'Sua sessão expirou. Entre de novo para continuar.',
        );
      }

      return toSessionUser(user);
    },
  );

  app.patch(
    '/me',
    {
      onRequest: app.authenticate,
      schema: {
        body: updateMeBodySchema,
        response: { 200: sessionUserSchema },
      },
    },
    async (request) => {
      // Só nome e telefone: trocar e-mail muda a identidade da conta e exigiria
      // confirmar o endereço novo; papel nunca é editável pelo próprio usuário.
      const user = await app.prisma.user.update({
        where: { id: request.auth?.userId },
        data: {
          ...(request.body.name === undefined ? {} : { name: request.body.name }),
          ...(request.body.phone === undefined ? {} : { phone: request.body.phone }),
        },
      });

      return toSessionUser(user);
    },
  );
};
