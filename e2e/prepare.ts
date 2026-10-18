import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { ADMIN, API_DIR, API_LOG_FILE, DATABASE_URL } from './support/env.js';
import { prepareDatabase } from './support/database.js';

/**
 * Preparação do E2E (§19): banco próprio, migrations aplicadas, catálogo de
 * demonstração e um admin de credencial conhecida.
 *
 * **Roda antes do `playwright test`, não como `globalSetup`.** A ordem do
 * Playwright é: sobe o `webServer`, espera ele ficar pronto, e só então executa
 * o `globalSetup`. Como o `/api/health` responde 503 enquanto não há banco
 * (§20.2), a espera nunca terminava e a execução morria por tempo esgotado
 * antes de a preparação começar. Com a preparação num passo anterior do script,
 * a ordem é garantida pelo `&&` e não depende de detalhe do runner.
 */

await prepareDatabase();

/*
 * A saída da API é gravada em arquivo para o teste ler o link de confirmação de
 * e-mail: com `MAIL_TRANSPORT=log` a API imprime os links em vez de enviar
 * (§20.1), e esse é o único caminho pelo qual um navegador consegue concluir o
 * cadastro — o token só existe em hash no banco (§10.2).
 *
 * Zerado a cada execução para o arquivo não crescer sem fim. O teste ainda pega
 * a **última** ocorrência, que é a defesa contra ler um token já usado.
 */
await writeFile(API_LOG_FILE, '', 'utf8');

/*
 * Catálogo pelo seed da própria API.
 *
 * `SEED_DEMO=true` cria os itens e combos de `src/seed/data.ts` — dados
 * versionados, não aleatórios, e é por isso que o teste pode afirmar valores em
 * centavos. Reescrever as fixtures aqui criaria uma segunda verdade sobre o
 * catálogo.
 *
 * O admin é o do E2E, passado por variável de ambiente: o `dotenv` da API não
 * sobrescreve o que já está definido, então nem o banco nem as credenciais
 * reais do `.env` são tocados.
 */
execFileSync(process.execPath, ['--import', 'tsx', 'prisma/seed.ts'], {
  cwd: API_DIR,
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL,
    SEED_DEMO: 'true',
    ADMIN_EMAIL: ADMIN.email,
    ADMIN_PASSWORD: ADMIN.password,
  },
});
