import {
  type AdminTheme,
  type CreateThemeBody,
  type DeleteResult,
  type Theme,
  type UpdateThemeBody,
  paletteSchema,
} from '@chacara/shared';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { ThemeModel } from '../../generated/prisma/models.js';
import { AppError } from '../../lib/errors.js';

/**
 * Estilos de festa (§15).
 *
 * O estilo agrupa itens e combos e é o filtro principal da vitrine, então o
 * `slug` precisa ser estável: ele é derivado do nome **na criação** e nunca muda,
 * mesmo que o nome mude depois. Trocar o slug quebraria link compartilhado.
 */

/** Ordem do admin primeiro; nome desempata para a lista não dançar entre cargas. */
const THEME_ORDER = [{ sortOrder: 'asc' as const }, { name: 'asc' as const }];

/**
 * A paleta é `Json` no banco, então o tipo não garante nada: validamos na leitura.
 *
 * Paleta fora do formato só chega aí por escrita direta no banco, e é melhor o
 * erro aparecer aqui do que virar `undefined` no cartão de estilo.
 */
function parsePalette(themeName: string, value: unknown) {
  const result = paletteSchema.safeParse(value);

  if (!result.success) {
    throw new AppError('INTERNAL', 500, `A paleta do estilo "${themeName}" está inválida.`);
  }

  return result.data;
}

function toTheme(row: ThemeModel): Theme {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    description: row.description,
    palette: parsePalette(row.name, row.palette),
    coverImageUrl: row.coverImageUrl,
    sortOrder: row.sortOrder,
  };
}

function toAdminTheme(row: ThemeModel): AdminTheme {
  return { ...toTheme(row), active: row.active };
}

export async function listPublicThemes(prisma: PrismaClient): Promise<Theme[]> {
  const rows = await prisma.theme.findMany({ where: { active: true }, orderBy: THEME_ORDER });
  return rows.map(toTheme);
}

export async function listAdminThemes(prisma: PrismaClient): Promise<AdminTheme[]> {
  const rows = await prisma.theme.findMany({ orderBy: THEME_ORDER });
  return rows.map(toAdminTheme);
}

/**
 * Nome vira slug: sem acento, minúsculas, hífen no lugar do resto.
 *
 * `Rústico Boho` → `rustico-boho`, que é a forma dos slugs da §15.2.
 */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Resolve o slug livre.
 *
 * Dois estilos podem se chamar parecido ("Tropical" e "Tropical!"), e o slug é
 * único no banco. Em vez de recusar o cadastro por um detalhe de URL, acrescenta
 * sufixo numérico.
 */
async function availableSlug(prisma: PrismaClient, name: string): Promise<string> {
  const base = slugify(name) || 'estilo';

  const taken = await prisma.theme.findMany({
    where: { slug: { startsWith: base } },
    select: { slug: true },
  });
  const used = new Set(taken.map((row) => row.slug));

  if (!used.has(base)) return base;

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }

  throw new AppError('VALIDATION_ERROR', 400, 'Escolha um nome mais distinto para o estilo.');
}

export async function createTheme(
  prisma: PrismaClient,
  body: CreateThemeBody,
): Promise<AdminTheme> {
  const row = await prisma.theme.create({
    data: { ...body, slug: await availableSlug(prisma, body.name) },
  });

  return toAdminTheme(row);
}

export async function updateTheme(
  prisma: PrismaClient,
  id: string,
  body: UpdateThemeBody,
): Promise<AdminTheme> {
  await findThemeOrThrow(prisma, id);

  // O slug não está no corpo e não é recalculado: ele é o endereço do estilo.
  const row = await prisma.theme.update({ where: { id }, data: body });

  return toAdminTheme(row);
}

/**
 * Exclui, ou desativa se o estilo já foi usado (§11.2).
 *
 * "Usado" aqui é ter item vinculado ou combo apontando para ele. O vínculo
 * item-estilo apaga em cascata, então o banco deixaria a exclusão passar e levaria
 * embora, em silêncio, a curadoria que o dono levou tempo para montar. Estilo
 * recém-criado por engano não tem nem item nem combo, e esse é justamente o caso
 * em que apagar de verdade importa.
 */
export async function deleteTheme(prisma: PrismaClient, id: string): Promise<DeleteResult> {
  await findThemeOrThrow(prisma, id);

  const [itemLinks, combos] = await Promise.all([
    prisma.itemTheme.count({ where: { themeId: id } }),
    prisma.combo.count({ where: { themeId: id } }),
  ]);

  if (itemLinks > 0 || combos > 0) {
    await prisma.theme.update({ where: { id }, data: { active: false } });
    return { outcome: 'deactivated' };
  }

  await prisma.theme.delete({ where: { id } });
  return { outcome: 'deleted' };
}

async function findThemeOrThrow(prisma: PrismaClient, id: string) {
  const row = await prisma.theme.findUnique({ where: { id } });

  if (!row) throw new AppError('NOT_FOUND', 404, 'Estilo não encontrado.');

  return row;
}
