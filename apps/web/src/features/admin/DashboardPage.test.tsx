import type { AdminBookingSummary, AdminDashboard, PublicVenue } from '@chacara/shared';
import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorResponse, jsonResponse, renderWithProviders } from '../../../test/helpers/render';
import { DashboardPage } from './DashboardPage';

/**
 * Visão geral do painel (§13.4).
 *
 * O relógio é fixado porque a tela conta quanto falta para o prazo de cada
 * pedido — com data real, o texto mudaria a cada execução.
 */

const VENUE: PublicVenue = {
  name: 'Chácara Seu Evento',
  maxGuests: 120,
  checkInTime: '08:00',
  checkOutTime: '22:00',
  whatsapp: '11999990000',
  address: null,
  mapsUrl: null,
  houseRules: null,
  minDays: 1,
  maxDays: 3,
  minLeadDays: 2,
  freeCancelUntilDays: 7,
  holdHours: 48,
};

const PEDIDO: AdminBookingSummary = {
  id: 'b-1',
  startDate: '2026-12-05',
  endDate: '2026-12-06',
  status: 'PENDING',
  holdExpiresAt: '2026-11-17T18:00:00.000Z',
  eventType: 'BABY_SHOWER',
  guestCount: 60,
  totalCents: 436_000,
  createdByAdmin: false,
  customer: { id: 'u-1', name: 'Ana Beatriz', email: 'ana@exemplo.com', phone: '11988887777' },
};

const CONFIRMADA: AdminBookingSummary = {
  ...PEDIDO,
  id: 'b-2',
  startDate: '2026-11-22',
  endDate: '2026-11-22',
  status: 'CONFIRMED',
  holdExpiresAt: null,
  customer: { id: 'u-2', name: 'Bia Costa', email: null, phone: null },
};

const VAZIO: AdminDashboard = {
  pending: [],
  upcoming: [],
  counts: { pending: 0, next7: 0, next30: 0 },
  occupancy: {
    month: '2026-11',
    totalDays: 30,
    bookedDays: 0,
    blockedDays: 0,
    freeDays: 13,
    bookedPercent: 0,
  },
};

function stubFetch(dashboard: AdminDashboard | (() => Response) = VAZIO) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url === '/api/public/venue') return Promise.resolve(jsonResponse(VENUE));

      if (url === '/api/admin/dashboard') {
        return Promise.resolve(
          typeof dashboard === 'function' ? dashboard() : jsonResponse(dashboard),
        );
      }

      return Promise.resolve(jsonResponse([]));
    }),
  );
}

function renderDashboard() {
  return renderWithProviders(<DashboardPage />, { route: '/admin', withAuth: false });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // 15/11/2026 às 12:00 em São Paulo.
  vi.setSystemTime(new Date('2026-11-15T15:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('DashboardPage', () => {
  it('usa o nome da chácara como título', async () => {
    stubFetch();
    renderDashboard();

    expect(await screen.findByRole('heading', { name: 'Chácara Seu Evento' })).toBeVisible();
  });

  it('mostra os quatro números do topo', async () => {
    stubFetch({
      ...VAZIO,
      counts: { pending: 2, next7: 1, next30: 4 },
      occupancy: { ...VAZIO.occupancy, bookedDays: 6, bookedPercent: 20 },
    });
    renderDashboard();

    expect(await screen.findByText('2')).toBeVisible();
    expect(screen.getByText('pedidos aguardando resposta')).toBeVisible();
    expect(screen.getByText('nos próximos 7 dias')).toBeVisible();
    expect(screen.getByText('nos próximos 30 dias')).toBeVisible();
    expect(screen.getByText('20%')).toBeVisible();
    expect(screen.getByText(/6 de 30 dias/)).toBeVisible();
  });

  it('usa singular quando há um pedido só', async () => {
    stubFetch({ ...VAZIO, counts: { pending: 1, next7: 0, next30: 0 } });
    renderDashboard();

    expect(await screen.findByText('pedido aguardando resposta')).toBeVisible();
  });

  /* §13.4: o prazo é o que decide a ordem de atenção do dono. */
  it('conta quanto falta para responder cada pedido', async () => {
    stubFetch({ ...VAZIO, pending: [PEDIDO], counts: { pending: 1, next7: 0, next30: 1 } });
    renderDashboard();

    // De 15/11 15:00 UTC até 17/11 18:00 UTC são 2 dias e 3 horas.
    expect(await screen.findByText('Responder em 2 dias')).toBeVisible();
  });

  it('mostra cliente, tipo e convidados de cada pedido', async () => {
    stubFetch({ ...VAZIO, pending: [PEDIDO] });
    renderDashboard();

    expect(await screen.findByText(/Ana Beatriz · Chá de bebê · 60 pessoas/)).toBeVisible();
    expect(screen.getByText('5 a 6 de dezembro de 2026')).toBeVisible();
    expect(screen.getByText('R$ 4.360,00')).toBeVisible();
  });

  it('não conta prazo para reserva já confirmada', async () => {
    stubFetch({ ...VAZIO, upcoming: [CONFIRMADA] });
    renderDashboard();

    await screen.findByText('Confirmada');
    expect(screen.queryByText(/Responder/)).not.toBeInTheDocument();
  });

  it('oferece o WhatsApp de quem tem telefone', async () => {
    stubFetch({ ...VAZIO, pending: [PEDIDO] });
    renderDashboard();

    expect(await screen.findByRole('link', { name: 'WhatsApp' })).toHaveAttribute(
      'href',
      expect.stringContaining('wa.me/5511988887777'),
    );
  });

  it('não oferece WhatsApp para cliente sem telefone', async () => {
    stubFetch({ ...VAZIO, upcoming: [CONFIRMADA] });
    renderDashboard();

    await screen.findByText('Bia Costa · Chá de bebê · 60 pessoas');
    expect(screen.queryByRole('link', { name: 'WhatsApp' })).not.toBeInTheDocument();
  });

  it('leva ao detalhe da reserva', async () => {
    stubFetch({ ...VAZIO, pending: [PEDIDO] });
    renderDashboard();

    expect(await screen.findByRole('link', { name: 'Abrir' })).toHaveAttribute(
      'href',
      '/admin/reservas/b-1',
    );
  });

  /* §16.5: estado vazio diz o que vai aparecer ali, não "nenhum resultado". */
  it('explica o vazio dos pedidos', async () => {
    stubFetch();
    renderDashboard();

    expect(await screen.findByText('Nenhum pedido esperando')).toBeVisible();
    expect(screen.getByText(/aparece aqui com o prazo para você responder/)).toBeVisible();
  });

  it('explica o vazio dos próximos dias', async () => {
    stubFetch();
    renderDashboard();

    expect(await screen.findByText('Nenhuma festa marcada por enquanto')).toBeVisible();
  });

  it('abre a ocupação em reservados, bloqueados e livres', async () => {
    stubFetch({
      ...VAZIO,
      occupancy: {
        month: '2026-11',
        totalDays: 30,
        bookedDays: 6,
        blockedDays: 2,
        freeDays: 8,
        bookedPercent: 20,
      },
    });
    renderDashboard();

    expect(await screen.findByText('Ocupação deste mês')).toBeVisible();
    expect(screen.getByText('6 dias')).toBeVisible();
    expect(screen.getByText('2 dias')).toBeVisible();
    expect(screen.getByText('8 dias')).toBeVisible();
  });

  it('leva à lista de reservas e ao calendário', async () => {
    stubFetch();
    renderDashboard();

    expect(await screen.findByRole('link', { name: 'Ver todas as reservas' })).toHaveAttribute(
      'href',
      '/admin/reservas',
    );
    expect(screen.getByRole('link', { name: 'Abrir o calendário' })).toHaveAttribute(
      'href',
      '/admin/calendario',
    );
  });

  it('explica a falha em vez de mostrar números zerados', async () => {
    stubFetch(() => errorResponse(500, 'INTERNAL', 'Algo deu errado do nosso lado.'));
    renderDashboard();

    expect(await screen.findByRole('alert')).toHaveTextContent('Algo deu errado do nosso lado.');
  });
});
