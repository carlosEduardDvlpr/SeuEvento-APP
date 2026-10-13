import type { Db } from '../../lib/db.js';
import { type ISODate, eachDay, toISODate } from '../../lib/dates.js';
import { activeBookingsFilter, overlappingRangeFilter } from '../availability/service.js';

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

  const itemIds = lines.map((line) => line.itemId);

  const [items, reserved] = await Promise.all([
    db.item.findMany({ where: { id: { in: itemIds } }, select: { id: true, stock: true } }),
    loadReservedPerDay(db, { from, to, itemIds, ignoreBookingId, now }),
  ]);

  const stockOf = new Map(items.map((item) => [item.id, item.stock]));
  const days = eachDay(from, to);
  const shortages: StockShortage[] = [];

  for (const line of lines) {
    const stock = stockOf.get(line.itemId);

    // Item fora do catálogo é problema do chamador, não escassez.
    if (stock === undefined) continue;

    const perDay = reserved.get(line.itemId);

    // O pior dia manda: o pedido vale pelo intervalo inteiro.
    const worstAvailable = days.reduce((worst, day) => {
      const free = stock - (perDay?.get(day) ?? 0);
      return free < worst ? free : worst;
    }, stock);

    if (line.quantity > worstAvailable) {
      shortages.push({ itemId: line.itemId, available: Math.max(0, worstAvailable) });
    }
  }

  return shortages;
}
