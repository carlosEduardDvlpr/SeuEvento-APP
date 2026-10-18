import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/*
 * O destino é configurável por causa do E2E (§19), que sobe API e SPA em portas
 * próprias para não testar contra o banco de trabalho. No dia a dia o padrão
 * vale e ninguém precisa definir nada.
 */
const apiProxy = {
  target: process.env.API_PROXY_TARGET ?? 'http://localhost:3333',
  changeOrigin: false,
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  ssr: {
    /*
     * A pré-renderização da landing (§18.3) roda o bundle de servidor no Node, e
     * `@chacara/shared` publica TypeScript cru (`exports` aponta para
     * `src/index.ts`). O Node não importa `.ts`, então o pacote precisa entrar
     * no bundle em vez de ficar externo. As outras dependências continuam
     * externas, resolvidas do node_modules.
     */
    noExternal: ['@chacara/shared'],
  },
  server: {
    port: 5173,
    // §10.1: em dev o SPA fala com /api no próprio origin, para o cookie de
    // refresh ser de primeiro nível e não haver CORS (mesmo arranjo da produção).
    proxy: { '/api': apiProxy },
  },
  preview: {
    port: 4173,
    // O mesmo proxy, para dar para conferir o build de verdade — inclusive a
    // landing pré-renderizada e a hidratação — sem subir nada em produção.
    proxy: { '/api': apiProxy },
  },
});
