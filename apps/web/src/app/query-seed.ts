import type { CatalogItem, Combo, GalleryImage, PublicVenue, Theme } from '@chacara/shared';
import type { QueryClient } from '@tanstack/react-query';

/**
 * Dados que a landing pré-renderizada já traz prontos (§18.3, camada 3).
 *
 * O pré-renderizador do build grava este pacote no HTML, e o SPA o carrega no
 * cache do Query antes do primeiro desenho. São duas vantagens de uma vez: a
 * primeira pintura não espera cinco requisições, e o HTML que o React
 * hidrata é idêntico ao que ele renderizaria — sem isso a hidratação acusaria
 * divergência e jogaria o HTML pré-renderizado fora.
 *
 * **A disponibilidade fica de fora de propósito.** Ela depende de que dia é
 * hoje e do que foi reservado neste instante; vinda do build, mostraria datas
 * livres que podem já ter dono. É o pior engano possível no calendário, e
 * nenhum ganho de desempenho o paga.
 */
export type AppSeed = {
  venue: PublicVenue;
  gallery: GalleryImage[];
  themes: Theme[];
  combos: Combo[];
  /** A vitrine de itens da landing. Preço de tabela, que muda pelo painel. */
  items: CatalogItem[];
};

/**
 * Nome da variável global onde o HTML deixa o pacote.
 *
 * Fica num único lugar porque três arquivos a usam (o pré-renderizador escreve,
 * o `main.tsx` lê, o teste confere) e um erro de digitação sairia calado.
 */
export const SEED_GLOBAL = '__CHACARA_SEED__';

/**
 * Chaves do Query, iguais às dos hooks de `api/storefront.ts` e `api/venue.ts`.
 *
 * Divergir aqui não dá erro: a landing simplesmente refaz as requisições e o
 * ganho desaparece sem avisar. É por isso que existe teste cobrando que a
 * landing pré-semeada não chame a rede.
 */
export function applySeed(client: QueryClient, seed: AppSeed): void {
  client.setQueryData(['venue'], seed.venue);
  client.setQueryData(['gallery', 'all'], seed.gallery);
  client.setQueryData(['themes'], seed.themes);
  client.setQueryData(['combos', {}], seed.combos);
  client.setQueryData(['items', {}], seed.items);
}

/** Lê o pacote da global, ignorando qualquer coisa que não tenha a cara certa. */
export function readSeed(scope: Record<string, unknown>): AppSeed | null {
  const raw = scope[SEED_GLOBAL];
  if (!raw || typeof raw !== 'object') return null;

  const seed = raw as Partial<AppSeed>;

  /*
   * Checagem rasa de propósito: o pacote vem do próprio build, não de fora, e
   * validá-lo com Zod aqui custaria o schema inteiro no bundle da landing — o
   * oposto do que a §18.2 pede. O que precisa ser pego é o caso de o HTML estar
   * velho ou o campo ter sido renomeado.
   */
  if (!seed.venue || !Array.isArray(seed.gallery)) return null;
  if (!Array.isArray(seed.themes) || !Array.isArray(seed.combos)) return null;
  if (!Array.isArray(seed.items)) return null;

  return seed as AppSeed;
}
