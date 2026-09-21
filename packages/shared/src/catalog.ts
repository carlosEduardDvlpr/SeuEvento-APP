import { z } from 'zod';
import { centsSchema, galleryKindSchema, paletteSchema } from './schemas.js';

/**
 * Contratos do catálogo: categorias, estilos, itens e galeria (§11.2).
 *
 * As formas públicas (`...Schema`) são o que a API devolve e o que o SPA tipa. As
 * formas do admin acrescentam `active`, porque o painel lista o que está
 * desativado e a vitrine não.
 *
 * Os corpos de escrita existem em par: `create...` exige o conjunto completo e
 * aplica os padrões; `update...` tem tudo opcional, e **campo ausente significa
 * "não mexer"**. É isso que permite o painel salvar um formulário parcial sem
 * apagar por acidente o que não estava na tela.
 */

// ---------------------------------------------------------------------------
// Blocos reaproveitados
// ---------------------------------------------------------------------------

/** Ordem de exibição, definida pelo admin. */
export const sortOrderSchema = z
  .number()
  .int({ error: 'A ordem deve ser um número inteiro.' })
  .min(0, { error: 'A ordem não pode ser negativa.' })
  .max(9999, { error: 'A ordem máxima é 9999.' });

/**
 * Endereço de imagem.
 *
 * Aceita URL absoluta (placeholder, CDN) e caminho começando com `/` (arquivo
 * servido pelo próprio site). Recusar o caminho relativo obrigaria a reescrever
 * o catálogo quando o upload entrar.
 */
const isImageAddress = (value: string) => /^https?:\/\//.test(value) || value.startsWith('/');

const IMAGE_ADDRESS_ERROR = 'Use um endereço começando com http://, https:// ou /.';

export const imageUrlSchema = z
  .string()
  .trim()
  .min(1, { error: 'Informe o endereço da imagem.' })
  .max(600, { error: 'O endereço pode ter no máximo 600 caracteres.' })
  .refine(isImageAddress, { error: IMAGE_ADDRESS_ERROR });

/**
 * Texto opcional vindo de formulário.
 *
 * Campo vazio no navegador chega como `''`, não como ausente. Sem converter para
 * `null` o banco acumularia string vazia, e a interface teria que tratar os dois
 * casos em todo lugar que mostra o texto.
 */
function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, { error: `O texto pode ter no máximo ${max} caracteres.` })
    .transform((value) => (value === '' ? null : value))
    .nullable();
}

const optionalImageUrl = z
  .string()
  .trim()
  .max(600, { error: 'O endereço pode ter no máximo 600 caracteres.' })
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .refine((value) => value === null || isImageAddress(value), { error: IMAGE_ADDRESS_ERROR });

const idSchema = z.uuid({ error: 'Identificador inválido.' });

/** Parâmetro `:id` das rotas de escrita. */
export const idParamsSchema = z.object({ id: idSchema });

/**
 * Resultado de uma exclusão no catálogo (§11.2).
 *
 * Item, combo e estilo já usados não são apagados: viram `active = false`. A
 * resposta diz qual dos dois aconteceu para a interface poder explicar o que
 * ocorreu em vez de dizer "excluído" quando o registro continua lá.
 */
export const deleteResultSchema = z.object({
  outcome: z.enum(['deleted', 'deactivated']),
});

export type DeleteResult = z.infer<typeof deleteResultSchema>;

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------

const categoryNameSchema = z
  .string()
  .trim()
  .min(2, { error: 'Dê um nome à categoria.' })
  .max(60, { error: 'O nome pode ter no máximo 60 caracteres.' });

export const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  sortOrder: z.number().int(),
});

export const createCategoryBodySchema = z.object({
  name: categoryNameSchema,
  sortOrder: sortOrderSchema.default(0),
});

export const updateCategoryBodySchema = z.object({
  name: categoryNameSchema.optional(),
  sortOrder: sortOrderSchema.optional(),
});

export type Category = z.infer<typeof categorySchema>;
export type CreateCategoryBody = z.infer<typeof createCategoryBodySchema>;
export type UpdateCategoryBody = z.infer<typeof updateCategoryBodySchema>;

// ---------------------------------------------------------------------------
// Estilos de festa (§15)
// ---------------------------------------------------------------------------

const themeNameSchema = z
  .string()
  .trim()
  .min(2, { error: 'Dê um nome ao estilo.' })
  .max(80, { error: 'O nome pode ter no máximo 80 caracteres.' });

export const themeSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  tagline: z.string().nullable(),
  description: z.string().nullable(),
  palette: paletteSchema,
  coverImageUrl: z.string().nullable(),
  sortOrder: z.number().int(),
});

export const adminThemeSchema = themeSchema.extend({ active: z.boolean() });

/**
 * O `slug` não entra no corpo: a API deriva do nome na criação (§13 lista o
 * formulário de estilo sem esse campo) e nunca muda depois, porque ele é o que
 * aparece na URL da vitrine.
 */
export const createThemeBodySchema = z.object({
  name: themeNameSchema,
  tagline: optionalText(120).default(null),
  description: optionalText(600).default(null),
  palette: paletteSchema,
  coverImageUrl: optionalImageUrl.default(null),
  sortOrder: sortOrderSchema.default(0),
  active: z.boolean().default(true),
});

export const updateThemeBodySchema = z.object({
  name: themeNameSchema.optional(),
  tagline: optionalText(120).optional(),
  description: optionalText(600).optional(),
  palette: paletteSchema.optional(),
  coverImageUrl: optionalImageUrl.optional(),
  sortOrder: sortOrderSchema.optional(),
  active: z.boolean().optional(),
});

export type Theme = z.infer<typeof themeSchema>;
export type AdminTheme = z.infer<typeof adminThemeSchema>;
export type CreateThemeBody = z.infer<typeof createThemeBodySchema>;
export type UpdateThemeBody = z.infer<typeof updateThemeBodySchema>;

// ---------------------------------------------------------------------------
// Itens do pegue e monte
// ---------------------------------------------------------------------------

const itemNameSchema = z
  .string()
  .trim()
  .min(2, { error: 'Dê um nome ao item.' })
  .max(120, { error: 'O nome pode ter no máximo 120 caracteres.' });

/** Unidades disponíveis **por dia** (§9.3). */
const stockSchema = z
  .number()
  .int({ error: 'O estoque deve ser um número inteiro.' })
  .min(0, { error: 'O estoque não pode ser negativo.' })
  .max(9999, { error: 'O estoque máximo é 9999.' });

export const catalogItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  priceCents: centsSchema,
  stock: z.number().int(),
  assemblyNotes: z.string().nullable(),
  sortOrder: z.number().int(),
  category: categorySchema,
  /** Estilos a que o item pertence, usados para filtrar a vitrine. */
  themeIds: z.array(z.string()),
});

export const adminItemSchema = catalogItemSchema.extend({ active: z.boolean() });

export const createItemBodySchema = z.object({
  categoryId: idSchema,
  name: itemNameSchema,
  description: optionalText(600).default(null),
  imageUrl: optionalImageUrl.default(null),
  priceCents: centsSchema,
  stock: stockSchema,
  assemblyNotes: optionalText(600).default(null),
  themeIds: z.array(idSchema).default([]),
  sortOrder: sortOrderSchema.default(0),
  active: z.boolean().default(true),
});

export const updateItemBodySchema = z.object({
  categoryId: idSchema.optional(),
  name: itemNameSchema.optional(),
  description: optionalText(600).optional(),
  imageUrl: optionalImageUrl.optional(),
  priceCents: centsSchema.optional(),
  stock: stockSchema.optional(),
  assemblyNotes: optionalText(600).optional(),
  themeIds: z.array(idSchema).optional(),
  sortOrder: sortOrderSchema.optional(),
  active: z.boolean().optional(),
});

/** Filtros da vitrine (§11.2). */
export const itemsQuerySchema = z.object({
  themeId: idSchema.optional(),
  categoryId: idSchema.optional(),
});

export type CatalogItem = z.infer<typeof catalogItemSchema>;
export type AdminItem = z.infer<typeof adminItemSchema>;
export type CreateItemBody = z.infer<typeof createItemBodySchema>;
export type UpdateItemBody = z.infer<typeof updateItemBodySchema>;
export type ItemsQuery = z.infer<typeof itemsQuerySchema>;

// ---------------------------------------------------------------------------
// Galeria
// ---------------------------------------------------------------------------

/** Texto alternativo é obrigatório: acessibilidade e SEO (§8, §18). */
const altSchema = z
  .string()
  .trim()
  .min(3, { error: 'Descreva a imagem para quem não pode vê-la.' })
  .max(200, { error: 'A descrição pode ter no máximo 200 caracteres.' });

export const galleryImageSchema = z.object({
  id: z.string(),
  kind: galleryKindSchema,
  url: z.string(),
  alt: z.string(),
  caption: z.string().nullable(),
  sortOrder: z.number().int(),
});

export const adminGalleryImageSchema = galleryImageSchema.extend({ active: z.boolean() });

export const createGalleryImageBodySchema = z.object({
  kind: galleryKindSchema,
  url: imageUrlSchema,
  alt: altSchema,
  caption: optionalText(200).default(null),
  sortOrder: sortOrderSchema.default(0),
  active: z.boolean().default(true),
});

export const updateGalleryImageBodySchema = z.object({
  kind: galleryKindSchema.optional(),
  url: imageUrlSchema.optional(),
  alt: altSchema.optional(),
  caption: optionalText(200).optional(),
  sortOrder: sortOrderSchema.optional(),
  active: z.boolean().optional(),
});

/**
 * Reordenação de uma seção da galeria.
 *
 * Manda a seção e a lista completa de ids dela, na ordem desejada. Exigir a lista
 * completa é o que permite detectar tela desatualizada: se a seção tiver uma
 * imagem que não está na lista, ela iria para o começo sem ninguém pedir.
 */
export const reorderGalleryBodySchema = z.object({
  kind: galleryKindSchema,
  ids: z.array(idSchema).min(1, { error: 'Informe a ordem das imagens.' }),
});

export const galleryQuerySchema = z.object({ kind: galleryKindSchema.optional() });

export type GalleryImage = z.infer<typeof galleryImageSchema>;
export type AdminGalleryImage = z.infer<typeof adminGalleryImageSchema>;
export type CreateGalleryImageBody = z.infer<typeof createGalleryImageBodySchema>;
export type UpdateGalleryImageBody = z.infer<typeof updateGalleryImageBodySchema>;
export type ReorderGalleryBody = z.infer<typeof reorderGalleryBodySchema>;
export type GalleryQuery = z.infer<typeof galleryQuerySchema>;
