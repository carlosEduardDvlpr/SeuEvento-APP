import type { BookingKind } from '@chacara/shared';
import { readJSON, removeKey, writeJSON } from '@/lib/storage';

/**
 * Rascunho da reserva (§12.2).
 *
 * Vive num `useReducer` no wizard, e **não é carrinho**: o pedido que a pessoa
 * monta e abandona não fica guardado, e cada escolha vinda da landing começa um
 * pedido novo. Foi pedido do dono (outubro de 2026), depois de um item da
 * vitrine somar com o que tinha sobrado da visita anterior.
 *
 * O que vai para o `sessionStorage` é só o pedido que **chegou à revisão**, e até
 * ele ser enviado. É ali que o envio exige sessão, e quem não está logado é
 * desviado para entrar ou se cadastrar: o desvio recarrega a aplicação, e sem o
 * espelho a pessoa voltaria para um wizard vazio depois de montar o pedido
 * inteiro (§13.2).
 *
 * `sessionStorage` e não `localStorage`: o pedido é desta visita. Guardar por
 * semanas faria a pessoa reencontrar datas que já passaram.
 */

export type DraftItem = { itemId: string; quantity: number };

export type BookingDraft = {
  /**
   * O que a pessoa está reservando (T32): a chácara, com ou sem decoração, ou só
   * a decoração. Começa na chácara, que é o pedido mais comum.
   */
  kind: BookingKind;
  startDate: string | null;
  /** Inclusivo. Igual ao início numa reserva de um dia (§7.3). */
  endDate: string | null;
  /** Só na chácara. Na decoração fica guardado, mas não vai no pedido. */
  guestCount: number | null;
  /** Estilo escolhido no passo de itens. Não vai para a reserva: é só filtro. */
  themeId: string | null;
  items: DraftItem[];
  customerNotes: string;
};

export const EMPTY_DRAFT: BookingDraft = {
  kind: 'VENUE',
  startDate: null,
  endDate: null,
  guestCount: null,
  themeId: null,
  items: [],
  customerNotes: '',
};

export type DraftAction =
  | { type: 'setKind'; kind: BookingKind }
  | { type: 'setRange'; startDate: string | null; endDate: string | null }
  | { type: 'setGuestCount'; guestCount: number | null }
  | { type: 'setTheme'; themeId: string | null }
  | { type: 'setQuantity'; itemId: string; quantity: number }
  | { type: 'removeItems'; itemIds: string[] }
  | { type: 'setNotes'; customerNotes: string }
  | { type: 'reset' };

export function draftReducer(draft: BookingDraft, action: DraftAction): BookingDraft {
  switch (action.type) {
    /*
     * Decoração é um dia só: o intervalo escolhido para a chácara encolhe para o
     * primeiro dia, que é o da festa. O resto fica — trocar de ideia e voltar não
     * deveria apagar os convidados nem os itens já escolhidos.
     */
    case 'setKind':
      return {
        ...draft,
        kind: action.kind,
        endDate: action.kind === 'DECORATION' ? draft.startDate : draft.endDate,
      };

    case 'setRange':
      return { ...draft, startDate: action.startDate, endDate: action.endDate };

    case 'setGuestCount':
      return { ...draft, guestCount: action.guestCount };

    case 'setTheme':
      return { ...draft, themeId: action.themeId };

    /*
     * Quantidade zero remove a linha em vez de guardar `quantity: 0`. O contrato
     * do orçamento exige no mínimo 1 por linha, e uma linha zerada viraria erro
     * de validação num pedido que a pessoa só quis esvaziar.
     */
    case 'setQuantity': {
      if (action.quantity <= 0) {
        return { ...draft, items: draft.items.filter((item) => item.itemId !== action.itemId) };
      }

      const existing = draft.items.some((item) => item.itemId === action.itemId);

      return {
        ...draft,
        items: existing
          ? draft.items.map((item) =>
              item.itemId === action.itemId ? { ...item, quantity: action.quantity } : item,
            )
          : [...draft.items, { itemId: action.itemId, quantity: action.quantity }],
      };
    }

    /*
     * Usado quando o catálogo muda debaixo do rascunho: item desativado sai do
     * `GET /items`, e mantê-lo no pedido daria `VALIDATION_ERROR` no envio
     * ("um dos itens saiu do catálogo") sem a pessoa entender o motivo.
     */
    case 'removeItems':
      return {
        ...draft,
        items: draft.items.filter((item) => !action.itemIds.includes(item.itemId)),
      };

    case 'setNotes':
      return { ...draft, customerNotes: action.customerNotes };

    case 'reset':
      return EMPTY_DRAFT;
  }
}

const STORAGE_KEY = 'chacara:booking-draft';

/**
 * Lê o pedido guardado, ou `null` quando não há nenhum para retomar.
 *
 * Valida campo por campo em vez de confiar no que estava no armazenamento: o
 * conteúdo pode ser de uma versão anterior do formato, ou ter sido editado à mão.
 * Campo estranho volta ao padrão, e o pior caso é a pessoa reescolher. Campo que
 * saiu do formato, como o tipo de festa dos rascunhos antigos, fica para trás.
 */
export function loadDraft(): BookingDraft | null {
  const stored = readJSON<Partial<BookingDraft>>(STORAGE_KEY);

  // Nada guardado, JSON corrompido ou algo que nem objeto é: não há o que retomar.
  if (!stored || typeof stored !== 'object') return null;

  const items = Array.isArray(stored.items)
    ? stored.items.filter(
        (item): item is DraftItem =>
          typeof item?.itemId === 'string' && typeof item?.quantity === 'number',
      )
    : [];

  return {
    // Rascunho de antes da T32 não tem `kind`, e era da chácara.
    kind: stored.kind === 'DECORATION' ? 'DECORATION' : 'VENUE',
    startDate: typeof stored.startDate === 'string' ? stored.startDate : null,
    endDate: typeof stored.endDate === 'string' ? stored.endDate : null,
    guestCount: typeof stored.guestCount === 'number' ? stored.guestCount : null,
    themeId: typeof stored.themeId === 'string' ? stored.themeId : null,
    items,
    customerNotes: typeof stored.customerNotes === 'string' ? stored.customerNotes : '',
  };
}

export function saveDraft(draft: BookingDraft): void {
  writeJSON(STORAGE_KEY, draft);
}

export function clearDraft(): void {
  removeKey(STORAGE_KEY);
}

/** Quantas unidades de um item estão no rascunho. */
export function quantityOf(draft: BookingDraft, itemId: string): number {
  return draft.items.find((item) => item.itemId === itemId)?.quantity ?? 0;
}

/** O passo 1 está completo? É o que libera avançar para os itens. */
export function hasDates(draft: BookingDraft): boolean {
  return draft.startDate !== null && draft.endDate !== null;
}

export function isStepOneComplete(draft: BookingDraft): boolean {
  if (!hasDates(draft)) return false;

  // Decoração não recebe convidados (T32).
  return draft.kind === 'DECORATION' || draft.guestCount !== null;
}

/**
 * O passo de itens está completo? Na chácara os itens são opcionais; na
 * decoração, eles **são** o pedido (T32).
 */
export function isItemsStepComplete(draft: BookingDraft): boolean {
  return draft.kind === 'VENUE' || draft.items.length > 0;
}
