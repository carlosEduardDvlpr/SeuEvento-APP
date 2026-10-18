import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';
import { API_DIR, DATABASE_URL } from './env.js';

/**
 * Banco próprio do E2E, recriado a cada execução (§19).
 *
 * Aplica o SQL das migrations em ordem, em vez de chamar `prisma migrate
 * deploy`, pelo mesmo motivo da suíte de integração: roda exatamente o SQL que a
 * produção rodaria, incluindo a exclusion constraint manual da §8.1 — que é o
 * que sustenta a promessa de zero dupla reserva.
 */

function parseTarget(): { url: URL; database: string } {
  const url = new URL(DATABASE_URL);
  const database = decodeURIComponent(url.pathname.slice(1));

  // Não dá para parametrizar nome de banco em CREATE/DROP DATABASE.
  if (!/^[a-zA-Z0-9_]+$/.test(database)) {
    throw new Error(`Nome de banco inválido para o E2E: ${database}`);
  }

  /*
   * A guarda do sufixo não é cerimônia: a função abaixo derruba o schema
   * inteiro, e um `DATABASE_URL_E2E` apontado por engano para o banco de
   * trabalho apagaria os dados que você usa para olhar o site.
   */
  if (!database.endsWith('_e2e')) {
    throw new Error(
      `O banco do E2E precisa terminar em _e2e (recebido: ${database}). ` +
        'A preparação apaga o schema inteiro e não pode rodar contra desenvolvimento ou teste.',
    );
  }

  return { url, database };
}

export async function prepareDatabase(): Promise<void> {
  const { url, database } = parseTarget();

  await createIfMissing(url, database);
  await applyMigrations(url);
}

async function createIfMissing(url: URL, database: string): Promise<void> {
  const maintenance = new URL(url);
  maintenance.pathname = '/postgres';

  const admin = new Client({ connectionString: maintenance.toString() });
  await admin.connect();
  try {
    const found = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
    if (found.rowCount === 0) await admin.query(`CREATE DATABASE "${database}"`);
  } finally {
    await admin.end();
  }
}

async function applyMigrations(url: URL): Promise<void> {
  const migrationsDir = path.join(API_DIR, 'prisma', 'migrations');
  const folders = (await readdir(migrationsDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (folders.length === 0) throw new Error('Nenhuma migration encontrada em prisma/migrations.');

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

/** Roda uma consulta no banco do E2E e devolve as linhas. */
export async function query<T extends Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();
  try {
    const result = await db.query<T>(sql, params);
    return result.rows;
  } finally {
    await db.end();
  }
}
