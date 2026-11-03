import { sessionUserSchema, updateMeBodySchema } from '@chacara/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { requireUserId } from '../../plugins/auth.js';
import { clearSessionCookie, sessionUserSelect, toSessionUser } from '../auth/session.js';
import { anonymizeOwnAccount } from './service.js';

/**
 * Perfil do próprio cliente (§11.2).
 *
 * Toda rota aqui trabalha sobre o `userId` do token, nunca sobre um id vindo da
 * requisição: assim não existe o caminho "editar o perfil de outra pessoa" nem
 * "apagar a conta de outra pessoa".
 */
export const userRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/me',
    {
      onRequest: app.authenticate,
      schema: { response: { 200: sessionUserSchema } },
    },
    async (request) => {
      const user = await app.prisma.user.findUnique({
        where: { id: request.auth?.userId },
        select: sessionUserSelect,
      });

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
      // Nome, telefone e endereço de entrega: trocar e-mail muda a identidade da
      // conta e exigiria confirmar o e-mail novo; papel nunca é editável pelo
      // próprio usuário.
      const { name, phone, address } = request.body;

      const user = await app.prisma.user.update({
        where: { id: request.auth?.userId },
        data: {
          ...(name === undefined ? {} : { name }),
          ...(phone === undefined ? {} : { phone }),
          /*
           * O endereço de entrega (§9.12) é gravado como o schema o deixou:
           * aparado, com o complemento vazio virando nulo. `null` apaga, e o
           * `DbNull` é o NULL do SQL, e não um JSON `null` que pareceria um
           * endereço cadastrado.
           */
          ...(address === undefined ? {} : { address: address ?? Prisma.DbNull }),
        },
        select: sessionUserSelect,
      });

      return toSessionUser(user);
    },
  );

  /**
   * Remoção da conta (§10.8).
   *
   * Anonimiza em vez de apagar a linha, porque as reservas ficam. O corpo é
   * vazio de propósito: pedir confirmação por texto digitado é trabalho da
   * interface (§13.4), e um campo aqui só daria a ilusão de proteção — quem
   * chama a API direto não passa por tela nenhuma. O que protege é o token.
   */
  app.delete(
    '/me',
    {
      onRequest: app.authenticate,
      schema: { response: { 204: z.null() } },
    },
    async (request, reply) => {
      await anonymizeOwnAccount(app.prisma, requireUserId(request.auth));

      // A sessão deste aparelho também cai, e o cookie precisa sair do navegador.
      clearSessionCookie(reply);

      return reply.status(204).send(null);
    },
  );
};
