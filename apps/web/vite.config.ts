import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // §10.1: em dev o SPA fala com /api no próprio origin, para o cookie de
    // refresh ser de primeiro nível e não haver CORS (mesmo arranjo da produção).
    proxy: {
      '/api': { target: 'http://localhost:3333', changeOrigin: false },
    },
  },
});
