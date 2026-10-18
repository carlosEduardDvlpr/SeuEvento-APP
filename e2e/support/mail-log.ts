import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { API_LOG_FILE } from './env.js';

/**
 * Lê do log da API o link que teria ido por e-mail (§20.1).
 *
 * Com `MAIL_TRANSPORT=log` a API registra os endereços encontrados no corpo em
 * vez de enviar. É o único caminho por onde um navegador consegue concluir a
 * confirmação de e-mail: o token é guardado apenas em hash (§10.2), então não dá
 * para reconstruí-lo a partir do banco.
 *
 * O log é JSON por linha (pino), mas a busca é por expressão regular na linha
 * inteira de propósito: depender do formato exato do registro tornaria o teste
 * sensível a uma mudança de logger que não tem nada a ver com o que ele verifica.
 */
export async function waitForMailLink(pattern: RegExp): Promise<string> {
  let link: string | undefined;

  await expect
    .poll(
      async () => {
        const log = await readFile(API_LOG_FILE, 'utf8').catch(() => '');

        // O pino escapa a barra em JSON (`https:\/\/...`); desfaz antes de casar.
        const matches = log.replace(/\\\//g, '/').match(new RegExp(pattern.source, 'g'));

        /*
         * O **último**, não o primeiro: o arquivo pode guardar a execução
         * anterior, e um token já usado faria a confirmação falhar com
         * `INVALID_TOKEN` — erro que pareceria defeito do fluxo.
         */
        link = matches?.at(-1);

        return link ?? null;
      },
      {
        message: `Nenhum link casando com ${pattern} apareceu no log da API`,
        timeout: 20_000,
        intervals: [200, 300, 500, 1000],
      },
    )
    .not.toBeNull();

  if (!link) throw new Error(`Link não encontrado para ${pattern}`);

  return link;
}
