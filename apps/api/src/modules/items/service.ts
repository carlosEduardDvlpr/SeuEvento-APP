import type {
  AdminItem,
  CatalogItem,
  CreateItemBody,
  DeleteResult,
  ItemsQuery,
  Pagination,
  UpdateItemBody,
} from '@chacara/shared';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { AppError, fieldError } from '../../lib/errors.js';

/**
 * Itens do pegue e monte (§11.2).
 *
 * O item carrega a categoria e os estilos porque a vitrine filtra por eles, e
 * fazer o SPA juntar três listas para montar um cartão só criaria oportunidade de
 * divergência.
 */

/** O que a resposta precisa: a categoria inteira e só o id dos estilos. */
const ITEM_INCLUDE = {
  category: true,
  themes: { select: { themeId: true } },
} satisfies Prisma.ItemInclude;

type ItemRow = Prisma.ItemGetPayload<{ include: typeof ITEM_INCLUDE }>;

/**
 * Ordem da vitrine: categoria do admin, depois a ordem dentro da categoria.
 *
 * O nome fecha o desempate porque o `sortOrder` nasce 0 em todo item, e sem ele a
 * lista mudaria de ordem a cada consulta.
 */
const ITEM_ORDER = [
  { category: { sortOrder: 'asc' as const } },
  { sortOrder: 'asc' as const },
  { name: 'asc' as const },
];

function toCatalogItem(row: ItemRow): CatalogItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    imageUrl: row.imageUrl,
    priceCents: row.priceCents,
    stock: row.stock,
    assemblyNotes: row.assemblyNotes,
    sortOrder: row.sortOrder,
    category: {
      id: row.category.id,
      name: row.category.name,
      sortOrder: row.category.sortOrder,
    },
    themeIds: row.themes.map((link) => link.themeId),
  };
}

function toAdminItem(row: ItemRow): AdminItem {
  return { ...toCatalogItem(row), active: row.active };
}

function filterOf(query: ItemsQuery): Prisma.ItemWhereInput {
  return {
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    // Vínculo em tabela de ligação: `some` é a única forma de filtrar por ele.
    ...(query.themeId ? { themes: { some: { themeId: query.themeId } } } : {}),
  };
}

export async function listPublicItems(
  prisma: PrismaClient,
  query: ItemsQuery,
): Promise<CatalogItem[]> {
  const rows = await prisma.item.findMany({
    where: { active: true, ...filterOf(query) },
    include: ITEM_INCLUDE,
    orderBy: ITEM_ORDER,
  });

  return rows.map(toCatalogItem);
}

/**
 * Lista do admin: inclui o que está desativado, e é paginada (§11.1).
 *
 * A vitrine não pagina porque o cliente precisa ver o catálogo inteiro para
 * escolher; o painel pagina porque a tabela cresce com o tempo.
 */
export async function listAdminItems(
  prisma: PrismaClient,
  query: ItemsQuery & Pagination,
): Promise<{ items: AdminItem[]; total: number; page: number; pageSize: number }> {
  const where = filterOf(query);

  const [rows, total] = await Promise.all([
    prisma.item.findMany({
      where,
      include: ITEM_INCLUDE,
      orderBy: ITEM_ORDER,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.item.count({ where }),
  ]);

  return { items: rows.map(toAdminItem), total, page: query.page, pageSize: query.pageSize };
}

export async function getAdminItem(prisma: PrismaClient, id: string): Promise<AdminItem> {
  const row = await prisma.item.findUnique({ where: { id }, include: ITEM_INCLUDE });

  if (!row) throw new AppError('NOT_FOUND', 404, 'Item não encontrado.');

  return toAdminItem(row);
}

/**
 * Confere categoria e estilos antes de escrever.
 *
 * Sem isso, um id inexistente viraria violação de chave estrangeira, ou seja, um
 * 500 genérico em vez de um campo marcado no formulário.
 */
async function assertReferencesExist(
  prisma: PrismaClient,
  references: { categoryId?: string; themeIds?: string[] },
) {
  if (references.categoryId !== undefined) {
    const category = await prisma.category.count({ where: { id: references.categoryId } });
    if (category === 0) throw fieldError('categoryId', 'Escolha uma categoria da lista.');
  }

  if (references.themeIds !== undefined && references.themeIds.length > 0) {
    const ids = [...new Set(references.themeIds)];
    const found = await prisma.theme.count({ where: { id: { in: ids } } });
    if (found !== ids.length) throw fieldError('themeIds', 'Um dos estilos escolhidos não existe.');
  }
}

/** Ids repetidos no formulário viram um só: a ligação é `@@id([itemId, themeId])`. */
function themeLinks(themeIds: string[]) {
  return [...new Set(themeIds)].map((themeId) => ({ themeId }));
}

export async function createItem(prisma: PrismaClient, body: CreateItemBody): Promise<AdminItem> {
  const { themeIds, ...fields } = body;

  await assertReferencesExist(prisma, { categoryId: fields.categoryId, themeIds });

  const row = await prisma.item.create({
    data: { ...fields, themes: { create: themeLinks(themeIds) } },
    include: ITEM_INCLUDE,
  });

  return toAdminItem(row);
}

export async function updateItem(
  prisma: PrismaClient,
  id: string,
  body: UpdateItemBody,
): Promise<AdminItem> {
  await getAdminItem(prisma, id);

  const { themeIds, ...fields } = body;

  await assertReferencesExist(prisma, { categoryId: fields.categoryId, themeIds });

  /*
   * Estilos são substituídos, não mesclados: o formulário manda a seleção
   * completa, então "não está na lista" significa "foi desmarcado". Apagar e
   * recriar é mais simples que calcular a diferença, e a tabela de ligação não
   * guarda nada além do par de ids.
   */
  const row = await prisma.$transaction(async (tx) => {
    if (themeIds !== undefined) {
      await tx.itemTheme.deleteMany({ where: { itemId: id } });
      await tx.itemTheme.createMany({
        data: themeLinks(themeIds).map((link) => ({ itemId: id, ...link })),
      });
    }

    return tx.item.update({ where: { id }, data: fields, include: ITEM_INCLUDE });
  });

  return toAdminItem(row);
}

/**
 * Exclui, ou desativa se o item já foi usado (§11.2).
 *
 * "Usado" é aparecer em reserva (o histórico não pode perder o item) ou em combo
 * (apagar mudaria a definição do combo sem o dono pedir). Nos dois casos o banco
 * recusaria a exclusão por chave estrangeira; desativar é a resposta útil.
 */
export async function deleteItem(prisma: PrismaClient, id: string): Promise<DeleteResult> {
  await getAdminItem(prisma, id);

  const [inBookings, inCombos] = await Promise.all([
    prisma.bookingItem.count({ where: { itemId: id } }),
    prisma.comboItem.count({ where: { itemId: id } }),
  ]);

  if (inBookings > 0 || inCombos > 0) {
    await prisma.item.update({ where: { id }, data: { active: false } });
    return { outcome: 'deactivated' };
  }

  // Os vínculos com estilos apagam em cascata (§8).
  await prisma.item.delete({ where: { id } });
  return { outcome: 'deleted' };
}
