import { defineConfig } from 'vitest/config';

// Cada pacote traz a própria configuração: `shared` e `api` rodam em node,
// `web` roda em jsdom com o plugin do React (definido em apps/web/vite.config.ts).
export default defineConfig({
  test: {
    projects: ['packages/shared', 'apps/api', 'apps/web'],
  },
});
