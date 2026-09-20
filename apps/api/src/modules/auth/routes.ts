import {
  acceptedResponseSchema,
  loginBodySchema,
  registerBodySchema,
  resendVerificationBodySchema,
  sessionResponseSchema,
  verifyEmailBodySchema,
} from '@chacara/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import { hashToken } from '../../lib/tokens.js';
import { REFRESH_COOKIE_NAME } from '../../plugins/auth.js';
import {
  assertTrustedOrigin,
  clearSessionCookie,
  issueSession,
  revokeSessionFamily,
  rotateRefreshToken,
} from './session.js';
import { ACCEPTED_MESSAGE, login, register, resendVerification, verifyEmail } from './service.js';

/**
 * Rotas de cadastro e confirmação (§10.2 e §11.2).
 *
 * Os limites de tentativa vêm da §10.7. `register` é limitado por IP porque o
 * corpo ainda não foi lido no `onRequest`; `resend-verification` é limitado por
 * e-mail, o que exige rodar o limite depois da validação do corpo.
 */
export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/auth/register',
    {
      config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
      schema: {
        body: registerBodySchema,
        response: { 202: acceptedResponseSchema },
      },
    },
    async (request, reply) => {
      await register(app.prisma, request.body);

      // §10.2: 202 com a mesma mensagem existindo ou não o e-mail. O corpo não
      // diz o que aconteceu, e o tempo de resposta também não denuncia, porque
      // os dois caminhos passam por um hash de senha ou por um envio de e-mail.
      return reply.status(202).send({ message: ACCEPTED_MESSAGE });
    },
  );

  app.post(
    '/auth/resend-verification',
    {
      config: {
        rateLimit: {
          max: 3,
          timeWindow: '1 hour',
          // Roda depois da validação para a chave poder ser o e-mail (§10.7).
          hook: 'preHandler',
          keyGenerator: (request) => {
            const body = request.body as { email?: string } | undefined;
            return body?.email ?? request.ip;
          },
        },
      },
      schema: {
        body: resendVerificationBodySchema,
        response: { 202: acceptedResponseSchema },
      },
    },
    async (request, reply) => {
      await resendVerification(app.prisma, request.body.email);

      return reply.status(202).send({ message: ACCEPTED_MESSAGE });
    },
  );

  app.post(
    '/auth/verify-email',
    {
      // POST, e não GET: pré-visualizador de e-mail abre links, e um GET que
      // confirma a conta seria disparado sem a pessoa clicar (§10.2, passo 4).
      config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
      schema: {
        body: verifyEmailBodySchema,
        response: { 200: sessionResponseSchema },
      },
    },
    async (request, reply) => {
      const user = await verifyEmail(app.prisma, request.body.token);

      // Confirmar já abre a sessão: quem clicou no link provou ter a caixa de
      // entrada, então pedir a senha em seguida seria atrito sem ganho.
      return issueSession({ app, reply, user });
    },
  );

  app.post(
    '/auth/login',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
          // Por IP **e** e-mail (§10.7): limitar só por IP deixaria uma rede
          // inteira travada por causa de uma pessoa, e limitar só por e-mail
          // deixaria um atacante varrer vários endereços à vontade.
          hook: 'preHandler',
          keyGenerator: (request) => {
            const body = request.body as { email?: string } | undefined;
            return `${request.ip}:${body?.email ?? ''}`;
          },
        },
      },
      schema: {
        body: loginBodySchema,
        response: { 200: sessionResponseSchema },
      },
    },
    async (request, reply) => {
      const user = await login(app.prisma, request.body);

      return issueSession({ app, reply, user });
    },
  );

  app.post(
    '/auth/refresh',
    {
      schema: { response: { 200: sessionResponseSchema } },
    },
    async (request, reply) => {
      assertTrustedOrigin(request);

      const presented = request.cookies[REFRESH_COOKIE_NAME];
      if (!presented) {
        // Sem cookie não há sessão para renovar. É o caminho normal de quem abre
        // o site pela primeira vez, então não é motivo de log de erro.
        clearSessionCookie(reply);
        throw new AppError(
          'UNAUTHORIZED',
          401,
          'Sua sessão expirou. Entre de novo para continuar.',
        );
      }

      try {
        const { user, familyId } = await rotateRefreshToken(app.prisma, presented);

        return await issueSession({ app, reply, user, familyId });
      } catch (error) {
        clearSessionCookie(reply);
        throw error;
      }
    },
  );

  app.post('/auth/logout', { schema: { response: { 204: z.null() } } }, async (request, reply) => {
    assertTrustedOrigin(request);

    const presented = request.cookies[REFRESH_COOKIE_NAME];
    if (presented) {
      const stored = await app.prisma.refreshToken.findUnique({
        where: { tokenHash: hashToken(presented) },
        select: { familyId: true },
      });

      // Revoga a família inteira, não só o token apresentado: sair significa
      // encerrar a sessão, e ela é a cadeia de rotações.
      if (stored) await revokeSessionFamily(app.prisma, stored.familyId);
    }

    clearSessionCookie(reply);

    // Sair é idempotente: sem cookie, ou com cookie já inválido, o resultado
    // desejado (não estar logado) já é o atual.
    return reply.status(204).send(null);
  });
};
