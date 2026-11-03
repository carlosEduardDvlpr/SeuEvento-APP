import type { ItemsAvailability, ItemsAvailabilityQuery } from '@chacara/shared';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Db } from '../../lib/db.js';
import { type ISODate, eachDay, toISODate } from '../../lib/dates.js';
import {
  activeBookingsFilter,
  assertAvailabilityPeriod,
  findBlockedDaysIn,
  overlappingRangeFilter,
} from '../availability/service.js';

/**
 * Estoque dos itens, dia a dia (§9.3).
 *
 * O `stock` de um item é **por dia**, não pelo período: o mesmo painel pode sair
 * no sábado e voltar para sair no sábado seguinte. Então a conta é
 *
 *   reservado(dia)  = Σ quantidade em reservas ativas que cobrem o dia
 *   disponível(dia) = item.stock - reservado(dia)
 *
 * e o pedido só cabe se a quantidade couber em **todos** os dias do intervalo.
 * Basta um dia apertado para o pedido inteiro não passar.
 *
 * Duas regras da T32 moram aqui:
 *
 * - **As reservas dos dois produtos contam.** O painel que saiu para uma festa na
 *   chácara e o que saiu para uma festa em outro lugar são o mesmo painel. É por
 *   isso que a agenda da decoração não precisa de `booked`: quem decide se o kit
 *   cabe é esta conta.
 * - **Dia com a decoração fechada tem estoque zero.** Quando a dona bloqueia a
 *   decoração num dia (escopo `DECORATION` ou `BOTH`), nenhum item sai — nem
 *   sozinho, nem junto com a chácara. Tratar isso como estoque zero, e não como
 *   regra à parte, faz o orçamento e a criação recusarem pelo mesmo caminho de
 *   sempre (`STOCK_INSUFFICIENT`), com a mesma mensagem que a tela já sabe dar.
 */

export type StockShortage = {
  itemId: string;
  /** Quantas unidades ainda cabem no pior dia do intervalo. Nunca negativo. */
  available: number;
};

export type StockCheckInput = {
  from: ISODate;
  to: ISODate;
  lines: readonly { itemId: string; quantity: number }[];
  /** Reserva a ignorar na conta, ao recalcular uma que já existe. */
  ignoreBookingId?: string;
  now?: Date;
};

/**
 * Quantas unidades de cada item já estão comprometidas em cada dia.
 *
 * Uma consulta só: carrega as linhas de reserva ativa que tocam o intervalo e
 * expande por dia em memória. Fazer isso em SQL exigiria gerar a série de datas
 * à mão, e o intervalo aqui tem no máximo `maxDays` dias.
 */
async function loadReservedPerDay(
  db: Db,
  {
    from,
    to,
    itemIds,
    ignoreBookingId,
    now,
  }: {
    from: ISODate;
    to: ISODate;
    itemIds: string[];
    ignoreBookingId?: string;
    now: Date;
  },
): Promise<Map<string, Map<ISODate, number>>> {
  const rows = await db.bookingItem.findMany({
    where: {
      itemId: { in: itemIds },
      booking: {
        ...activeBookingsFilter(now),
        ...overlappingRangeFilter(from, to),
        ...(ignoreBookingId ? { id: { not: ignoreBookingId } } : {}),
      },
    },
    select: {
      itemId: true,
      quantity: true,
      booking: { select: { startDate: true, endDate: true } },
    },
  });

  const reserved = new Map<string, Map<ISODate, number>>();

  for (const row of rows) {
    const perDay = reserved.get(row.itemId) ?? new Map<ISODate, number>();
    reserved.set(row.itemId, perDay);

    for (const day of eachDay(toISODate(row.booking.startDate), toISODate(row.booking.endDate))) {
      perDay.set(day, (perDay.get(day) ?? 0) + row.quantity);
    }
  }

  return reserved;
}

export type FreeStockInput = {
  itemIds: readonly string[];
  from: ISODate;
  to: ISODate;
  /** Reserva a ignorar na conta, ao recalcular uma que já existe. */
  ignoreBookingId?: string;
  now?: Date;
};

/**
 * Quantas unidades de cada item estão livres em cada dia do intervalo (§9.3).
 *
 * É a conta do topo deste arquivo, dia a dia: o estoque menos o que as reservas
 * ativas dos dois produtos já levaram, e zero no dia em que a decoração está
 * fechada. Nunca negativo: se a dona baixou o estoque depois de reservas já
 * feitas, o dia fica sem unidade livre, e não com unidade "devendo".
 *
 * Mora num lugar só porque três perguntas usam a mesma conta: o pedido cabe
 * (`findStockShortages`), o calendário de uma decoração e o passo de
 * decoração do pedido, que mostra o que ainda está livre no período. Item
 * inexistente simplesmente não aparece no resultado.
 */
export async function freeStockPerDay(
  db: Db,
  { itemIds, from, to, ignoreBookingId, now = new Date() }: FreeStockInput,
): Promise<Map<string, Map<ISODate, number>>> {
  const free = new Map<string, Map<ISODate, number>>();

  if (itemIds.length === 0) return free;

  const ids = [...itemIds];

  const [items, reserved, closedDays] = await Promise.all([
    db.item.findMany({ where: { id: { in: ids } }, select: { id: true, stock: true } }),
    loadReservedPerDay(db, { from, to, itemIds: ids, ignoreBookingId, now }),
    findBlockedDaysIn(db, from, to, 'DECORATION'),
  ]);

  const closed = new Set(closedDays);
  const days = eachDay(from, to);

  for (const item of items) {
    const perDay = reserved.get(item.id);

    free.set(
      item.id,
      new Map(
        days.map((day) => [
          day,
          closed.has(day) ? 0 : Math.max(0, item.stock - (perDay?.get(day) ?? 0)),
        ]),
      ),
    );
  }

  return free;
}

/**
 * Quanto cabe no intervalo inteiro: o pior dia manda (§9.3).
 *
 * O período nunca é vazio (`from <= to` chega validado), então sempre há um dia
 * para comparar.
 */
function worstDay(perDay: ReadonlyMap<ISODate, number>): number {
  return Math.min(...perDay.values());
}

/**
 * Itens do pedido que não cabem no estoque de algum dia (§9.3).
 *
 * Devolve lista vazia quando tudo cabe. Item inexistente ou desativado **não**
 * aparece aqui: isso não é falta de estoque, e quem valida o catálogo é o chamador
 * (um item fora do catálogo é requisição inválida, não indisponibilidade).
 */
export async function findStockShortages(
  db: Db,
  { from, to, lines, ignoreBookingId, now = new Date() }: StockCheckInput,
): Promise<StockShortage[]> {
  if (lines.length === 0) return [];

  const free = await freeStockPerDay(db, {
    itemIds: lines.map((line) => line.itemId),
    from,
    to,
    ignoreBookingId,
    now,
  });

  const shortages: StockShortage[] = [];

  for (const line of lines) {
    const perDay = free.get(line.itemId);

    // Item fora do catálogo é problema do chamador, não escassez.
    if (perDay === undefined) continue;

    // O pior dia manda: o pedido vale pelo intervalo inteiro.
    const available = worstDay(perDay);

    if (line.quantity > available) shortages.push({ itemId: line.itemId, available });
  }

  return shortages;
}

/**
 * Unidades livres de cada decoração ativa no período (novembro de 2026).
 *
 * É o passo de decoração do pedido: quem já escolheu a data vê, em cada
 * cartão, se aquela decoração ainda tem unidade livre para a festa. O número é
 * o do pior dia do período, como na conta do pedido, então o que a tela mostra
 * livre é o que o pedido aceita.
 *
 * Só decoração ativa entra: a vitrine não mostra a desativada, e o número dela
 * não serviria a ninguém.
 */
export async function getItemsAvailability(
  prisma: PrismaClient,
  { from, to }: ItemsAvailabilityQuery,
  now: Date = new Date(),
): Promise<ItemsAvailability> {
  assertAvailabilityPeriod(from, to);

  const items = await prisma.item.findMany({
    where: { active: true },
    select: { id: true },
    orderBy: { id: 'asc' },
  });

  const free = await freeStockPerDay(prisma, {
    itemIds: items.map((item) => item.id),
    from,
    to,
    now,
  });

  return {
    items: items.map((item) => {
      const perDay = free.get(item.id);

      return { itemId: item.id, freeStock: perDay ? worstDay(perDay) : 0 };
    }),
  };
}
