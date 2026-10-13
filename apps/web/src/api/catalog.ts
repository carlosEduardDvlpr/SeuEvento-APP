import type {
  AdminGalleryImage,
  AdminItem,
  AdminTheme,
  Category,
  CreateCategoryBody,
  CreateGalleryImageBody,
  CreateItemBody,
  CreateThemeBody,
  DeleteResult,
  GalleryKind,
  ReorderGalleryBody,
  UpdateCategoryBody,
  UpdateGalleryImageBody,
  UpdateItemBody,
  UpdateThemeBody,
} from '@chacara/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';

/**
 * Catálogo pelo painel (§12.2, §12.3).
 *
 * Chaves de query hierárquicas: `['admin', 'themes']`. Cada mutation invalida
 * **só** a chave do recurso que mexeu, e nada além (§12.2) — invalidar a árvore
 * inteira recarregaria listas que nem estão na tela.
 *
 * Toda requisição aqui vai com `auth: true`: são rotas sob `/admin`.
 */

const adminKeys = {
  categories: ['admin', 'categories'] as const,
  themes: ['admin', 'themes'] as const,
  items: ['admin', 'items'] as const,
  gallery: ['admin', 'gallery'] as const,
};

/** Lista paginada do admin (§11.1). */
type Paginated<T> = { items: T[]; total: number; page: number; pageSize: number };

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------

export function useAdminCategories() {
  return useQuery({
    queryKey: adminKeys.categories,
    queryFn: () => apiFetch<Category[]>('/admin/categories', { auth: true }),
  });
}

export function useCreateCategory() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateCategoryBody) =>
      apiFetch<Category>('/admin/categories', { method: 'POST', body, auth: true }),
    onSuccess: () => client.invalidateQueries({ queryKey: adminKeys.categories }),
  });
}

export function useUpdateCategory() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateCategoryBody }) =>
      apiFetch<Category>(`/admin/categories/${id}`, { method: 'PATCH', body, auth: true }),
    onSuccess: () => client.invalidateQueries({ queryKey: adminKeys.categories }),
  });
}

export function useDeleteCategory() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/admin/categories/${id}`, { method: 'DELETE', auth: true }),
    onSuccess: async () => {
      // O item carrega a categoria embutida, então a lista de itens também mudou.
      await client.invalidateQueries({ queryKey: adminKeys.categories });
      await client.invalidateQueries({ queryKey: adminKeys.items });
    },
  });
}

// ---------------------------------------------------------------------------
// Estilos
// ---------------------------------------------------------------------------

export function useAdminThemes() {
  return useQuery({
    queryKey: adminKeys.themes,
    queryFn: () => apiFetch<AdminTheme[]>('/admin/themes', { auth: true }),
  });
}

export function useCreateTheme() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateThemeBody) =>
      apiFetch<AdminTheme>('/admin/themes', { method: 'POST', body, auth: true }),
    onSuccess: () => client.invalidateQueries({ queryKey: adminKeys.themes }),
  });
}

export function useUpdateTheme() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateThemeBody }) =>
      apiFetch<AdminTheme>(`/admin/themes/${id}`, { method: 'PATCH', body, auth: true }),
    onSuccess: () => client.invalidateQueries({ queryKey: adminKeys.themes }),
  });
}

export function useDeleteTheme() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<DeleteResult>(`/admin/themes/${id}`, { method: 'DELETE', auth: true }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: adminKeys.themes });
      // Item e combo carregam vínculo com estilo.
      await client.invalidateQueries({ queryKey: adminKeys.items });
    },
  });
}

// ---------------------------------------------------------------------------
// Itens
// ---------------------------------------------------------------------------

export type AdminItemsFilters = {
  page?: number;
  pageSize?: number;
  categoryId?: string;
  themeId?: string;
};

function toSearch(filters: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }

  const search = params.toString();
  return search ? `?${search}` : '';
}

export function useAdminItems(filters: AdminItemsFilters = {}) {
  return useQuery({
    // Os filtros entram na chave: trocar de categoria é outra consulta, com
    // cache próprio, e voltar para a anterior é instantâneo.
    queryKey: [...adminKeys.items, filters],
    queryFn: () =>
      apiFetch<Paginated<AdminItem>>(`/admin/items${toSearch({ ...filters })}`, { auth: true }),
  });
}

export function useCreateItem() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateItemBody) =>
      apiFetch<AdminItem>('/admin/items', { method: 'POST', body, auth: true }),
    onSuccess: () => client.invalidateQueries({ queryKey: adminKeys.items }),
  });
}

export function useUpdateItem() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateItemBody }) =>
      apiFetch<AdminItem>(`/admin/items/${id}`, { method: 'PATCH', body, auth: true }),
    onSuccess: () => client.invalidateQueries({ queryKey: adminKeys.items }),
  });
}

export function useDeleteItem() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<DeleteResult>(`/admin/items/${id}`, { method: 'DELETE', auth: true }),
    onSuccess: () => client.invalidateQueries({ queryKey: adminKeys.items }),
  });
}

// ---------------------------------------------------------------------------
// Galeria
// ---------------------------------------------------------------------------

export function useAdminGallery() {
  return useQuery({
    queryKey: adminKeys.gallery,
    queryFn: () => apiFetch<AdminGalleryImage[]>('/admin/gallery', { auth: true }),
  });
}

export function useCreateGalleryImage() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateGalleryImageBody) =>
      apiFetch<AdminGalleryImage>('/admin/gallery', { method: 'POST', body, auth: true }),
    onSuccess: () => client.invalidateQueries({ queryKey: adminKeys.gallery }),
  });
}

export function useUpdateGalleryImage() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateGalleryImageBody }) =>
      apiFetch<AdminGalleryImage>(`/admin/gallery/${id}`, { method: 'PATCH', body, auth: true }),
    onSuccess: () => client.invalidateQueries({ queryKey: adminKeys.gallery }),
  });
}

export function useDeleteGalleryImage() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/admin/gallery/${id}`, { method: 'DELETE', auth: true }),
    onSuccess: () => client.invalidateQueries({ queryKey: adminKeys.gallery }),
  });
}

/**
 * Reordena uma seção da galeria.
 *
 * A API devolve a galeria inteira já ordenada, então gravamos a resposta no cache
 * em vez de invalidar: reordenar é clique repetido (subir, subir, descer), e uma
 * ida ao servidor a cada clique faria a lista piscar.
 */
export function useReorderGallery() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: ReorderGalleryBody) =>
      apiFetch<AdminGalleryImage[]>('/admin/gallery/order', {
        method: 'PATCH',
        body,
        auth: true,
      }),
    onSuccess: (images) => client.setQueryData(adminKeys.gallery, images),
  });
}

/** Rótulos pt-BR das seções da galeria (§13). */
export const GALLERY_KIND_LABELS: Record<GalleryKind, string> = {
  HERO: 'Capa',
  VENUE: 'A chácara',
  EVENTS: 'Festas realizadas',
};
