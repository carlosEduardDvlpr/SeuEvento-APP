import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { isProduction, isTest } from './config/env.js';
import { healthRoutes } from './modules/health/routes.js';
import { registerAuth } from './plugins/auth.js';
import { registerErrorHandler } from './plugins/errors.js';
import { registerPrisma } from './plugins/prisma.js';
import { registerSecurity } from './plugins/security.js';

/** Destino de log alternativo, para o teste inspecionar o que foi registrado. */
export type LogSink = { write(line: string): void };

export type BuildAppOptions = {
  loggerStream?: LogSink;
};

/**
 * Campos que nunca podem aparecer no log (§10.7).
 *
 * A lista cobre tanto o formato que o Fastify usa (`req.headers`) quanto objetos
 * soltos, porque o vazamento costuma vir de alguém logando um corpo de
 * requisição ou um erro de biblioteca por inteiro.
 */
const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'headers.authorization',
  'headers.cookie',
  'authorization',
  'cookie',
  'password',
  'passwordHash',
  'token',
  'idToken',
  'tokenHash',
  'refreshToken',
];

function logLevel(hasStream: boolean): string {
  if (hasStream) return 'info';
  // Suíte de teste não precisa de ruído; quem quer inspecionar passa um stream.
  if (isTest) return 'silent';
  return isProduction ? 'info' : 'debug';
}

/**
 * Monta a aplicação sem escutar porta, para os testes usarem `app.inject()`
 * sem abrir socket. Quem chama `listen` é o server.ts.
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    // Atrás de proxy (Render, e o proxy do Vite em dev) é isto que faz o rate
    // limit enxergar o IP real em vez do IP do proxy.
    trustProxy: true,
    // §10.7: 100 KB por requisição.
    bodyLimit: 100 * 1024,
    logger: {
      level: logLevel(Boolean(options.loggerStream)),
      redact: { paths: REDACTED_PATHS, censor: '[redigido]' },
      ...(options.loggerStream ? { stream: options.loggerStream } : {}),
    },
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // O handler de erro entra primeiro para valer também para falha de plugin.
  await registerErrorHandler(app);
  await registerPrisma(app);
  await registerSecurity(app);
  await registerAuth(app);

  // §11.1: todas as rotas vivem sob /api.
  await app.register(healthRoutes, { prefix: '/api' });

  return app;
}
