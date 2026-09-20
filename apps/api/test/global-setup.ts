import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';

/**
 * Prepara o banco de teste antes da suíte (§19: banco próprio, migrations
 * aplicadas, nada de mock do Prisma).
 *
 * Aplica o SQL das migrations em ordem em vez de chamar `prisma migrate deploy`
 * por dois motivos: não depende de resolver o binário do Prisma dentro do
 * runner, e roda exatamente o mesmo SQL que a produção rodaria — incluindo a
 * exclusion constraint manual da §8.1, que é o que vários testes verificam.
 */
export default async function setup() {
  const url = new URL(requireEnv('DATABASE_URL'));
  const database = decodeURIComponent(url.pathname.slice(1));

  // O nome do banco não pode ser parametrizado em CREATE DATABASE, então é
  // validado antes de entrar na string.
  if (!/^[a-zA-Z0-9_]+$/.test(database)) {
    throw new Error(`Nome de banco de teste inválido: ${database}`);
  }
  if (!database.endsWith('_test')) {
    throw new Error(
      `DATABASE_URL dos testes deve apontar para um banco terminado em _test (recebido: ${database}). ` +
        'A suíte apaga o schema inteiro e não pode rodar contra o banco de desenvolvimento.',
    );
  }

  await createDatabaseIfMissing(url, database);
  await applyMigrations(url);
}

async function createDatabaseIfMissing(url: URL, database: string) {
  const maintenance = new URL(url);
  maintenance.pathname = '/postgres';

  const admin = new Client({ connectionString: maintenance.toString() });
  await admin.connect();
  try {
    const found = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
    if (found.rowCount === 0) {
      await admin.query(`CREATE DATABASE "${database}"`);
    }
  } finally {
    await admin.end();
  }
}

async function applyMigrations(url: URL) {
  const migrationsDir = path.join(import.meta.dirname, '..', 'prisma', 'migrations');
  const folders = (await readdir(migrationsDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (folders.length === 0) {
    throw new Error('Nenhuma migration encontrada em prisma/migrations.');
  }

  const db = new Client({ connectionString: url.toString() });
  await db.connect();
  try {
    await db.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    for (const folder of folders) {
      const sql = await readFile(path.join(migrationsDir, folder, 'migration.sql'), 'utf8');
      await db.query(sql);
    }
  } finally {
    await db.end();
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ausente nos testes: ${name}`);
  return value;
}
