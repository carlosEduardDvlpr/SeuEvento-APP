import { execFileSync } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Pré-renderização da landing depois do build (§18.3, camada 3).
 *
 * O SPA desenha no cliente, e isso cobra dois preços: a busca por "chácara para
 * festa em tal cidade" vê uma página vazia, e os leitores de cartão do WhatsApp
 * e do Facebook — que **não executam JavaScript** — nunca veem o nome nem a foto
 * da chácara. Este script resolve os dois gravando no `dist/index.html` o HTML
 * da landing e as meta tags com os dados reais, mais um pacote de dados que o
 * SPA aproveita para não repetir as requisições no primeiro desenho.
 *
 * **Regra que manda em tudo aqui: na dúvida, não escreve.** Sem API no ar, sem
 * domínio configurado ou com o `index.html` fora do formato esperado, o script
 * avisa e sai com sucesso, deixando o build normal de pé. Injetar meia página,
 * ou uma com estado de carregamento congelado, seria pior que não injetar nada.
 *
 * Como ligar:
 *
 * ```
 * SITE_URL=https://chacara.com.br PRERENDER_API_URL=https://api.chacara.com.br/api \
 *   pnpm --filter web build
 * ```
 */

const WEB_ROOT = fileURLToPath(new URL('..', import.meta.url));
const INDEX_URL = new URL('../dist/index.html', import.meta.url);
const SITEMAP_URL = new URL('../dist/sitemap.xml', import.meta.url);
const SERVER_DIR_URL = new URL('../dist/server/', import.meta.url);
const SERVER_ENTRY_URL = new URL('entry-server.js', SERVER_DIR_URL);

/** Caminhos públicos que a landing precisa, na ordem em que entram no pacote. */
const SOURCES = {
  venue: '/public/venue',
  gallery: '/gallery',
  themes: '/themes',
  combos: '/combos',
  items: '/items',
};

/** Domínio de exemplo que o `sitemap.xml` do repositório carrega. */
const PLACEHOLDER_DOMAIN = 'https://chacara.exemplo.com.br';

/** Única rota pré-renderizada. A §18.3 pede a landing, e só ela. */
const PRERENDER_PATH = '/';

async function cleanup() {
  await rm(SERVER_DIR_URL, { recursive: true, force: true });
}

async function skip(reason) {
  console.warn(`[prerender] ignorado: ${reason}`);
  await cleanup();
  process.exit(0);
}

/** Tira a barra final para as URLs montadas não saírem com barra dobrada. */
function trimSlash(value) {
  return value.replace(/\/+$/, '');
}

async function fetchJson(base, route) {
  const response = await fetch(`${base}${route}`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) throw new Error(`${route} respondeu ${response.status}`);
  return response.json();
}

/**
 * Escapa o pacote de dados para caber dentro de um `<script>`.
 *
 * Uma legenda de foto com `</script>` fecharia a tag no meio do JSON e quebraria
 * a página inteira. `\u2028` e `\u2029` são válidos em JSON e inválidos num
 * literal de JavaScript.
 */
function escapeForScript(json) {
  return json
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function escapeAttribute(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Troca uma única ocorrência, ou devolve `null`.
 *
 * O `null` é o ponto: se o `index.html` mudar de forma e o padrão não casar
 * mais, o chamador aborta em vez de gravar um HTML pela metade.
 */
function replaceOnce(html, pattern, value) {
  const matches = html.match(new RegExp(pattern.source, `${pattern.flags}g`));
  if (!matches || matches.length !== 1) return null;

  return html.replace(pattern, () => value);
}

/**
 * Compila o bundle de servidor.
 *
 * Roda aqui, e não como um passo do `package.json`, para só existir quando a
 * pré-renderização vai de fato acontecer: assim um build comum não gasta tempo
 * nem deixa `dist/server` para trás.
 */
function buildServerBundle() {
  const require = createRequire(import.meta.url);
  const viteBin = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');

  execFileSync(
    process.execPath,
    [viteBin, 'build', '--ssr', 'src/entry-server.tsx', '--outDir', 'dist/server'],
    { cwd: WEB_ROOT, stdio: 'inherit' },
  );
}

async function main() {
  const siteUrl = process.env.SITE_URL ? trimSlash(process.env.SITE_URL) : null;
  const apiUrl = process.env.PRERENDER_API_URL ? trimSlash(process.env.PRERENDER_API_URL) : null;

  if (!siteUrl || !apiUrl) {
    await skip('defina SITE_URL e PRERENDER_API_URL para pré-renderizar a landing');
  }

  let seed;
  try {
    const entries = await Promise.all(
      Object.entries(SOURCES).map(async ([key, route]) => [key, await fetchJson(apiUrl, route)]),
    );
    seed = Object.fromEntries(entries);
  } catch (error) {
    await skip(`a API pública não respondeu (${error.message})`);
  }

  // Sem o nome da chácara não há nada que valha a pena pré-renderizar.
  if (!seed.venue?.name) await skip('a API não devolveu os dados da chácara');

  buildServerBundle();

  const { renderLanding, SEED_GLOBAL } = await import(SERVER_ENTRY_URL.href);
  const page = renderLanding({ ...seed, siteUrl });

  let html = await readFile(INDEX_URL, 'utf8');

  const steps = [
    [/<title>[\s\S]*?<\/title>/i, `<title>${escapeAttribute(page.title)}</title>`],
    [
      /<meta\s[^>]*name="description"[^>]*>/i,
      `<meta name="description" content="${escapeAttribute(page.description)}" />`,
    ],
    [
      /<meta\s[^>]*property="og:title"[^>]*>/i,
      `<meta property="og:title" content="${escapeAttribute(page.title)}" />`,
    ],
    [
      /<meta\s[^>]*property="og:description"[^>]*>/i,
      `<meta property="og:description" content="${escapeAttribute(page.description)}" />`,
    ],
    [
      /<meta\s[^>]*property="og:site_name"[^>]*>/i,
      `<meta property="og:site_name" content="${escapeAttribute(seed.venue.name)}" />`,
    ],
    [
      /<script\s[^>]*data-seo="local-business"[^>]*>[\s\S]*?<\/script>/i,
      `<script type="application/ld+json" data-seo="local-business">${page.jsonLd}</script>`,
    ],
    /*
     * O atributo guarda **qual** caminho foi pré-renderizado, não um "sim".
     *
     * O servidor devolve este mesmo `index.html` em qualquer rota, porque é um
     * SPA. Sem a distinção, quem abrisse `/reservar` receberia o HTML da landing
     * e o React tentaria hidratar o wizard sobre ele — divergência garantida.
     *
     * O script ao lado limpa o `#root` nesses casos. Ele é clássico e fica logo
     * depois da div, então roda durante a análise do HTML, antes de o navegador
     * pintar o conteúdo errado e antes do módulo do SPA, que é adiado.
     */
    [
      /<div\s+id="root"\s*><\/div>/i,
      [
        `<div id="root" data-prerendered="${PRERENDER_PATH}">${page.html}</div>`,
        '<script>',
        `      if (location.pathname !== ${JSON.stringify(PRERENDER_PATH)}) {`,
        "        var root = document.getElementById('root');",
        "        if (root) { root.removeAttribute('data-prerendered'); root.textContent = ''; }",
        '      }',
        '    </script>',
      ].join('\n    '),
    ],
    [
      /<\/head>/i,
      [
        `<link rel="canonical" href="${escapeAttribute(page.canonical)}" />`,
        `<meta property="og:url" content="${escapeAttribute(page.canonical)}" />`,
        page.ogImage
          ? `<meta property="og:image" content="${escapeAttribute(page.ogImage)}" />`
          : '',
        '</head>',
      ]
        .filter(Boolean)
        .join('\n    '),
    ],
    [
      /<\/body>/i,
      `<script>window.${SEED_GLOBAL}=${escapeForScript(page.seed)}</script>\n  </body>`,
    ],
  ];

  for (const [pattern, value] of steps) {
    const next = replaceOnce(html, pattern, value);
    if (next === null) await skip(`o index.html não casou com ${pattern} (nada foi gravado)`);
    html = next;
  }

  await writeFile(INDEX_URL, html, 'utf8');

  /*
   * O `sitemap.xml` do repositório nasce com um domínio de exemplo, porque um
   * arquivo versionado não tem como saber onde o site vai rodar. Aqui o domínio
   * é conhecido, então vale corrigir — e só aqui.
   */
  try {
    const sitemap = await readFile(SITEMAP_URL, 'utf8');
    await writeFile(SITEMAP_URL, sitemap.replaceAll(PLACEHOLDER_DOMAIN, siteUrl), 'utf8');
  } catch {
    console.warn('[prerender] sitemap.xml não encontrado; segue sem ele');
  }

  await cleanup();
  console.log(`[prerender] landing gravada em dist/index.html (${html.length} bytes)`);
}

await main();
