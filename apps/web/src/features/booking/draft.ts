import type { BookingKind, FulfillmentMethod, PublicVenue, QuoteItem } from '@chacara/shared';
import { VENUE_NEEDS_GUESTS_ERROR } from '@chacara/shared';
import { readJSON, removeKey, writeJSON } from '@/lib/storage';
import { dayCount } from './calendar-dates';
import type { WizardStep } from './steps';

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

export type BookingDraft = {
  /**
   * O que a pessoa está reservando (T32): a chácara, com ou sem decoração, ou só
   * a decoração. Começa na chácara, que é o pedido mais comum.
   */
  kind: BookingKind;
  /**
   * O pedido nasceu no cartão de uma decoração da landing: é só a decoração, e o
   * passo de escolher o que reservar não aparece (novembro de 2026).
   */
  kindLocked: boolean;
  startDate: string | null;
  /** Inclusivo. Igual ao início numa reserva de um dia (§7.3). */
  endDate: string | null;
  /** Só na chácara. Na decoração fica guardado, mas não vai no pedido. */
  guestCount: number | null;
  /**
   * A decoração escolhida, ou nenhuma. Cada item do catálogo é uma decoração
   * completa, e o pedido leva uma só (novembro de 2026).
   */
  itemId: string | null;
  /** Retirada ou entrega, só na decoração (§9.12). Nulo até a pessoa escolher. */
  fulfillment: FulfillmentMethod | null;
  customerNotes: string;
};

export const EMPTY_DRAFT: BookingDraft = {
  kind: 'VENUE',
  kindLocked: false,
  startDate: null,
  endDate: null,
  guestCount: null,
  itemId: null,
  fulfillment: null,
  customerNotes: '',
};

export type DraftAction =
  | { type: 'setKind'; kind: BookingKind }
  | { type: 'setRange'; startDate: string | null; endDate: string | null }
  | { type: 'setGuestCount'; guestCount: number | null }
  | { type: 'setItem'; itemId: string | null }
  | { type: 'setFulfillment'; fulfillment: FulfillmentMethod }
  | { type: 'setNotes'; customerNotes: string }
  | { type: 'reset' };

export function draftReducer(draft: BookingDraft, action: DraftAction): BookingDraft {
  switch (action.type) {
    /*
     * Decoração é um dia só: o intervalo escolhido para a chácara encolhe para o
     * primeiro dia, que é o da festa. O resto fica: trocar de ideia e voltar não
     * deveria apagar os convidados nem a decoração já escolhida.
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

    /*
     * Escolher outra decoração troca a que estava: o pedido leva uma só. `null`
     * tira a decoração, que é o "seguir sem decoração" da chácara e também o
     * caminho de uma decoração que saiu do catálogo.
     */
    case 'setItem':
      return { ...draft, itemId: action.itemId };

    case 'setFulfillment':
      return { ...draft, fulfillment: action.fulfillment };

    case 'setNotes':
      return { ...draft, customerNotes: action.customerNotes };

    case 'reset':
      return EMPTY_DRAFT;
  }
}

const STORAGE_KEY = 'chacara:booking-draft';

/** Linha de item dos rascunhos de antes da decoração única. */
function isLegacyLine(line: unknown): line is { itemId: string } {
  return (
    typeof line === 'object' &&
    line !== null &&
    typeof (line as { itemId?: unknown }).itemId === 'string'
  );
}

/**
 * Lê o pedido guardado, ou `null` quando não há nenhum para retomar.
 *
 * Valida campo por campo em vez de confiar no que estava no armazenamento: o
 * conteúdo pode ser de uma versão anterior do formato, ou ter sido editado à mão.
 * Campo estranho volta ao padrão, e o pior caso é a pessoa reescolher. Campo que
 * saiu do formato, como o tipo de festa e o estilo dos rascunhos antigos, fica
 * para trás.
 */
export function loadDraft(): BookingDraft | null {
  const stored = readJSON<Partial<Record<keyof BookingDraft | 'items', unknown>>>(STORAGE_KEY);

  // Nada guardado, JSON corrompido ou algo que nem objeto é: não há o que retomar.
  if (!stored || typeof stored !== 'object') return null;

  // Rascunho de antes da T32 não tem `kind`, e era da chácara.
  const kind: BookingKind = stored.kind === 'DECORATION' ? 'DECORATION' : 'VENUE';

  /*
   * Rascunho de antes de novembro de 2026 guardava uma lista de itens. Fica a
   * primeira decoração: o pedido passou a levar uma só.
   */
  const legacyItem = Array.isArray(stored.items) ? stored.items.find(isLegacyLine) : undefined;

  return {
    kind,
    // Só a decoração tem o tipo travado: a chácara sempre mostra o passo do tipo.
    kindLocked: kind === 'DECORATION' && stored.kindLocked === true,
    startDate: typeof stored.startDate === 'string' ? stored.startDate : null,
    endDate: typeof stored.endDate === 'string' ? stored.endDate : null,
    guestCount: typeof stored.guestCount === 'number' ? stored.guestCount : null,
    itemId: typeof stored.itemId === 'string' ? stored.itemId : (legacyItem?.itemId ?? null),
    fulfillment:
      stored.fulfillment === 'PICKUP' || stored.fulfillment === 'DELIVERY'
        ? stored.fulfillment
        : null,
    customerNotes: typeof stored.customerNotes === 'string' ? stored.customerNotes : '',
  };
}

export function saveDraft(draft: BookingDraft): void {
  writeJSON(STORAGE_KEY, draft);
}

export function clearDraft(): void {
  removeKey(STORAGE_KEY);
}

/** Os itens do pedido, no formato do orçamento: a decoração, uma vez, ou nada. */
export function requestItems(draft: BookingDraft): QuoteItem[] {
  return draft.itemId ? [{ itemId: draft.itemId, quantity: 1 }] : [];
}

/**
 * A decoração cuja agenda o calendário mostra, ou `null` para a agenda do
 * produto (novembro de 2026).
 *
 * Só no pedido de decoração, em que ela é o pedido. Na chácara a decoração é
 * opcional: o calendário mostra os dias da chácara, e a decoração em uso nessa
 * data aparece no passo dela, para a pessoa trocar ou seguir sem.
 */
export function agendaItemId(draft: BookingDraft): string | null {
  return draft.kind === 'DECORATION' ? draft.itemId : null;
}

export function hasDates(draft: BookingDraft): boolean {
  return draft.startDate !== null && draft.endDate !== null;
}

/** O que o wizard precisa saber da chácara para conferir os passos. */
export type VenueLimits = Pick<PublicVenue, 'minDays' | 'maxDays' | 'maxGuests'>;

/**
 * Problema no tamanho do período da chácara (§9.1), ou `null`.
 *
 * A decoração é sempre um dia, e o calendário dela nem deixa escolher dois.
 */
export function rangeLengthError(draft: BookingDraft, venue: VenueLimits): string | null {
  if (draft.kind === 'DECORATION' || !draft.startDate || !draft.endDate) return null;

  const total = dayCount(draft.startDate, draft.endDate);

  if (total > venue.maxDays) {
    return `A chácara aceita no máximo ${venue.maxDays} ${venue.maxDays === 1 ? 'dia' : 'dias'} seguidos.`;
  }

  if (total < venue.minDays) return `A reserva é de no mínimo ${venue.minDays} dias seguidos.`;

  return null;
}

/**
 * Problema no número de convidados, ou `null`.
 *
 * O teto é o `maxGuests` das configurações (§9.1): a API recusaria acima dele, e
 * a pessoa só descobriria no envio.
 */
export function guestCountError(guestCount: number | null, maxGuests: number): string | null {
  if (guestCount === null) return VENUE_NEEDS_GUESTS_ERROR;
  if (!Number.isInteger(guestCount)) return 'Informe um número inteiro de convidados.';
  if (guestCount < 1) return 'Informe pelo menos um convidado.';
  if (guestCount > maxGuests) {
    return `São mais pessoas do que a chácara recebe. O máximo é ${maxGuests}.`;
  }

  return null;
}

/**
 * O passo está respondido? É o que libera os passos seguintes.
 *
 * Só o que dá para saber sem perguntar ao servidor: a data tomada no meio do
 * período e a decoração em uso nessa data são conferidas no próprio passo, com a
 * agenda à mão.
 */
export function isStepComplete(draft: BookingDraft, step: WizardStep, venue: VenueLimits): boolean {
  switch (step) {
    case 'tipo':
    case 'revisao':
      return true;
    case 'data':
      return hasDates(draft) && rangeLengthError(draft, venue) === null;
    case 'convidados':
      return (
        draft.kind === 'DECORATION' || guestCountError(draft.guestCount, venue.maxGuests) === null
      );
    // Na chácara a decoração é opcional; na decoração, ela **é** o pedido (T32).
    case 'decoracao':
      return draft.kind === 'VENUE' || draft.itemId !== null;
  }
}

/**
 * O passo que dá para abrir, entre os do pedido.
 *
 * É o pedido, se todos os anteriores estão respondidos; senão, o primeiro que
 * falta. Um link para a revisão com o pedido vazio, ou o atalho de um passo
 * adiante, cai no que precisa ser respondido antes.
 */
export function reachableStep(
  draft: BookingDraft,
  steps: readonly WizardStep[],
  wanted: WizardStep,
  venue: VenueLimits,
): WizardStep {
  for (const step of steps) {
    if (step === wanted || !isStepComplete(draft, step, venue)) return step;
  }

  return wanted;
}
