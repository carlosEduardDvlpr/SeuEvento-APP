import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../src/config/env.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { logger } from '../src/lib/logger.js';
import { runSeed } from '../src/seed/index.js';

/**
 * Entrada do `prisma db seed`.
 *
 * A lógica vive em `src/seed/`, para os testes chamarem `runSeed()` contra o
 * banco de teste sem precisar abrir um processo.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

const admin =
  env.ADMIN_EMAIL && env.ADMIN_PASSWORD
    ? { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD }
    : undefined;

try {
  await runSeed({
    prisma,
    logger,
    // §8.2: catálogo de demonstração só quando pedido explicitamente.
    demo: process.env.SEED_DEMO === 'true',
    admin,
  });
} catch (error) {
  logger.error({ err: error }, 'Seed falhou');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
