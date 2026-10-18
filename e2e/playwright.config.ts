import { defineConfig, devices } from '@playwright/test';
import {
  API_DIR,
  API_LOG_FILE,
  API_PORT,
  API_URL,
  DATABASE_URL,
  WEB_DIR,
  WEB_PORT,
  WEB_URL,
} from './support/env.js';

/**
 * E2E da §19: **um** caminho feliz, da landing até o admin confirmar.
 *
 * Um só, e isso é escolha: E2E é o teste mais caro e mais frágil da pirâmide.
 * O que ele prova que nenhum outro prova é que as peças estão **ligadas** —
 * navegador, SPA, proxy, API, Postgres e as constraints de verdade. Regra de
 * negócio é coberta por teste de integração e de unidade, que falham apontando
 * a linha certa.
 *
 * Só Chromium. Compatibilidade entre navegadores não é o que este teste
 * investiga, e baixar três motores custaria quase 1 GB para a mesma resposta.
 */
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',

  // Um arquivo, um caminho: paralelismo aqui não compraria nada, e o teste
  // escreve no mesmo banco.
  workers: 1,
  fullyParallel: false,

  // O caminho inteiro passa por e-mail, orçamento e duas sessões; 5 s não bastam.
  timeout: 120_000,
  expect: { timeout: 15_000 },

  // Em CI, `.only` esquecido faria a suíte passar escondendo o resto.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,

  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  outputDir: '.artifacts/results',

  /*
   * Sem `globalSetup` de propósito. A ordem do Playwright é subir o `webServer`,
   * **esperar ele ficar pronto** e só então rodar o `globalSetup`; como o
   * `/api/health` responde 503 enquanto não existe banco (§20.2), a espera nunca
   * terminaria. Quem prepara o ambiente é `prepare.ts`, num passo anterior do
   * script `test` — ver o comentário lá.
   */

  use: {
    baseURL: WEB_URL,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',

    // Rastro e captura só do que falhou: na primeira execução verde não sobra
    // nada no disco, e numa vermelha há o suficiente para entender sem repetir.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      /*
       * A saída vai para arquivo porque o teste precisa ler o link de
       * confirmação de e-mail dali (§10.2: o token só existe em hash no banco).
       * O `url` de prontidão resolve a espera: o `/api/health` responde 503
       * enquanto o banco não está pronto, então o Playwright aguarda a
       * preparação terminar sem precisar de ordem explícita.
       */
      command: `node --import tsx src/server.ts >> "${API_LOG_FILE}" 2>&1`,
      cwd: API_DIR,
      url: `${API_URL}/api/health`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        /*
         * `development`, não `test`: com `NODE_ENV=test` o logger fica em
         * `silent` (app.ts) e o link de confirmação de e-mail nunca apareceria
         * no arquivo. O efeito colateral é o rate limit ligado, que é o
         * comportamento real — e o E2E faz menos requisições que o teto de
         * 100/min.
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
  ],
});
