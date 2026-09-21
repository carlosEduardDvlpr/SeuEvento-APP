import type { Category, CreateCategoryBody, UpdateCategoryBody } from '@chacara/shared';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { CategoryModel } from '../../generated/prisma/models.js';
import { AppError, fieldError, isUniqueViolation } from '../../lib/errors.js';

/**
 * Categorias do catálogo (§11.2, agrupadas com os itens).
 *
 * Categoria não tem `active`: ela é a gaveta onde o item mora, e uma gaveta
 * desativada com item dentro deixaria o item sem lugar na vitrine. Por isso a
 * exclusão é recusada enquanto houver item, em vez de virar desativação.
 */

function toCategory(row: CategoryModel): Category {
  return { id: row.id, name: row.name, sortOrder: row.sortOrder };
}

/** Ordem do admin primeiro, nome como desempate para a lista não dançar. */
const CATEGORY_ORDER = [{ sortOrder: 'asc' as const }, { name: 'asc' as const }];

export async function listCategories(prisma: PrismaClient): Promise<Category[]> {
  const rows = await prisma.category.findMany({ orderBy: CATEGORY_ORDER });
  return rows.map(toCategory);
}

/** O nome é único no banco; traduzimos a violação para erro de campo. */
function rethrowDuplicateName(error: unknown): never {
  if (isUniqueViolation(error)) {
    throw fieldError('name', 'Já existe uma categoria com esse nome.');
  }

  throw error;
}

export async function createCategory(
  prisma: PrismaClient,
  body: CreateCategoryBody,
): Promise<Category> {
  try {
    const row = await prisma.category.create({ data: body });
    return toCategory(row);
  } catch (error) {
    rethrowDuplicateName(error);
  }
}

export async function updateCategory(
  prisma: PrismaClient,
  id: string,
  body: UpdateCategoryBody,
): Promise<Category> {
  await findCategoryOrThrow(prisma, id);

  try {
    const row = await prisma.category.update({ where: { id }, data: body });
    return toCategory(row);
  } catch (error) {
    rethrowDuplicateName(error);
  }
}

export async function deleteCategory(prisma: PrismaClient, id: string): Promise<void> {
  await findCategoryOrThrow(prisma, id);

  const itemCount = await prisma.item.count({ where: { categoryId: id } });

  if (itemCount > 0) {
    throw new AppError(
      'VALIDATION_ERROR',
      400,
      'Esta categoria ainda tem itens. Mova os itens para outra categoria antes de excluir.',
      { itemCount },
    );
  }

  await prisma.category.delete({ where: { id } });
}

async function findCategoryOrThrow(prisma: PrismaClient, id: string) {
  const row = await prisma.category.findUnique({ where: { id } });

  if (!row) throw new AppError('NOT_FOUND', 404, 'Categoria não encontrada.');

  return row;
}
