import type { EventType } from '@chacara/shared';
import { readJSON, removeKey, writeJSON } from '@/lib/storage';

/**
 * Rascunho da reserva (§12.2).
 *
 * Vive num `useReducer` e é espelhado em `sessionStorage`. O espelho existe por
 * um motivo específico: o envio exige sessão, e quem não está logado é desviado
 * para entrar ou se cadastrar. Esse desvio recarrega a aplicação, e sem o
 * espelho a pessoa voltaria para um wizard vazio depois de montar o pedido
 * inteiro (§13.2).
 *
 * `sessionStorage` e não `localStorage`: o rascunho é desta visita. Guardar por
 * semanas faria a pessoa reencontrar datas que já passaram.
 */

export type DraftItem = { itemId: string; quantity: number };

export type BookingDraft = {
  startDate: string | null;
  /** Inclusivo. Igual ao início numa reserva de um dia (§7.3). */
  endDate: string | null;
  eventType: EventType | null;
  guestCount: number | null;
  /** Estilo escolhido no passo de itens. Não vai para a reserva: é só filtro. */
  themeId: string | null;
  items: DraftItem[];
  customerNotes: string;
};

export const EMPTY_DRAFT: BookingDraft = {
  startDate: null,
  endDate: null,
  eventType: null,
  guestCount: null,
  themeId: null,
  items: [],
  customerNotes: '',
};

export type DraftAction =
  | { type: 'setRange'; startDate: string | null; endDate: string | null }
  | { type: 'setEventType'; eventType: EventType }
  | { type: 'setGuestCount'; guestCount: number | null }
  | { type: 'setTheme'; themeId: string | null }
  | { type: 'setQuantity'; itemId: string; quantity: number }
  | { type: 'removeItems'; itemIds: string[] }
  | { type: 'setNotes'; customerNotes: string }
  | { type: 'reset' };

export function draftReducer(draft: BookingDraft, action: DraftAction): BookingDraft {
  switch (action.type) {
    case 'setRange':
      return { ...draft, startDate: action.startDate, endDate: action.endDate };

    case 'setEventType':
      return { ...draft, eventType: action.eventType };

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
 * Lê o rascunho guardado.
 *
 * Valida campo por campo em vez de confiar no que estava no armazenamento: o
 * conteúdo pode ser de uma versão anterior do formato, ou ter sido editado à mão.
 * Campo estranho volta ao padrão, e o pior caso é a pessoa reescolher.
 */
export function loadDraft(): BookingDraft {
  const stored = readJSON<Partial<BookingDraft>>(STORAGE_KEY);

  if (!stored) return EMPTY_DRAFT;

  const items = Array.isArray(stored.items)
    ? stored.items.filter(
        (item): item is DraftItem =>
          typeof item?.itemId === 'string' && typeof item?.quantity === 'number',
      )
    : [];

  return {
    startDate: typeof stored.startDate === 'string' ? stored.startDate : null,
    endDate: typeof stored.endDate === 'string' ? stored.endDate : null,
    eventType: typeof stored.eventType === 'string' ? (stored.eventType as EventType) : null,
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
  return hasDates(draft) && draft.eventType !== null && draft.guestCount !== null;
}
