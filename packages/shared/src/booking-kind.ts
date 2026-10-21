import type { BlockScope, BookingKind } from './enums.js';

/**
 * Regras de forma do pedido por produto (T32), num lugar só.
 *
 * O orçamento, o pedido do cliente e o lançamento do painel validam o mesmo
 * formato, e cada um tem o seu schema. Se cada schema escrevesse a regra à mão,
 * a terceira cópia seria a que esquece um caso. Por isso os três usam estes
 * predicados, com as mesmas mensagens.
 *
 * Mora fora de `quote.ts` e de `booking.ts` porque os dois o usam, e um
 * importando do outro faria um ciclo.
 */

/** Decoração sai para uma festa: é um dia de uso, combinado com a dona. */
export const DECORATION_ONE_DAY_ERROR = 'A decoração é reservada para um dia só.';

/** Sem item, um pedido de decoração não tem o que reservar. */
export const DECORATION_NEEDS_ITEMS_ERROR = 'Escolha pelo menos um item da decoração.';

/** Na chácara, o número de convidados decide se a festa cabe. */
export const VENUE_NEEDS_GUESTS_ERROR = 'Informe quantas pessoas são esperadas.';

export function isOneDayWhenDecoration(request: {
  kind: BookingKind;
  startDate: string;
  endDate: string;
}): boolean {
  return request.kind !== 'DECORATION' || request.startDate === request.endDate;
}

export function hasItemsWhenDecoration(request: {
  kind: BookingKind;
  items: readonly unknown[];
}): boolean {
  return request.kind !== 'DECORATION' || request.items.length > 0;
}

export function hasGuestsWhenVenue(request: {
  kind: BookingKind;
  guestCount: number | null;
}): boolean {
  return request.kind !== 'VENUE' || request.guestCount !== null;
}

/**
 * Escopos de bloqueio que fecham um produto.
 *
 * `BOTH` está nas duas listas, e é isso que o nome promete. Fica aqui, e não
 * espalhado em `if`, porque a disponibilidade, a criação da reserva, o estoque e
 * o calendário do painel fazem a mesma pergunta: "este bloqueio fecha o quê?".
 */
export const SCOPES_BLOCKING: Record<BookingKind, readonly BlockScope[]> = {
  VENUE: ['VENUE', 'BOTH'],
  DECORATION: ['DECORATION', 'BOTH'],
};

export function blocksKind(scope: BlockScope, kind: BookingKind): boolean {
  return SCOPES_BLOCKING[kind].includes(scope);
}
