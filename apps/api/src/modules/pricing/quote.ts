import type { DiscountType } from '@chacara/shared';
import { type ISODate, dayOfWeek } from '../../lib/dates.js';
import { clampToZero, percentOfCents, sumCents } from '../../lib/money.js';

/**
 * Cálculo de preço (§9.4, §9.5 e §9.6).
 *
 * Função pura, sem Prisma: recebe as regras e o carrinho já carregados e devolve o
 * orçamento. Isso é o que permite `POST /pricing/quote` e `POST /bookings` usarem
 * exatamente o mesmo cálculo (§9.7) — o cliente nunca paga um valor que não viu.
 *
 * Todo valor é inteiro em centavos (§7.2), e o arredondamento acontece no
 * desconto, nunca no total.
 */

// ---------------------------------------------------------------------------
// Diária (§9.4)
// ---------------------------------------------------------------------------

/** Regra de preço já filtrada por `active`, com datas como 'YYYY-MM-DD'. */
export type PriceRuleDef = {
  id: string;
  name: string;
  /** 0 (domingo) a 6 (sábado); nulo vale para qualquer dia. */
  dayOfWeek: number | null;
  /** Nulo significa aberto naquela ponta. */
  startDate: ISODate | null;
  endDate: ISODate | null;
  priceCents: number;
  priority: number;
};

export type DailyPrice = {
  date: ISODate;
  priceCents: number;
  /** Nulo quando nenhuma regra se aplicou e valeu a diária base. */
  ruleName: string | null;
};

function isApplicable(rule: PriceRuleDef, date: ISODate): boolean {
  if (rule.dayOfWeek !== null && rule.dayOfWeek !== dayOfWeek(date)) return false;

  // String ISO compara igual a data, então não precisa converter (§7.3).
  if (rule.startDate !== null && date < rule.startDate) return false;
  if (rule.endDate !== null && date > rule.endDate) return false;

  return true;
}

/** Regra com período é mais específica que uma que valha para sempre (§9.4). */
function hasPeriod(rule: PriceRuleDef): boolean {
  return rule.startDate !== null || rule.endDate !== null;
}

/**
 * Ordem de desempate da §9.4: maior prioridade, depois a mais específica, depois
 * o menor id. O último critério existe só para o resultado ser determinístico —
 * duas regras idênticas não podem produzir preços diferentes entre execuções.
 */
function byPrecedence(a: PriceRuleDef, b: PriceRuleDef): number {
  if (a.priority !== b.priority) return b.priority - a.priority;

  const specificity = Number(hasPeriod(b)) - Number(hasPeriod(a));
  if (specificity !== 0) return specificity;

  return a.id.localeCompare(b.id);
}

export function resolveDailyPrice(
  date: ISODate,
  rules: readonly PriceRuleDef[],
  baseDailyPriceCents: number,
): DailyPrice {
  const winner = rules.filter((rule) => isApplicable(rule, date)).sort(byPrecedence)[0];

  if (!winner) return { date, priceCents: baseDailyPriceCents, ruleName: null };

  return { date, priceCents: winner.priceCents, ruleName: winner.name };
}

// ---------------------------------------------------------------------------
// Combos (§9.6)
// ---------------------------------------------------------------------------

export type CartLine = {
  itemId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
};

export type ComboDef = {
  id: string;
  name: string;
  discountType: DiscountType;
  /** PERCENT: 1 a 100. FIXED_PRICE: centavos do combo fechado. */
  discountValue: number;
  items: readonly { itemId: string; quantity: number }[];
};

export type AppliedCombo = {
  comboId: string;
  name: string;
  /** Quantas vezes o combo caberia no pedido. */
  times: number;
  discountCents: number;
};

export type ComboResult = {
  applied: AppliedCombo[];
  discountTotalCents: number;
};

/**
 * Escolhe e aplica os combos.
 *
 * Cada unidade de item participa de **no máximo um** combo: por isso o algoritmo
 * consome o saldo do pedido a cada aplicação, em vez de somar descontos sobre o
 * mesmo item. Um combo pode repetir se a quantidade permitir (dois kits iguais =
 * duas aplicações).
 *
 * A escolha é gulosa pela maior economia, com empate no menor id. Não é ótima em
 * todos os casos — dois combos disputando um item raro podem levar a um total
 * maior que o da combinação ideal. A §9.6 aceita isso no MVP, e há teste fixando o
 * comportamento; se virar problema real, o número de combos ativos é pequeno o
 * bastante para uma busca exaustiva.
 */
export function applyCombos(lines: readonly CartLine[], combos: readonly ComboDef[]): ComboResult {
  const remaining = new Map(lines.map((line) => [line.itemId, line.quantity]));
  const unitPrice = new Map(lines.map((line) => [line.itemId, line.unitPriceCents]));
  const applied = new Map<string, AppliedCombo>();

  const fits = (combo: ComboDef) =>
    combo.items.length > 0 &&
    combo.items.every((item) => (remaining.get(item.itemId) ?? 0) >= item.quantity);

  const savingOf = (combo: ComboDef) => {
    const base = sumCents(
      combo.items.map((item) => item.quantity * (unitPrice.get(item.itemId) ?? 0)),
    );

    const discount =
      combo.discountType === 'PERCENT'
        ? percentOfCents(base, combo.discountValue)
        : base - combo.discountValue;

    // Preço fechado acima da soma dos itens não vira crédito (§9.6).
    return clampToZero(discount);
  };

  // Ordem estável por id: é o que torna o desempate previsível mais abaixo.
  const candidates = [...combos].sort((a, b) => a.id.localeCompare(b.id));

  for (;;) {
    let best: { combo: ComboDef; saving: number } | null = null;

    for (const combo of candidates) {
      if (!fits(combo)) continue;

      const saving = savingOf(combo);
      // `>` e não `>=`: em empate, o primeiro da ordem por id vence.
      if (saving > 0 && (!best || saving > best.saving)) best = { combo, saving };
    }

    if (!best) break;

    for (const item of best.combo.items) {
      remaining.set(item.itemId, (remaining.get(item.itemId) ?? 0) - item.quantity);
    }

    const previous = applied.get(best.combo.id);
    applied.set(best.combo.id, {
      comboId: best.combo.id,
      name: best.combo.name,
      times: (previous?.times ?? 0) + 1,
      discountCents: (previous?.discountCents ?? 0) + best.saving,
    });
  }

  const list = [...applied.values()];

  return {
    applied: list,
    discountTotalCents: sumCents(list.map((entry) => entry.discountCents)),
  };
}

// ---------------------------------------------------------------------------
// Orçamento completo (§9.5)
// ---------------------------------------------------------------------------

export type QuoteLine = CartLine & { totalCents: number };

export type QuoteInput = {
  /** Dias do intervalo, inclusivo nas duas pontas (§7.3). */
  days: readonly ISODate[];
  rules: readonly PriceRuleDef[];
  baseDailyPriceCents: number;
  lines: readonly CartLine[];
  combos: readonly ComboDef[];
};

export type Quote = {
  days: DailyPrice[];
  dailyTotalCents: number;
  lines: QuoteLine[];
  itemsTotalCents: number;
  combos: AppliedCombo[];
  discountTotalCents: number;
  totalCents: number;
};

export function computeQuote({
  days,
  rules,
  baseDailyPriceCents,
  lines,
  combos,
}: QuoteInput): Quote {
  const dailyPrices = days.map((date) => resolveDailyPrice(date, rules, baseDailyPriceCents));
  const dailyTotalCents = sumCents(dailyPrices.map((day) => day.priceCents));

  /*
   * Item é cobrado **uma vez pelo período**, não por dia (§9.5 e suposição 5 da
   * §23). Se o dono passar a cobrar por dia, é aqui que entra a multiplicação
   * pelo número de dias.
   */
  const quoteLines: QuoteLine[] = lines.map((line) => ({
    ...line,
    totalCents: line.quantity * line.unitPriceCents,
  }));
  const itemsTotalCents = sumCents(quoteLines.map((line) => line.totalCents));

  const { applied, discountTotalCents } = applyCombos(lines, combos);

  return {
    days: dailyPrices,
    dailyTotalCents,
    lines: quoteLines,
    itemsTotalCents,
    combos: applied,
    discountTotalCents,
    // O desconto nunca passa da soma dos itens do combo, então o total não
    // deveria ficar negativo; o limite fica explícito para a regra não depender
    // de quem chama ter validado os valores de entrada.
    totalCents: clampToZero(dailyTotalCents + itemsTotalCents - discountTotalCents),
  };
}
