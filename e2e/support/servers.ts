import type { PlaywrightTestConfig } from '@playwright/test';
import {
  API_DIR,
  API_LOG_FILE,
  API_PORT,
  API_URL,
  DATABASE_URL,
  WEB_DIR,
  WEB_PORT,
  WEB_URL,
} from './env.js';

/**
 * API e SPA do E2E, em portas e banco próprios.
 *
 * Vive à parte porque duas configurações os usam: a do teste de caminho feliz
 * (§19) e a da captura de telas da revisão responsiva. Duas cópias divergiriam
 * na primeira mudança de porta ou de variável.
 */
export const webServers: PlaywrightTestConfig['webServer'] = [
  {
    /*
     * A saída vai para arquivo porque o teste precisa ler o link de confirmação
     * de e-mail dali (§10.2: o token só existe em hash no banco). O `url` de
     * prontidão resolve a espera: o `/api/health` responde 503 enquanto o banco
     * não está pronto, então o Playwright aguarda a preparação terminar sem
     * precisar de ordem explícita.
     */
    command: `node --import tsx src/server.ts >> "${API_LOG_FILE}" 2>&1`,
    cwd: API_DIR,
    url: `${API_URL}/api/health`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      /*
       * `development`, não `test`: com `NODE_ENV=test` o logger fica em
       * `silent` (app.ts) e o link de confirmação de e-mail nunca apareceria no
       * arquivo. O efeito colateral é o rate limit ligado, que é o comportamento
       * real — e o E2E faz menos requisições que o teto de 100/min.
       */
      NODE_ENV: 'development',
      PORT: String(API_PORT),
      DATABASE_URL,
      // Os links do e-mail precisam apontar para o SPA do E2E, não para o de
      // desenvolvimento.
      APP_URL: WEB_URL,
      CORS_ORIGIN: WEB_URL,
      MAIL_TRANSPORT: 'log',
    },
  },
  {
    command: `pnpm exec vite --port ${WEB_PORT} --strictPort`,
    cwd: WEB_DIR,
    url: WEB_URL,
    timeout: 120_000,
    reuseExistingServer: false,
    env: { API_PROXY_TARGET: API_URL },
  },
];
