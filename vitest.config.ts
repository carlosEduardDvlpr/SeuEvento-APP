import { defineConfig } from 'vitest/config';

/**
 * Cada pacote traz a própria configuração: `shared` e `api` rodam em node,
 * `web` roda em jsdom com o plugin do React (definido em apps/web/vite.config.ts).
 *
 * `fileParallelism: false` mora **aqui**, e não no config do `apps/api`, porque o
 * agendamento de arquivos é global: a mesma opção dentro de um projeto não tem
 * efeito quando se roda pela raiz, e foi isso que deixou os testes de integração
 * se atropelarem por um bom tempo sem ninguém notar.
 *
 * O motivo de serializar: os testes de integração da API compartilham um
 * Postgres e limpam com `TRUNCATE` no `beforeEach`, que pega lock exclusivo em
 * todas as tabelas. Dois arquivos ao mesmo tempo produzem deadlock na limpeza, e
 * o arquivo seguinte encontra dados de outro — o sintoma é uma cascata de
 * violação de unicidade que não tem nada a ver com o teste que falhou.
 *
 * O custo é uns 90 s de parede. Se incomodar, o caminho é banco por worker
 * (`CREATE DATABASE ... TEMPLATE`), que devolve o paralelismo sem a disputa.
 */
export default defineConfig({
  test: {
    projects: ['packages/shared', 'apps/api', 'apps/web'],
    fileParallelism: false,
  },
});
