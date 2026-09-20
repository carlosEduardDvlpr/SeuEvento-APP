import {
  acceptedResponseSchema,
  registerBodySchema,
  resendVerificationBodySchema,
  sessionResponseSchema,
  verifyEmailBodySchema,
} from '@chacara/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { issueSession } from './session.js';
import { ACCEPTED_MESSAGE, register, resendVerification, verifyEmail } from './service.js';

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
};
