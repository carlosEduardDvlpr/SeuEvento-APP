import type { Booking, PublicVenue } from '@chacara/shared';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../test/helpers/render';
import { ConfirmationStep } from './ConfirmationStep';

/**
 * Pedido enviado (§13.2), na reserva só de decoração: a pessoa confere como a
 * decoração chega à festa (§9.12). O caminho do envio até aqui é coberto pelos
 * testes do wizard.
 */

const VENUE: PublicVenue = {
  name: 'Chácara Seu Evento',
  maxGuests: 120,
  checkInTime: '08:00',
  checkOutTime: '22:00',
  whatsapp: '(11) 99999-0000',
  address: null,
  mapsUrl: null,
  houseRules: null,
  minDays: 1,
  maxDays: 3,
  minLeadDays: 2,
  freeCancelUntilDays: 7,
  holdHours: 48,
};

function makeDecoration(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'b-1',
    kind: 'DECORATION',
    startDate: '2026-12-05',
    endDate: '2026-12-05',
    guestCount: null,
    status: 'PENDING',
    holdExpiresAt: '2026-12-03T21:00:00.000Z',
    canCancel: true,
    cancelUntil: null,
    days: [],
    dailyTotalCents: 0,
    items: [
      {
        itemId: 'i-1',
        name: 'Decoração jardim encantado',
        quantity: 1,
        unitPriceCents: 45_000,
        totalCents: 45_000,
        imageUrl: null,
      },
    ],
    itemsTotalCents: 45_000,
    combos: [],
    discountTotalCents: 0,
    totalCents: 45_000,
    fulfillment: 'PICKUP',
    deliveryAddress: null,
    customerNotes: null,
    cancelReason: null,
    createdAt: '2026-12-01T12:00:00.000Z',
    ...overrides,
  };
}

function renderConfirmation(booking: Booking) {
  renderWithProviders(
    <ConfirmationStep booking={booking} venue={VENUE} isLoading={false} error={null} />,
    { route: '/reservar?reserva=b-1', withAuth: false },
  );
}

describe('ConfirmationStep, só a decoração', () => {
  it('mostra a entrega, o endereço guardado no pedido e que a taxa é combinada', () => {
    renderConfirmation(
      makeDecoration({
        fulfillment: 'DELIVERY',
        deliveryAddress: {
          cep: '12954000',
          street: 'Rua das Orquídeas',
          number: '265',
          complement: null,
          district: 'Chácaras Fernão Dias',
          city: 'Atibaia',
          state: 'SP',
        },
      }),
    );

    expect(screen.getByText('Entrega no endereço')).toBeVisible();
    expect(
      screen.getByText('Rua das Orquídeas, 265 – Chácaras Fernão Dias, Atibaia/SP – CEP 12954-000'),
    ).toBeVisible();
    expect(screen.getByText('A taxa de entrega é combinada com a chácara.')).toBeVisible();
    expect(screen.getByText('Aí vocês combinam o pagamento, a entrega e a taxa.')).toBeVisible();
  });

  it('mostra a retirada na chácara, sem endereço nem taxa', () => {
    renderConfirmation(makeDecoration());

    expect(screen.getByText('Retirada na chácara')).toBeVisible();
    expect(screen.queryByText('Endereço de entrega')).not.toBeInTheDocument();
    expect(screen.queryByText(/taxa de entrega/)).not.toBeInTheDocument();
    expect(screen.getByText('Aí vocês combinam o pagamento e a retirada dos itens.')).toBeVisible();
  });
});
