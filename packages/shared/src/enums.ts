/**
 * Enums do domínio (§8).
 *
 * Declarados aqui, e não importados do client do Prisma, porque o SPA não pode
 * depender do Prisma. A contrapartida é o risco de deriva, coberto por um teste
 * na API que compara estas listas com os enums gerados.
 */

export const ROLES = ['CLIENT', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const BOOKING_STATUSES = ['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const DISCOUNT_TYPES = ['PERCENT', 'FIXED_PRICE'] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export const GALLERY_KINDS = ['HERO', 'VENUE', 'EVENTS'] as const;
export type GalleryKind = (typeof GALLERY_KINDS)[number];

/**
 * O que a reserva contrata (T32): a chácara (com ou sem decoração) ou só a
 * decoração, para festa em outro lugar. Só `VENUE` ocupa a data da chácara.
 */
export const BOOKING_KINDS = ['VENUE', 'DECORATION'] as const;
export type BookingKind = (typeof BOOKING_KINDS)[number];

/** O que um bloqueio do dono fecha naquele dia (T32). */
export const BLOCK_SCOPES = ['VENUE', 'DECORATION', 'BOTH'] as const;
export type BlockScope = (typeof BLOCK_SCOPES)[number];

export const EVENT_TYPES = [
  'BIRTHDAY_KIDS',
  'BIRTHDAY_ADULT',
  'BABY_SHOWER',
  'GENDER_REVEAL',
  'BRIDAL_SHOWER',
  'WEDDING',
  'GRADUATION',
  'GET_TOGETHER',
  'OTHER',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/**
 * Estado de um dia na resposta de disponibilidade (§9.1).
 *
 * Não é enum de banco: é derivado na consulta e só existe no contrato da API.
 * A rota pública nunca diz de quem é a reserva, só que o dia está ocupado.
 */
export const DAY_STATUSES = ['free', 'booked', 'blocked', 'past'] as const;
export type DayStatus = (typeof DAY_STATUSES)[number];
