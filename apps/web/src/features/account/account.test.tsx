import type { Booking, BookingStatus, PublicVenue, SessionUser } from '@chacara/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router';
import { errorResponse, jsonResponse, renderWithProviders } from '../../../test/helpers/render';
import { BookingDetailPage } from './BookingDetailPage';
import { MyBookingsPage } from './MyBookingsPage';

/**
 * Minhas reservas e detalhe (§13.3).
 *
 * O relógio é fixado porque a tela separa próximas de passadas e mostra quanto
 * falta para o prazo do pedido — sem data fixa, o resultado mudaria conforme o dia
 * em que o teste roda.
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

const USER: SessionUser = {
  id: 'u-1',
  name: 'Ana',
  email: 'ana@exemplo.com',
  phone: '11999990000',
  role: 'CLIENT',
  emailVerified: true,
};

function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'b-1',
    kind: 'VENUE',
    startDate: '2026-12-05',
    endDate: '2026-12-06',
    guestCount: 60,
    status: 'PENDING',
    holdExpiresAt: '2026-10-16T18:00:00.000Z',
    canCancel: true,
    cancelUntil: null,
    days: [
      { date: '2026-12-05', priceCents: 180_000, ruleName: 'Fim de semana' },
      { date: '2026-12-06', priceCents: 150_000, ruleName: null },
    ],
    dailyTotalCents: 330_000,
    items: [
      {
        itemId: 'i-1',
        name: 'Painel de balões arco-íris',
        quantity: 2,
        unitPriceCents: 12_000,
        totalCents: 24_000,
      },
    ],
    itemsTotalCents: 24_000,
    combos: [{ comboId: 'c-1', name: 'Combo Nuvens', times: 1, discountCents: 4_000 }],
    discountTotalCents: 4_000,
    totalCents: 350_000,
    customerNotes: null,
    cancelReason: null,
    createdAt: '2026-10-14T12:00:00.000Z',
    ...overrides,
  };
}

type Call = { url: string; method: string; body: unknown };
type Handler = (call: Call) => Response;

function stubFetch(routes: Record<string, Handler> = {}) {
  const calls: Call[] = [];

  const base: Record<string, Handler> = {
    'GET /api/public/venue': () => jsonResponse(VENUE),
    'POST /api/auth/refresh': () => jsonResponse({ accessToken: 'token', user: USER }),
    ...routes,
  };

  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: { method?: string; body?: string }) => {
      const call = {
        url,
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(init.body) : undefined,
      };
      calls.push(call);

      const handler = base[`${call.method} ${url.split('?')[0]!}`];
      if (handler) return Promise.resolve(handler(call));

      return Promise.resolve(jsonResponse([]));
    }),
  );

  return calls;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // 14/10/2026 às 12:00 em São Paulo.
  vi.setSystemTime(new Date('2026-10-14T15:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('MyBookingsPage', () => {
  function renderList(bookings: Booking[]) {
    stubFetch({ 'GET /api/bookings/me': () => jsonResponse(bookings) });
    return renderWithProviders(<MyBookingsPage />, { route: '/minhas-reservas' });
  }

  it('agrupa as reservas pelos títulos da §13.3', async () => {
    renderList([
      makeBooking({ id: 'futura', status: 'CONFIRMED', startDate: '2026-12-05' }),
      makeBooking({
        id: 'passada',
        status: 'COMPLETED',
        startDate: '2026-09-10',
        endDate: '2026-09-10',
      }),
      makeBooking({
        id: 'cancelada',
        status: 'CANCELLED',
        startDate: '2026-11-20',
        endDate: '2026-11-20',
      }),
    ]);

    expect(await screen.findByText('Próximas')).toBeVisible();
    expect(screen.getByText('Já aconteceram')).toBeVisible();
    expect(screen.getByText('Canceladas')).toBeVisible();
  });

  it('omite o grupo que não tem nenhuma reserva', async () => {
    renderList([makeBooking({ status: 'CONFIRMED' })]);

    expect(await screen.findByText('Próximas')).toBeVisible();
    expect(screen.queryByText('Canceladas')).not.toBeInTheDocument();
  });

  it('mostra status, datas e total de cada reserva', async () => {
    renderList([makeBooking({ status: 'CONFIRMED' })]);

    expect(await screen.findByText('Confirmada')).toBeVisible();
    expect(screen.getByText('5 a 6 de dezembro de 2026')).toBeVisible();
    expect(screen.getByText('R$ 3.500,00')).toBeVisible();
    // Singular: a tela mostrava "1 itens" antes da revisão da T30.
    expect(screen.getByText(/60 pessoas · 1 item/)).toBeVisible();
  });

  /* §13.3: pedido pendente mostra quando as datas deixam de ficar seguras. */
  it('conta quanto falta para o prazo do pedido', async () => {
    renderList([makeBooking({ status: 'PENDING', holdExpiresAt: '2026-10-16T18:00:00.000Z' })]);

    // De 14/10 15:00 UTC até 16/10 18:00 UTC são 2 dias e 3 horas.
    expect(await screen.findByText('Datas seguras em 2 dias')).toBeVisible();
  });

  it('arredonda o prazo para baixo, para não prometer tempo que não há', async () => {
    renderList([makeBooking({ status: 'PENDING', holdExpiresAt: '2026-10-14T16:50:00.000Z' })]);

    // Falta 1 h 50 min: "em 2 horas" daria à pessoa um tempo que ela não tem.
    expect(await screen.findByText('Datas seguras em 1 hora')).toBeVisible();
  });

  it('não mostra prazo em reserva confirmada', async () => {
    renderList([makeBooking({ status: 'CONFIRMED', holdExpiresAt: null })]);

    await screen.findByText('Confirmada');
    expect(screen.queryByText(/Datas seguras/)).not.toBeInTheDocument();
  });

  it('o cartão inteiro leva ao detalhe', async () => {
    renderList([makeBooking({ id: 'abc', status: 'CONFIRMED' })]);

    expect(await screen.findByRole('link', { name: /5 a 6 de dezembro/ })).toHaveAttribute(
      'href',
      '/reservas/abc',
    );
  });

  it('convida a montar um pedido quando não há nenhuma reserva', async () => {
    renderList([]);

    expect(await screen.findByText('Você ainda não tem reservas')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Montar um pedido' })).toHaveAttribute(
      'href',
      '/reservar',
    );
  });

  it('explica a falha em vez de mostrar lista vazia', async () => {
    stubFetch({
      'GET /api/bookings/me': () =>
        errorResponse(500, 'INTERNAL', 'Algo deu errado do nosso lado.'),
    });
    renderWithProviders(<MyBookingsPage />, { route: '/minhas-reservas' });

    expect(await screen.findByRole('alert')).toHaveTextContent('Algo deu errado do nosso lado.');
  });
});

describe('BookingDetailPage', () => {
  function renderDetail(booking: Booking | null, routes: Record<string, Handler> = {}) {
    const calls = stubFetch({
      ...(booking
        ? { 'GET /api/bookings/b-1': () => jsonResponse(booking) }
        : {
            'GET /api/bookings/b-1': () =>
              errorResponse(404, 'NOT_FOUND', 'Não encontramos esta reserva.'),
          }),
      ...routes,
    });

    /*
     * A rota é montada de verdade porque a tela lê o id com `useParams`: sem a
     * `<Route>`, o id vem vazio e a query nem dispara.
     */
    renderWithProviders(
      <Routes>
        <Route path="/reservas/:id" element={<BookingDetailPage />} />
      </Routes>,
      { route: '/reservas/b-1' },
    );

    return calls;
  }

  it('mostra o snapshot: diária por dia com a regra, itens e combos', async () => {
    renderDetail(makeBooking({ status: 'CONFIRMED' }));

    expect(await screen.findByText('Valores')).toBeVisible();
    expect(screen.getByText('Fim de semana')).toBeVisible();
    expect(screen.getByText('R$ 1.800,00')).toBeVisible();
    expect(screen.getByText('2× Painel de balões arco-íris')).toBeVisible();
    expect(screen.getByText('Combo Nuvens')).toBeVisible();
    expect(screen.getByText('R$ 3.500,00')).toBeVisible();
  });

  it('diz que foi só a chácara quando não havia itens', async () => {
    renderDetail(makeBooking({ items: [], itemsTotalCents: 0, combos: [] }));

    expect(await screen.findByText(/você alugou só a chácara/)).toBeVisible();
  });

  it('mostra a observação do cliente quando existe', async () => {
    renderDetail(makeBooking({ customerNotes: 'Chegamos na sexta para montar.' }));

    expect(await screen.findByText('Chegamos na sexta para montar.')).toBeVisible();
  });

  it('mostra o prazo do pedido em contagem e em data e hora', async () => {
    renderDetail(makeBooking({ status: 'PENDING', holdExpiresAt: '2026-10-16T18:00:00.000Z' }));

    expect(await screen.findByText(/em 2 dias/)).toBeVisible();
    // 18:00 UTC é 15:00 em São Paulo.
    expect(screen.getByText(/sexta-feira, 16 de outubro às 15:00/)).toBeVisible();
  });

  it('conta o motivo de uma reserva cancelada', async () => {
    renderDetail(
      makeBooking({ status: 'CANCELLED', canCancel: false, cancelReason: 'Mudamos a data.' }),
    );

    expect(await screen.findByText(/Esta reserva foi cancelada: Mudamos a data./)).toBeVisible();
  });

  /*
   * Quem decide é o servidor, pelo `canCancel`: o prazo depende de "hoje" na
   * chácara, e o relógio de quem olha pode estar em outro fuso.
   */
  it('oferece cancelar quando o servidor permite', async () => {
    renderDetail(makeBooking({ status: 'CONFIRMED', canCancel: true }));

    expect(await screen.findByRole('button', { name: 'Cancelar reserva' })).toBeVisible();
  });

  it('esconde o botão e explica o prazo quando o servidor não permite', async () => {
    renderDetail(makeBooking({ status: 'CONFIRMED', canCancel: false, cancelUntil: '2026-10-21' }));

    expect(await screen.findByText(/prazo para cancelar pelo site terminou/)).toBeVisible();
    expect(screen.getByText(/21 de outubro de 2026/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Cancelar reserva' })).not.toBeInTheDocument();
  });

  it('não oferece cancelar o que já foi cancelado', async () => {
    renderDetail(makeBooking({ status: 'CANCELLED', canCancel: false }));

    await screen.findByText(/Esta reserva foi cancelada/);
    expect(screen.queryByRole('button', { name: 'Cancelar reserva' })).not.toBeInTheDocument();
    // E não insiste num prazo que não existe mais.
    expect(screen.queryByText(/prazo para cancelar/)).not.toBeInTheDocument();
  });

  /* §13.4: ação destrutiva pede confirmação, com o resultado explicado. */
  it('confirma antes de cancelar, dizendo o que acontece', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderDetail(makeBooking({ status: 'CONFIRMED' }));

    await user.click(await screen.findByRole('button', { name: 'Cancelar reserva' }));

    expect(await screen.findByText('Cancelar esta reserva?')).toBeVisible();
    expect(screen.getByText(/voltam a ficar livres/)).toBeVisible();
    expect(screen.getByText(/Não dá para desfazer/)).toBeVisible();
  });

  it('não cancela nada se a pessoa mantiver a reserva', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const calls = renderDetail(makeBooking({ status: 'CONFIRMED' }));

    await user.click(await screen.findByRole('button', { name: 'Cancelar reserva' }));
    await user.click(screen.getByRole('button', { name: 'Manter a reserva' }));

    expect(calls.some((call) => call.method === 'PATCH')).toBe(false);
  });

  it('cancela com o motivo que a pessoa escreveu', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const calls = renderDetail(makeBooking({ status: 'CONFIRMED' }), {
      'PATCH /api/bookings/b-1/cancel': () =>
        jsonResponse(makeBooking({ status: 'CANCELLED', canCancel: false })),
    });

    await user.click(await screen.findByRole('button', { name: 'Cancelar reserva' }));
    await user.type(screen.getByLabelText('Quer contar o motivo?'), 'Mudamos a data.');
    await user.click(screen.getByRole('button', { name: 'Sim, cancelar' }));

    await waitFor(() => {
      expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({
        reason: 'Mudamos a data.',
      });
    });
  });

  /* O motivo é opcional: obrigar a justificar atrapalha quem só desistiu. */
  it('cancela sem motivo, mandando nulo em vez de string vazia', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const calls = renderDetail(makeBooking({ status: 'CONFIRMED' }), {
      'PATCH /api/bookings/b-1/cancel': () =>
        jsonResponse(makeBooking({ status: 'CANCELLED', canCancel: false })),
    });

    await user.click(await screen.findByRole('button', { name: 'Cancelar reserva' }));
    await user.click(screen.getByRole('button', { name: 'Sim, cancelar' }));

    await waitFor(() => {
      expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({ reason: null });
    });
  });

  it('mostra o novo status assim que o cancelamento volta', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderDetail(makeBooking({ status: 'CONFIRMED' }), {
      'PATCH /api/bookings/b-1/cancel': () =>
        jsonResponse(makeBooking({ status: 'CANCELLED', canCancel: false, cancelReason: null })),
    });

    await user.click(await screen.findByRole('button', { name: 'Cancelar reserva' }));
    await user.click(screen.getByRole('button', { name: 'Sim, cancelar' }));

    expect(await screen.findByText('Cancelada')).toBeVisible();
  });

  it('mantém o diálogo aberto com a mensagem quando a API recusa', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderDetail(makeBooking({ status: 'CONFIRMED' }), {
      'PATCH /api/bookings/b-1/cancel': () =>
        errorResponse(
          422,
          'CANCEL_WINDOW_CLOSED',
          'O prazo para cancelar pelo site terminou. Fale com a chácara pelo WhatsApp.',
        ),
    });

    await user.click(await screen.findByRole('button', { name: 'Cancelar reserva' }));
    await user.click(screen.getByRole('button', { name: 'Sim, cancelar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/prazo para cancelar/);
    expect(screen.getByText('Cancelar esta reserva?')).toBeVisible();
  });

  it('oferece o WhatsApp da chácara com a reserva na mensagem', async () => {
    renderDetail(makeBooking({ status: 'CONFIRMED' }));

    const link = await screen.findByRole('link', { name: 'Falar pelo WhatsApp' });
    expect(link).toHaveAttribute('href', expect.stringContaining('wa.me/5511999990000'));
    expect(link).toHaveAttribute('href', expect.stringContaining('5%20a%206%20de%20dezembro'));
  });

  /* §10.6: reserva de outra pessoa responde 404, e a tela não insinua o contrário. */
  it('explica quando a reserva não é desta conta', async () => {
    renderDetail(null);

    expect(await screen.findByText('Não encontramos esta reserva')).toBeVisible();
    expect(screen.getByRole('link', { name: /Voltar para minhas reservas/ })).toBeVisible();
  });
});

describe('status na lista', () => {
  const casos: [BookingStatus, string][] = [
    ['PENDING', 'Aguardando confirmação'],
    ['CONFIRMED', 'Confirmada'],
    ['CANCELLED', 'Cancelada'],
    ['COMPLETED', 'Concluída'],
  ];

  it.each(casos)('mostra %s como "%s"', async (status, label) => {
    stubFetch({
      'GET /api/bookings/me': () =>
        jsonResponse([makeBooking({ status, startDate: '2026-12-05', endDate: '2026-12-06' })]),
    });
    renderWithProviders(<MyBookingsPage />, { route: '/minhas-reservas' });

    expect(await screen.findByText(label)).toBeVisible();
  });
});
