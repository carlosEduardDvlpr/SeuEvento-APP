import type {
  Availability,
  BookingKind,
  CatalogItem,
  Category,
  GalleryImage,
  GalleryKind,
  ItemsAvailability,
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
 * `staleTime` generoso no catálogo porque ele muda raramente: o cliente navega
 * entre categorias sem uma ida ao servidor por clique. A disponibilidade é a
 * exceção: depende do que foi reservado neste instante.
 *
 * Os estilos e os combos saíram do site em novembro de 2026, a pedido do dono, e
 * com eles os hooks de `/themes` e `/combos`. As rotas continuam na API.
 */

const CATALOG_STALE_MS = 5 * 60 * 1000;

/** Agenda e estoque livre: o mesmo prazo do `Cache-Control: max-age=30` das rotas. */
const AVAILABILITY_STALE_MS = 30 * 1000;

function toSearch(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }

  const query = search.toString();
  return query ? `?${query}` : '';
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => apiFetch<Category[]>('/categories'),
    staleTime: CATALOG_STALE_MS,
  });
}

export type ItemsFilters = { categoryId?: string };

export function useItems(filters: ItemsFilters = {}) {
  return useQuery({
    // Os filtros entram na chave: voltar para uma categoria já vista é instantâneo.
    queryKey: ['items', filters],
    queryFn: () => apiFetch<CatalogItem[]>(`/items${toSearch(filters)}`),
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
 *
 * `itemId` pede a agenda de **uma** decoração (novembro de 2026): o dia em que
 * ela já saiu para outra festa vem ocupado. É o calendário de quem já escolheu
 * a decoração, como quem chega pelo cartão dela na landing.
 */
export function useAvailability(
  range: { from: string; to: string } | null,
  kind: BookingKind = 'VENUE',
  itemId: string | null = null,
) {
  return useQuery({
    queryKey: ['availability', range, kind, itemId],
    queryFn: () =>
      apiFetch<Availability>(
        `/availability${toSearch({
          from: range?.from,
          to: range?.to,
          kind: kind === 'VENUE' ? undefined : kind,
          itemId: itemId ?? undefined,
        })}`,
      ),
    enabled: range !== null,
    staleTime: AVAILABILITY_STALE_MS,
  });
}

/**
 * Quantas unidades de cada decoração estão livres no período (novembro de 2026).
 *
 * É o passo da decoração: a que já saiu para outra festa nessa data aparece sem
 * poder ser escolhida. A chave mora debaixo de `['availability']` de propósito:
 * enviar ou cancelar uma reserva já invalida esse prefixo, e o estoque livre
 * muda junto com a agenda.
 */
export function useItemsAvailability(range: { from: string; to: string } | null) {
  return useQuery({
    queryKey: ['availability', 'items', range],
    queryFn: () =>
      apiFetch<ItemsAvailability>(
        `/items/availability${toSearch({ from: range?.from, to: range?.to })}`,
      ),
    enabled: range !== null,
    staleTime: AVAILABILITY_STALE_MS,
  });
}
