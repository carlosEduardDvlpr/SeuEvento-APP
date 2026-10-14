import type {
  Availability,
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

export function useGallery(kind?: GalleryKind) {
  return useQuery({
    queryKey: ['gallery', kind ?? 'all'],
    queryFn: () => apiFetch<GalleryImage[]>(`/gallery${toSearch({ kind })}`),
    staleTime: CATALOG_STALE_MS,
  });
}

/**
 * Estado dos dias de um período (§11.3).
 *
 * Sem `staleTime`: o resultado depende do que está reservado agora, e mostrar
 * um dia livre que acabou de ser tomado é o pior engano possível no calendário.
 * A resposta já tem cache curto de HTTP do lado do servidor.
 */
export function useAvailability(range: { from: string; to: string } | null) {
  return useQuery({
    queryKey: ['availability', range],
    queryFn: () => apiFetch<Availability>(`/availability?from=${range?.from}&to=${range?.to}`),
    enabled: range !== null,
  });
}
