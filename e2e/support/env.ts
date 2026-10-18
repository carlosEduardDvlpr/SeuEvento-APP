import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

/**
 * Endereços, banco e dados fixos do E2E (§19).
 *
 * Um módulo só, importado pela configuração, pela preparação e pelo teste: assim
 * porta, usuário e senha não existem em duas versões que podem divergir.
 */

export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const API_DIR = path.join(REPO_ROOT, 'apps', 'api');
export const WEB_DIR = path.join(REPO_ROOT, 'apps', 'web');

/*
 * Lê o `.env` da API para aproveitar a conexão do Postgres e o `JWT_SECRET` do
 * ambiente local. Nada de segredo é impresso nem chega ao teste: o que sai daqui
 * é a URL do banco **de E2E** e as credenciais que o próprio E2E cria.
 */
loadDotenv({ path: path.join(API_DIR, '.env'), quiet: true });

/**
 * Portas próprias, deslocadas das de desenvolvimento.
 *
 * Sem isso, rodar o E2E com `pnpm dev` aberto faria o Playwright achar o
 * servidor já de pé e testar contra o **banco de trabalho** — que é onde estão os
 * dados que você usa para olhar o site.
 */
export const API_PORT = 3334;
export const WEB_PORT = 5174;
export const WEB_URL = `http://localhost:${WEB_PORT}`;
export const API_URL = `http://localhost:${API_PORT}`;

function requireDevDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url) return url;

  throw new Error(
    'DATABASE_URL ausente. Copie apps/api/.env.example para apps/api/.env antes de rodar o E2E.',
  );
}

/**
 * Banco próprio, derivado do de desenvolvimento.
 *
 * O sufixo `_e2e` é obrigatório e conferido antes de qualquer `DROP`: a
 * preparação recria o schema inteiro, e um erro de configuração aqui apagaria o
 * banco de trabalho ou o de teste.
 */
export const DATABASE_URL = (() => {
  const explicit = process.env.DATABASE_URL_E2E;
  if (explicit) return explicit;

  return requireDevDatabaseUrl().replace(/\/([^/?]+)(\?|$)/, '/$1_e2e$2');
})();

/** Arquivo onde a saída da API é guardada, para o teste ler o link do e-mail. */
export const API_LOG = path.join(fileURLToPath(new URL('..', import.meta.url)), '.artifacts');
export const API_LOG_FILE = path.join(API_LOG, 'api.log');

/*
 * A pasta é criada aqui, na carga do módulo, e não na preparação: o Playwright
 * **sobe o `webServer` antes de rodar o `globalSetup`**, e o comando da API
 * redireciona a saída para este arquivo. Sem a pasta pronta antes, o
 * redirecionamento falha e o servidor nem começa — era esse o erro "o sistema
 * não pode encontrar o caminho especificado".
 */
mkdirSync(API_LOG, { recursive: true });

/**
 * Admin do E2E.
 *
 * Credenciais próprias, nunca as de `ADMIN_EMAIL`/`ADMIN_PASSWORD` do `.env`: o
 * teste precisa conhecer a senha para entrar no painel, e segredo que o teste
 * conhece não deveria ser o mesmo do ambiente real.
 */
export const ADMIN = {
  email: 'admin.e2e@chacara.local',
  password: 'senha-do-admin-e2e-123',
};

/** Cliente criado pelo próprio teste, pela tela de cadastro. */
export const CUSTOMER = {
  name: 'Joana do Teste',
  email: 'joana.e2e@exemplo.com',
  phone: '11987654321',
  password: 'senha-da-joana-e2e-123',
};

/**
 * Itens do catálogo de demonstração usados no pedido (`apps/api/src/seed/data.ts`).
 *
 * São dados versionados, não aleatórios, e é por isso que dá para afirmar o
 * valor: 180,00 + 240,00 em itens, mais a diária que o servidor calcular.
 */
export const ORDERED_ITEMS = [
  { name: 'Painel de nuvens', priceCents: 18_000 },
  { name: 'Arco de balões pastel', priceCents: 24_000 },
];

export const ITEMS_TOTAL_CENTS = ORDERED_ITEMS.reduce((sum, item) => sum + item.priceCents, 0);
