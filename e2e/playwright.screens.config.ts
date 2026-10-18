import { defineConfig } from '@playwright/test';
import { WEB_URL } from './support/env.js';
import { webServers } from './support/servers.js';

/**
 * Captura de telas para a revisão responsiva (T30).
 *
 * **Não é teste, é ferramenta de inspeção.** Ela não afirma nada: abre cada rota
 * do mapa da §12.1 na largura de um celular e grava a foto, para dar para
 * revisar olhando em vez de supondo a partir do CSS. Por isso vive numa
 * configuração separada, com `testMatch` próprio, e fica fora do `pnpm test:e2e`.
 *
 * Rodar: `pnpm --filter e2e screens`. As fotos saem em `e2e/.artifacts/telas/`.
 *
 * Vale manter no repositório: na próxima vez que alguém mexer em layout, é o
 * caminho mais curto para ver o efeito em todas as telas de uma vez.
 */
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.capture.ts',

  workers: 1,
  fullyParallel: false,

  // Dezenas de rotas, cada uma com carregamento de dados, num só caso.
  timeout: 300_000,
  expect: { timeout: 15_000 },

  reporter: [['list']],
  outputDir: '.artifacts/screens-results',

  use: {
    baseURL: WEB_URL,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',

    /*
     * 375 px é a largura que o §24 cobra, e corresponde ao iPhone SE/8 — o chão
     * realista do público que a §1.3 descreve. `deviceScaleFactor: 2` porque
     * texto em escala 1 fica difícil de avaliar na captura.
     */
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },

  webServer: webServers,
});
