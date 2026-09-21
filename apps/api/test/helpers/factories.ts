import { parseISODate, type ISODate } from '../../src/lib/dates.js';
import type {
  BookingStatus,
  EventType,
  GalleryKind,
  Role,
} from '../../src/generated/prisma/enums.js';
import { prisma } from './db.js';

let sequence = 0;

export function createUser(
  overrides: { name?: string; email?: string | null; phone?: string | null; role?: Role } = {},
) {
  sequence += 1;
  return prisma.user.create({
    data: {
      name: overrides.name ?? `Cliente ${sequence}`,
      email: overrides.email === undefined ? `cliente-${sequence}@exemplo.com` : overrides.email,
      phone: overrides.phone === undefined ? '11999990000' : overrides.phone,
      role: overrides.role ?? 'CLIENT',
    },
  });
}

type BookingInput = {
  userId: string;
  /** Dia de entrada, 'YYYY-MM-DD'. */
  startDate: ISODate;
  /** Dia de saída, inclusivo (§7.3). */
  endDate: ISODate;
  status?: BookingStatus;
  eventType?: EventType;
  guestCount?: number;
  holdExpiresAt?: Date | null;
};

/**
 * Reserva mínima para exercitar as regras de calendário.
 *
 * O snapshot financeiro fica zerado de propósito: aqui o que está sob teste são
 * as constraints de data. Quem precisa de valores reais é a T19, que monta a
 * reserva pelo computeQuote.
 */
export function createBooking(input: BookingInput) {
  return prisma.booking.create({
    data: {
      userId: input.userId,
      startDate: parseISODate(input.startDate),
      endDate: parseISODate(input.endDate),
      status: input.status ?? 'PENDING',
      eventType: input.eventType ?? 'BABY_SHOWER',
      guestCount: input.guestCount ?? 40,
      holdExpiresAt: input.holdExpiresAt ?? null,
      dailyBreakdown: [],
      appliedCombos: [],
      dailyTotalCents: 0,
      itemsTotalCents: 0,
      discountTotalCents: 0,
      totalCents: 0,
    },
  });
}

/** Paleta válida mínima: a §15.3 exige exatamente 5 cores. */
export const PALETTE = [
  { name: 'Sálvia', hex: '#A7B8A1' },
  { name: 'Palha', hex: '#D8C7A3' },
  { name: 'Madeira', hex: '#8C6A4F' },
  { name: 'Areia', hex: '#E8DCC8' },
  { name: 'Branco', hex: '#FFFFFF' },
];

export function createCategory(overrides: { name?: string; sortOrder?: number } = {}) {
  sequence += 1;
  return prisma.category.create({
    data: {
      name: overrides.name ?? `Categoria ${sequence}`,
      sortOrder: overrides.sortOrder ?? 0,
    },
  });
}

export function createTheme(
  overrides: { slug?: string; name?: string; active?: boolean; sortOrder?: number } = {},
) {
  sequence += 1;
  return prisma.theme.create({
    data: {
      slug: overrides.slug ?? `estilo-${sequence}`,
      name: overrides.name ?? `Estilo ${sequence}`,
      palette: PALETTE.map((color) => ({ ...color })),
      active: overrides.active ?? true,
      sortOrder: overrides.sortOrder ?? 0,
    },
  });
}

export function createItem(overrides: {
  categoryId: string;
  name?: string;
  priceCents?: number;
  stock?: number;
  active?: boolean;
  sortOrder?: number;
  themeIds?: string[];
}) {
  sequence += 1;
  return prisma.item.create({
    data: {
      categoryId: overrides.categoryId,
      name: overrides.name ?? `Item ${sequence}`,
      priceCents: overrides.priceCents ?? 12000,
      stock: overrides.stock ?? 5,
      active: overrides.active ?? true,
      sortOrder: overrides.sortOrder ?? 0,
      themes: { create: (overrides.themeIds ?? []).map((themeId) => ({ themeId })) },
    },
  });
}

export function createCombo(overrides: {
  name?: string;
  themeId?: string | null;
  itemIds?: string[];
}) {
  sequence += 1;
  return prisma.combo.create({
    data: {
      name: overrides.name ?? `Combo ${sequence}`,
      themeId: overrides.themeId ?? null,
      discountType: 'PERCENT',
      discountValue: 10,
      items: { create: (overrides.itemIds ?? []).map((itemId) => ({ itemId, quantity: 1 })) },
    },
  });
}

export function createGalleryImage(overrides: {
  kind?: GalleryKind;
  alt?: string;
  sortOrder?: number;
  active?: boolean;
}) {
  sequence += 1;
  return prisma.galleryImage.create({
    data: {
      kind: overrides.kind ?? 'VENUE',
      url: `https://exemplo.com/foto-${sequence}.webp`,
      alt: overrides.alt ?? `Foto ${sequence} da chácara`,
      sortOrder: overrides.sortOrder ?? 0,
      active: overrides.active ?? true,
    },
  });
}
