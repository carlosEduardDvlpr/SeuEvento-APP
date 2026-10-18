import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import { AppProviders, createQueryClient } from './app/providers';
import { applySeed, type AppSeed } from './app/query-seed';
import { AppRoutes } from './app/router';
import { localBusinessJsonLd } from './features/seo/local-business';
import { descriptionFor, documentTitle, seoForPath } from './features/seo/routes';

/*
 * O nome da global sai por aqui para o script do build não repeti-lo como texto
 * solto: um erro de digitação faria o SPA ignorar o pacote de dados em silêncio.
 */
export { SEED_GLOBAL } from './app/query-seed';

/**
 * Pré-renderização da landing no build (§18.3, camada 3).
 *
 * O SPA renderiza no cliente, o que prejudica a busca por "chácara para festa
 * em tal cidade" e, principalmente, **os cartões de compartilhamento**:
 * WhatsApp e Facebook não executam JavaScript, então para eles só existe o HTML
 * entregue. É este módulo que faz esse HTML ter o nome, a foto e o endereço
 * reais em vez do piso genérico do `index.html`.
 *
 * Só a landing. Quem roda isto é `scripts/prerender.mjs`, uma vez por build,
 * com os dados buscados da API pública.
 */

export type PrerenderInput = AppSeed & {
  /** Domínio público, sem barra no fim. */
  siteUrl: string;
};

export type PrerenderOutput = {
  /** Marcação de dentro do `#root`. */
  html: string;
  title: string;
  description: string;
  canonical: string;
  ogImage: string | undefined;
  /** JSON-LD já serializado, pronto para entrar no `<script>`. */
  jsonLd: string;
  /** Pacote de dados que o SPA lê para não repetir as requisições. */
  seed: string;
};

/** Resolve a URL da foto de destaque contra o domínio do site. */
function heroImage(seed: AppSeed, siteUrl: string): string | undefined {
  const url = seed.gallery.find((image) => image.kind === 'HERO')?.url;
  if (!url) return undefined;

  try {
    return new URL(url, siteUrl).href;
  } catch {
    return undefined;
  }
}

export function renderLanding({ siteUrl, ...seed }: PrerenderInput): PrerenderOutput {
  const client = createQueryClient();
  applySeed(client, seed);

  /*
   * `StrictMode` e os provedores são os mesmos do `main.tsx` porque o HTML daqui
   * precisa casar com o primeiro desenho do cliente. O `AuthProvider` começa em
   * "carregando" e seus efeitos não rodam fora do navegador, que é exatamente o
   * estado em que o cliente também começa — por isso o cabeçalho sai igual nos
   * dois lados.
   *
   * O mesmo vale para a disponibilidade: ela não está no pacote de dados, então
   * os dois lados renderizam "Consultando a agenda…" e a hidratação fecha sem
   * divergência.
   */
  const html = renderToString(
    <StrictMode>
      <AppProviders client={client}>
        <StaticRouter location="/">
          <AppRoutes />
        </StaticRouter>
      </AppProviders>
    </StrictMode>,
  );

  const route = seoForPath('/');
  const ogImage = heroImage(seed, siteUrl);

  return {
    html,
    title: documentTitle(route, seed.venue.name),
    description: descriptionFor(route, seed.venue),
    canonical: `${siteUrl}/`,
    ogImage,
    jsonLd: JSON.stringify(localBusinessJsonLd(seed.venue, { url: siteUrl, imageUrl: ogImage })),
    seed: JSON.stringify(seed),
  };
}
