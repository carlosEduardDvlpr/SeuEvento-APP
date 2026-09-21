import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'vitest/config';

// Caminho absoluto: rodando `pnpm test` da raiz, o cwd é o monorepo e um '.env'
// relativo não encontraria nada.
loadEnv({ path: path.join(import.meta.dirname, '.env'), quiet: true });

const DEV_URL = process.env.DATABASE_URL;
if (!DEV_URL) {
  throw new Error('DATABASE_URL ausente. Copie apps/api/.env.example para apps/api/.env.');
}

// §19: integração roda em banco próprio. Deriva `<banco>_test` quando
// DATABASE_URL_TEST não está definida, para nunca cair no banco de trabalho.
const TEST_URL = process.env.DATABASE_URL_TEST ?? DEV_URL.replace(/\/([^/?]+)(\?|$)/, '/$1_test$2');

// O globalSetup roda no processo principal do Vitest, onde `test.env` ainda não
// vale; por isso a variável precisa ser aplicada aqui também.
process.env.DATABASE_URL = TEST_URL;

export default defineConfig({
  test: {
    name: 'api',
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Integração compartilha um Postgres: a limpeza de um arquivo não pode
    // acontecer no meio de outro.
    fileParallelism: false,
    env: { DATABASE_URL: TEST_URL, NODE_ENV: 'test' },
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup.ts'],
  },
});
