import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL ausente: o global-setup dos testes deveria tê-la definido.');
}

export const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/**
 * Limpa todas as tabelas entre testes. Descobre a lista no catálogo em vez de
 * manter uma lista fixa, para não esquecer tabela nova ao evoluir o schema.
 */
export async function truncateAll() {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;

  if (rows.length === 0) return;

  const tables = rows.map((row) => `"${row.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
}
