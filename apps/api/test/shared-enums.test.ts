import { describe, expect, it } from 'vitest';
import {
  BLOCK_SCOPES,
  BLOCK_SCOPE_LABELS,
  BOOKING_KINDS,
  BOOKING_KIND_LABELS,
  BOOKING_STATUSES,
  BOOKING_STATUS_LABELS,
  DISCOUNT_TYPES,
  FULFILLMENT_LABELS,
  FULFILLMENT_METHODS,
  GALLERY_KINDS,
  GALLERY_KIND_LABELS,
  PAYMENT_KINDS,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_LABELS,
  ROLES,
} from '@chacara/shared';
import {
  BlockScope,
  BookingKind,
  BookingStatus,
  DiscountType,
  FulfillmentMethod,
  GalleryKind,
  PaymentKind,
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
    ['BookingKind', BOOKING_KINDS, BookingKind],
    ['BlockScope', BLOCK_SCOPES, BlockScope],
    ['PaymentKind', PAYMENT_KINDS, PaymentKind],
    ['FulfillmentMethod', FULFILLMENT_METHODS, FulfillmentMethod],
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

  it('tem rótulo para toda seção da galeria', () => {
    for (const kind of GALLERY_KINDS) {
      expect(GALLERY_KIND_LABELS[kind]).toBeTruthy();
    }
  });

  it('tem rótulo para todo tipo de reserva e todo escopo de bloqueio', () => {
    for (const kind of BOOKING_KINDS) {
      expect(BOOKING_KIND_LABELS[kind]).toBeTruthy();
    }

    for (const scope of BLOCK_SCOPES) {
      expect(BLOCK_SCOPE_LABELS[scope]).toBeTruthy();
    }
  });

  /*
   * A situação do recebimento não é enum de banco (é calculada na consulta),
   * então não entra na comparação acima. O rótulo é o que o painel mostra.
   */
  it('tem rótulo para toda situação de recebimento', () => {
    for (const status of PAYMENT_STATUSES) {
      expect(PAYMENT_STATUS_LABELS[status]).toBeTruthy();
    }
  });

  it('tem rótulo para retirada e entrega da decoração', () => {
    for (const method of FULFILLMENT_METHODS) {
      expect(FULFILLMENT_LABELS[method]).toBeTruthy();
    }
  });

  // §16.2: "Aguardando confirmação", nunca "Pendente".
  it('não usa Pendente para PENDING', () => {
    expect(BOOKING_STATUS_LABELS.PENDING).toBe('Aguardando confirmação');
  });
});
