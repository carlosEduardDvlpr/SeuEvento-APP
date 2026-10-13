import type {
  AdminCombo,
  Combo,
  ComboPreview,
  ComboPreviewBody,
  CombosQuery,
  CreateComboBody,
  DeleteResult,
  UpdateComboBody,
} from '@chacara/shared';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { AppError, fieldError } from '../../lib/errors.js';
import { comboValue } from '../pricing/quote.js';

/**
 * Combos: conjuntos de itens com desconto quando levados juntos (§9.6).
 *
 * A resposta já traz a soma dos itens, a economia e o que o cliente paga. Esses
 * três números saem do **mesmo** `comboValue` que o orçamento usa, então a
 * prévia do painel (§13) e a vitrine nunca mostram uma economia diferente da que
 * o cliente vai receber.
 */

const COMBO_INCLUDE = {
  items: {
    include: { item: { select: { id: true, name: true, priceCents: true, active: true } } },
  },
} satisfies Prisma.ComboInclude;

type ComboRow = Prisma.ComboGetPayload<{ include: typeof COMBO_INCLUDE }>;

/** Nome desempata porque `Combo` não tem coluna de ordem. */
const COMBO_ORDER = [{ name: 'asc' as const }];

function totalsOf(row: ComboRow) {
  const prices = new Map(row.items.map((line) => [line.itemId, line.item.priceCents]));

  return comboValue(
    {
      id: row.id,
      name: row.name,
      discountType: row.discountType,
      discountValue: row.discountValue,
      items: row.items.map((line) => ({ itemId: line.itemId, quantity: line.quantity })),
    },
    (itemId) => prices.get(itemId) ?? 0,
  );
}

function toCombo(row: ComboRow): Combo {
  const { baseCents, discountCents, priceCents } = totalsOf(row);

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    imageUrl: row.imageUrl,
    themeId: row.themeId,
    discountType: row.discountType,
    discountValue: row.discountValue,
    items: row.items.map((line) => ({
      itemId: line.itemId,
      name: line.item.name,
      quantity: line.quantity,
      unitPriceCents: line.item.priceCents,
      totalCents: line.quantity * line.item.priceCents,
    })),
    itemsTotalCents: baseCents,
    discountCents,
    priceCents,
  };
}

function toAdminCombo(row: ComboRow): AdminCombo {
  // Mapa por id em vez de índice: a forma pública não promete ordem alguma.
  const activeByItem = new Map(row.items.map((line) => [line.itemId, line.item.active]));

  const combo = toCombo(row);
  const items = combo.items.map((line) => ({
    ...line,
    active: activeByItem.get(line.itemId) ?? false,
  }));

  return {
    ...combo,
    items,
    active: row.active,
    // Item desativado impede o combo de ser montado (§9.3).
    available: items.length > 0 && items.every((line) => line.active),
  };
}

/**
 * Vitrine de combos (§11.2).
 *
 * Esconde combo com item desativado: oferecer o que não pode ser montado só
 * produz pedido recusado no fim do wizard, depois de a pessoa já ter escolhido a
 * data.
 */
export async function listPublicCombos(prisma: PrismaClient, query: CombosQuery): Promise<Combo[]> {
  const rows = await prisma.combo.findMany({
    where: {
      active: true,
      ...(query.themeId ? { themeId: query.themeId } : {}),
      // Pelo menos um item e nenhum inativo.
      items: { some: {}, every: { item: { active: true } } },
    },
    include: COMBO_INCLUDE,
    orderBy: COMBO_ORDER,
  });

  return rows.map(toCombo);
}

export async function listAdminCombos(prisma: PrismaClient): Promise<AdminCombo[]> {
  const rows = await prisma.combo.findMany({ include: COMBO_INCLUDE, orderBy: COMBO_ORDER });
  return rows.map(toAdminCombo);
}

export async function getAdminCombo(prisma: PrismaClient, id: string): Promise<AdminCombo> {
  const row = await prisma.combo.findUnique({ where: { id }, include: COMBO_INCLUDE });

  if (!row) throw new AppError('NOT_FOUND', 404, 'Combo não encontrado.');

  return toAdminCombo(row);
}

/** Id velho viraria violação de chave estrangeira, ou seja, 500 genérico. */
async function assertReferencesExist(
  prisma: PrismaClient,
  references: { themeId?: string | null; itemIds?: string[] },
) {
  if (references.themeId) {
    const theme = await prisma.theme.count({ where: { id: references.themeId } });
    if (theme === 0) throw fieldError('themeId', 'Escolha um estilo da lista.');
  }

  if (references.itemIds !== undefined && references.itemIds.length > 0) {
    const found = await prisma.item.count({ where: { id: { in: references.itemIds } } });
    if (found !== references.itemIds.length) {
      throw fieldError('items', 'Um dos itens escolhidos não existe.');
    }
  }
}

/**
 * Prévia da economia, sem salvar (§13).
 *
 * Existe para o formulário do painel mostrar "soma dos itens R$ X, o cliente paga
 * R$ Y" **antes** de o combo existir. É o mesmo `comboValue` do orçamento, então
 * não há uma segunda implementação da regra da §9.6 para divergir: calcular isso
 * no front duplicaria o arredondamento do percentual e o piso do preço fechado.
 */
export async function previewCombo(
  prisma: PrismaClient,
  body: ComboPreviewBody,
): Promise<ComboPreview> {
  const rows = await prisma.item.findMany({
    where: { id: { in: body.items.map((item) => item.itemId) } },
    select: { id: true, priceCents: true },
  });

  const prices = new Map(rows.map((row) => [row.id, row.priceCents]));

  // Item que não existe entra valendo zero: a prévia não é lugar de recusar o
  // formulário, e o POST de verdade já aponta o campo.
  const { baseCents, discountCents, priceCents } = comboValue(
    { id: 'preview', name: 'preview', ...body },
    (itemId) => prices.get(itemId) ?? 0,
  );

  return { itemsTotalCents: baseCents, discountCents, priceCents };
}

export async function createCombo(
  prisma: PrismaClient,
  body: CreateComboBody,
): Promise<AdminCombo> {
  const { items, ...fields } = body;

  await assertReferencesExist(prisma, {
    themeId: fields.themeId,
    itemIds: items.map((item) => item.itemId),
  });

  const row = await prisma.combo.create({
    data: { ...fields, items: { create: items } },
    include: COMBO_INCLUDE,
  });

  return toAdminCombo(row);
}

export async function updateCombo(
  prisma: PrismaClient,
  id: string,
  body: UpdateComboBody,
): Promise<AdminCombo> {
  await getAdminCombo(prisma, id);

  const { items, ...fields } = body;

  await assertReferencesExist(prisma, {
    themeId: fields.themeId,
    itemIds: items?.map((item) => item.itemId),
  });

  /*
   * A composição é substituída, não mesclada: o formulário manda o combo inteiro,
   * então item que não veio foi removido. Apagar e recriar é mais simples que
   * calcular a diferença, e `ComboItem` só guarda o par de ids mais a quantidade.
   */
  const row = await prisma.$transaction(async (tx) => {
    if (items !== undefined) {
      await tx.comboItem.deleteMany({ where: { comboId: id } });
      await tx.comboItem.createMany({ data: items.map((item) => ({ comboId: id, ...item })) });
    }

    return tx.combo.update({ where: { id }, data: fields, include: COMBO_INCLUDE });
  });

  return toAdminCombo(row);
}

/**
 * Exclui, ou desativa se o combo já foi aplicado em alguma reserva (§11.2).
 *
 * A reserva guarda o combo num snapshot JSON (`appliedCombos`), não por chave
 * estrangeira, então o banco não impede a exclusão e o histórico continuaria
 * legível. Ainda assim o combo é mantido desativado: o dono precisa poder abrir a
 * reserva antiga e ver o combo que concedeu aquele desconto.
 */
export async function deleteCombo(prisma: PrismaClient, id: string): Promise<DeleteResult> {
  await getAdminCombo(prisma, id);

  const used = await prisma.booking.count({
    where: { appliedCombos: { array_contains: [{ comboId: id }] } },
  });

  if (used > 0) {
    await prisma.combo.update({ where: { id }, data: { active: false } });
    return { outcome: 'deactivated' };
  }

  // Os `ComboItem` apagam em cascata (§8).
  await prisma.combo.delete({ where: { id } });
  return { outcome: 'deleted' };
}
