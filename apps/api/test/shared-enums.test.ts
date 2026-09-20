import { describe, expect, it } from 'vitest';
import {
  BOOKING_STATUSES,
  BOOKING_STATUS_LABELS,
  DISCOUNT_TYPES,
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
  GALLERY_KINDS,
  GALLERY_KIND_LABELS,
  ROLES,
} from '@chacara/shared';
import {
  BookingStatus,
  DiscountType,
  EventType,
  GalleryKind,
  Role,
} from '../src/generated/prisma/enums.js';

/**
 * `packages/shared` redeclara os enums do domínio porque o SPA não pode
 * depender do Prisma. Este é o preço: um teste que compara as duas listas.
 *
 * Se falhar, alguém mexeu no schema.prisma e esqueceu o pacote compartilhado
 * (ou o contrário), e a API passaria a aceitar um valor que o front não conhece.
 *
 * `TokenType` fica de fora de propósito: é detalhe interno da autenticação e
 * nunca aparece em resposta da API.
 */
describe('enums compartilhados x schema do Prisma', () => {
  const cases: [string, readonly string[], Record<string, string>][] = [
    ['Role', ROLES, Role],
    ['BookingStatus', BOOKING_STATUSES, BookingStatus],
    ['DiscountType', DISCOUNT_TYPES, DiscountType],
    ['GalleryKind', GALLERY_KINDS, GalleryKind],
    ['EventType', EVENT_TYPES, EventType],
  ];

  it.each(cases)('%s tem os mesmos valores nas duas pontas', (_name, shared, prisma) => {
    expect([...shared].sort()).toEqual(Object.values(prisma).sort());
  });
});

describe('rótulos pt-BR', () => {
  it('tem rótulo para todo status de reserva', () => {
    for (const status of BOOKING_STATUSES) {
      expect(BOOKING_STATUS_LABELS[status]).toBeTruthy();
    }
  });

  it('tem rótulo para todo tipo de evento', () => {
    for (const eventType of EVENT_TYPES) {
      expect(EVENT_TYPE_LABELS[eventType]).toBeTruthy();
    }
  });

  it('tem rótulo para toda seção da galeria', () => {
    for (const kind of GALLERY_KINDS) {
      expect(GALLERY_KIND_LABELS[kind]).toBeTruthy();
    }
  });

  // §16.2: "Aguardando confirmação", nunca "Pendente".
  it('não usa Pendente para PENDING', () => {
    expect(BOOKING_STATUS_LABELS.PENDING).toBe('Aguardando confirmação');
  });
});
