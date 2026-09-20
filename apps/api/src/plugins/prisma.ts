import { PrismaPg } from '@prisma/adapter-pg';
import type { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

/**
 * Um único PrismaClient por instância da aplicação, fechado no `onClose`.
 *
 * Fica decorado no app (e não importado como singleton global) para os testes
 * poderem subir e derrubar aplicações sem deixar conexão pendurada.
 */
export async function registerPrisma(app: FastifyInstance) {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  });

  app.decorate('prisma', prisma);
  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
}
