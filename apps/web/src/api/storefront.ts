import type {
  Availability,
  BookingKind,
  CatalogItem,
  Category,
  Combo,
  GalleryImage,
  GalleryKind,
  Theme,
} from '@chacara/shared';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './client';

/**
 * Catálogo público e disponibilidade (§11.2).
 *
 * Separado do `api/catalog.ts`, que fala com `/admin`: aqui nada vai autenticado
 * e as respostas são cacheáveis. Misturar os dois faria uma tela pública pedir
 * token sem querer.
 *
 * `staleTime` generoso no catálogo porque ele muda raramente — o cliente navega
 * entre estilos sem uma ida ao servidor por clique. A disponibilidade é a exceção:
 * depende do que foi reservado neste instante.
 */

const CATALOG_STALE_MS = 5 * 60 * 1000;

function toSearch(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }

  const query = search.toString();
  return query ? `?${query}` : '';
}

export function useThemes() {
  return useQuery({
    queryKey: ['themes'],
    queryFn: () => apiFetch<Theme[]>('/themes'),
    staleTime: CATALOG_STALE_MS,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => apiFetch<Category[]>('/categories'),
    staleTime: CATALOG_STALE_MS,
  });
}

export type ItemsFilters = { themeId?: string; categoryId?: string };

export function useItems(filters: ItemsFilters = {}) {
  return useQuery({
    // Os filtros entram na chave: voltar para um estilo já visto é instantâneo.
    queryKey: ['items', filters],
    queryFn: () => apiFetch<CatalogItem[]>(`/items${toSearch(filters)}`),
    staleTime: CATALOG_STALE_MS,
  });
}

export function useCombos(filters: { themeId?: string } = {}) {
  return useQuery({
    queryKey: ['combos', filters],
    queryFn: () => apiFetch<Combo[]>(`/combos${toSearch(filters)}`),
    staleTime: CATALOG_STALE_MS,
  });
}

/**
 * `enabled` existe por causa do SEO: o módulo de `og:image` só precisa da
 * galeria nas páginas que alguém compartilha, e sem o interruptor a tela de
 * login passaria a baixar a galeria inteira para nada. Nas telas que já pedem a
 * galeria, a chave é a mesma e as duas leituras viram uma requisição.
 */
export function useGallery(kind?: GalleryKind, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['gallery', kind ?? 'all'],
    queryFn: () => apiFetch<GalleryImage[]>(`/gallery${toSearch({ kind })}`),
    staleTime: CATALOG_STALE_MS,
    enabled: options.enabled ?? true,
  });
}

/**
 * Estado dos dias de um período (§11.3).
 *
 * `staleTime` de 30 s, como a §18.2 determina — e não os 5 min do catálogo: o
 * resultado depende do que está reservado agora, e mostrar um dia livre que
 * acabou de ser tomado é o pior engano possível no calendário.
 *
 * O número combina de propósito com o `Cache-Control: max-age=30` que a rota
 * devolve: as duas camadas expiram juntas, em vez de o Query insistir num dado
 * que o navegador já descartou.
 *
 * `kind` escolhe a agenda (T32): a da chácara, que é o padrão, ou a da
 * decoração. A URL da chácara fica igual à de antes, sem o parâmetro.
 */
export function useAvailability(
  range: { from: string; to: string } | null,
  kind: BookingKind = 'VENUE',
) {
  return useQuery({
    queryKey: ['availability', range, kind],
    queryFn: () =>
      apiFetch<Availability>(
        `/availability?from=${range?.from}&to=${range?.to}${kind === 'VENUE' ? '' : `&kind=${kind}`}`,
      ),
    enabled: range !== null,
    staleTime: 30 * 1000,
  });
}
