import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { query } from './database.js';

/**
 * Dados para a revisão responsiva (T30).
 *
 * As telas densas do painel — lista de reservas, detalhe, calendário, visão
 * geral — só mostram o que pode quebrar no celular quando têm conteúdo. Com o
 * banco recém-preparado todas cairiam no estado vazio, e estado vazio nunca
 * transborda.
 *
 * Os nomes são compridos de propósito. Nome curto cabe em qualquer largura; o
 * que revela cartão apertado e texto cortado é o nome que a vida real produz.
 */

export const SCREEN_CLIENT = {
  name: 'Maria Aparecida Gonçalves de Oliveira',
  email: 'maria.aparecida.goncalves@exemplo.com.br',
  phone: '11988887777',
  password: 'senha-das-telas-123',
};

const SECOND_CUSTOMER = {
  name: 'João Pedro Albuquerque',
  email: 'joao.pedro@exemplo.com',
  phone: '11977776666',
};

export type SeededScreens = {
  clientId: string;
  confirmedBookingId: string;
  pendingBookingId: string;
  secondCustomerId: string;
  /** Dia bloqueado no mês corrente, em `YYYY-MM-DD`. */
  blockedDate: string;
};

/** Soma dias a uma data `YYYY-MM-DD` sem passar por fuso (§7.3). */
function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const moved = new Date(Date.UTC(year!, month! - 1, day! + days));
  return moved.toISOString().slice(0, 10);
}

function todayISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

async function insertUser(user: {
  name: string;
  email: string;
  phone: string;
  password?: string;
}): Promise<string> {
  const id = randomUUID();
  const hash = user.password ? await argon2.hash(user.password, { type: argon2.argon2id }) : null;

  await query(
    `INSERT INTO "User" (id, name, email, phone, "passwordHash", "emailVerifiedAt",
                         "termsAcceptedAt", role, "updatedAt")
     VALUES ($1, $2, $3, $4, $5, now(), now(), 'CLIENT', now())`,
    [id, user.name, user.email, user.phone, hash],
  );

  return id;
}

async function insertBooking(booking: {
  userId: string;
  startDate: string;
  endDate: string;
  status: string;
  holdHours?: number;
  notes?: string | null;
  adminNotes?: string | null;
  cancelReason?: string | null;
  items?: { name: string; quantity: number; unitPriceCents: number }[];
}): Promise<string> {
  const id = randomUUID();

  const days = [
    { date: booking.startDate, priceCents: 180_000, ruleName: 'Fim de semana' },
    ...(booking.endDate === booking.startDate
      ? []
      : [{ date: booking.endDate, priceCents: 150_000, ruleName: null }]),
  ];

  const dailyTotal = days.reduce((sum, day) => sum + day.priceCents, 0);
  const items = booking.items ?? [];
  const itemsTotal = items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
  const discount = items.length > 1 ? 9_000 : 0;

  const combos =
    discount > 0
      ? [{ comboId: randomUUID(), name: 'Céu de chá', times: 1, discountCents: discount }]
      : [];

  await query(
    `INSERT INTO "Booking" (id, "userId", "startDate", "endDate", "eventType", "guestCount",
                            status, "holdExpiresAt", "dailyBreakdown", "dailyTotalCents",
                            "itemsTotalCents", "discountTotalCents", "totalCents",
                            "appliedCombos", "customerNotes", "adminNotes", "cancelReason",
                            "cancelledBy", "createdByAdmin", "updatedAt")
     VALUES ($1, $2, $3::date, $4::date, 'BABY_SHOWER', 60, $5::"BookingStatus",
             $6, $7::jsonb, $8, $9, $10, $11, $12::jsonb, $13, $14, $15,
             $16::"Role", false, now())`,
    [
      id,
      booking.userId,
      booking.startDate,
      booking.endDate,
      booking.status,
      booking.holdHours ? new Date(Date.now() + booking.holdHours * 3_600_000) : null,
      JSON.stringify(days),
      dailyTotal,
      itemsTotal,
      discount,
      dailyTotal + itemsTotal - discount,
      JSON.stringify(combos),
      booking.notes ?? null,
      booking.adminNotes ?? null,
      booking.cancelReason ?? null,
      booking.cancelReason ? 'ADMIN' : null,
    ],
  );

  for (const item of items) {
    const catalogItem = await query<{ id: string }>(
      `SELECT id FROM "Item" WHERE name = $1 LIMIT 1`,
      [item.name],
    );

    // O catálogo de demonstração é versionado, mas não quero travar a captura
    // caso um nome mude: sem o item, a reserva aparece sem essa linha.
    if (catalogItem.length === 0) continue;

    await query(
      `INSERT INTO "BookingItem" (id, "bookingId", "itemId", "itemName", quantity, "unitPriceCents")
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [randomUUID(), id, catalogItem[0]!.id, item.name, item.quantity, item.unitPriceCents],
    );
  }

  return id;
}

export async function seedScreens(): Promise<SeededScreens> {
  const today = todayISO();

  const clientId = await insertUser(SCREEN_CLIENT);
  const secondCustomerId = await insertUser(SECOND_CUSTOMER);

  const confirmedBookingId = await insertBooking({
    userId: clientId,
    startDate: addDays(today, 12),
    endDate: addDays(today, 13),
    status: 'CONFIRMED',
    notes: 'Chegamos na véspera à tarde para montar a decoração com calma.',
    adminNotes: 'Cliente pediu para deixar o portão aberto a partir das 7h.',
    items: [
      { name: 'Painel de nuvens', quantity: 1, unitPriceCents: 18_000 },
      { name: 'Arco de balões pastel', quantity: 2, unitPriceCents: 24_000 },
      { name: 'Mesa de madeira rústica', quantity: 3, unitPriceCents: 12_000 },
    ],
  });

  const pendingBookingId = await insertBooking({
    userId: clientId,
    startDate: addDays(today, 30),
    endDate: addDays(today, 30),
    status: 'PENDING',
    holdHours: 36,
    items: [{ name: 'Cordão de luzes de varal', quantity: 4, unitPriceCents: 6_000 }],
  });

  await insertBooking({
    userId: clientId,
    startDate: addDays(today, 45),
    endDate: addDays(today, 45),
    status: 'CANCELLED',
    cancelReason: 'A chácara estava em manutenção nesta data.',
  });

  await insertBooking({
    userId: clientId,
    startDate: addDays(today, -40),
    endDate: addDays(today, -40),
    status: 'COMPLETED',
  });

  await insertBooking({
    userId: secondCustomerId,
    startDate: addDays(today, 20),
    endDate: addDays(today, 20),
    status: 'CONFIRMED',
  });

  const blockedDate = addDays(today, 6);
  await query(`INSERT INTO "BlockedDate" (date, reason) VALUES ($1::date, $2)`, [
    blockedDate,
    'Manutenção da piscina e poda das árvores do fundo',
  ]);

  return { clientId, confirmedBookingId, pendingBookingId, secondCustomerId, blockedDate };
}
