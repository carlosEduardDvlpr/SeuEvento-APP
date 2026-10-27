import type { AdminBooking, AdminBookingSummary, AdminBookingsPage } from '@chacara/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/Toast';
import { errorResponse, jsonResponse, renderWithProviders } from '../../../../test/helpers/render';
import { BookingDetailPage } from './BookingDetailPage';
import { BookingsPage } from './BookingsPage';

/**
 * Lista e detalhe de reservas no painel (§13.4).
 *
 * O relógio é fixado porque as duas telas contam quanto falta para o prazo dos
 * pedidos — com data real o texto mudaria a cada execução.
 */

const RESUMO: AdminBookingSummary = {
  id: 'b-1',
  kind: 'VENUE',
  startDate: '2026-12-05',
  endDate: '2026-12-06',
  status: 'PENDING',
  guestCount: 60,
  totalCents: 436_000,
  holdExpiresAt: '2026-11-17T18:00:00.000Z',
  createdByAdmin: false,
  createdAt: '2026-11-14T12:00:00.000Z',
  customer: { id: 'u-1', name: 'Ana Beatriz', email: 'ana@exemplo.com', phone: '11988887777' },
};

function page(items: AdminBookingSummary[], overrides: Partial<AdminBookingsPage> = {}) {
  return {
    items,
    total: items.length,
    page: 1,
    pageSize: 20,
    ...overrides,
  } satisfies AdminBookingsPage;
}

const DETALHE: AdminBooking = {
  id: 'b-1',
  kind: 'VENUE',
  startDate: '2026-12-05',
  endDate: '2026-12-06',
  guestCount: 60,
  status: 'PENDING',
  holdExpiresAt: '2026-11-17T18:00:00.000Z',
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
  customerNotes: 'Chegamos na sexta para montar.',
  adminNotes: null,
  cancelReason: null,
  cancelledBy: null,
  createdByAdmin: false,
  createdAt: '2026-11-14T12:00:00.000Z',
  updatedAt: '2026-11-14T12:00:00.000Z',
  customer: { id: 'u-1', name: 'Ana Beatriz', email: 'ana@exemplo.com', phone: '11988887777' },
  allowedTransitions: ['CONFIRMED', 'CANCELLED'],
};

type Call = { url: string; method: string; body: unknown };
type Handler = (call: Call) => Response;

function stubFetch(routes: Record<string, Handler> = {}, fallback?: Handler) {
  const calls: Call[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: { method?: string; body?: string }) => {
      const call = {
        url,
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(init.body) : undefined,
      };
      calls.push(call);

      const path = url.split('?')[0]!;
      const handler = routes[`${call.method} ${path}`];

      if (handler) return Promise.resolve(handler(call));
      if (fallback) return Promise.resolve(fallback(call));

      return Promise.resolve(jsonResponse([]));
    }),
  );

  return calls;
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

describe('BookingsPage', () => {
  function renderList(routes: Record<string, Handler> = {}) {
    const calls = stubFetch({
      'GET /api/admin/bookings': () => jsonResponse(page([RESUMO])),
      ...routes,
    });

    renderWithProviders(
      <ToastProvider>
        <BookingsPage />
      </ToastProvider>,
      { route: '/admin/reservas', withAuth: false },
    );

    return calls;
  }

  it('lista a reserva com cliente, datas e total', async () => {
    renderList();

    const dates = await screen.findByText('5 a 6 de dezembro de 2026');
    // Dentro do cartão: "Aguardando confirmação" também é opção do filtro.
    const card = within(dates.closest('li')!);

    expect(card.getByText('Ana Beatriz')).toBeVisible();
    expect(card.getByText('R$ 4.360,00')).toBeVisible();
    expect(card.getByText('Aguardando confirmação')).toBeVisible();
  });

  it('diz quando o pedido chegou', async () => {
    renderList();

    expect(await screen.findByText(/pedido de 14\/11\/2026/)).toBeVisible();
  });

  /* §13.4: o prazo decide a ordem de atenção do dono. */
  it('conta quanto falta para responder', async () => {
    renderList();

    // De 15/11 15:00 UTC até 17/11 18:00 UTC são 2 dias e 3 horas.
    expect(await screen.findByText('Responder em 2 dias')).toBeVisible();
  });

  it('não conta prazo para reserva confirmada', async () => {
    renderList({
      'GET /api/admin/bookings': () =>
        jsonResponse(page([{ ...RESUMO, status: 'CONFIRMED', holdExpiresAt: null }])),
    });

    await screen.findByText('Confirmada');
    expect(screen.queryByText(/Responder/)).not.toBeInTheDocument();
  });

  it('marca a reserva que o próprio dono lançou', async () => {
    renderList({
      'GET /api/admin/bookings': () => jsonResponse(page([{ ...RESUMO, createdByAdmin: true }])),
    });

    expect(await screen.findByText('lançada por você')).toBeVisible();
  });

  it('o cartão leva ao detalhe', async () => {
    renderList();

    expect(await screen.findByRole('link', { name: /5 a 6 de dezembro/ })).toHaveAttribute(
      'href',
      '/admin/reservas/b-1',
    );
  });

  it('informa quantas reservas o filtro encontrou', async () => {
    renderList();

    expect(await screen.findByRole('status')).toHaveTextContent('1 reserva');
  });

  it('filtra por situação', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const calls = renderList();

    await screen.findByText('Ana Beatriz');
    await user.selectOptions(screen.getByLabelText('Situação'), 'CONFIRMED');

    await waitFor(() => {
      expect(calls.some((call) => call.url.includes('status=CONFIRMED'))).toBe(true);
    });
  });

  it('filtra por período', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const calls = renderList();

    await screen.findByText('Ana Beatriz');
    await user.type(screen.getByLabelText('De'), '2026-12-01');
    await user.type(screen.getByLabelText('Até'), '2026-12-31');

    await waitFor(() => {
      expect(
        calls.some(
          (call) => call.url.includes('from=2026-12-01') && call.url.includes('to=2026-12-31'),
        ),
      ).toBe(true);
    });
  });

  /*
   * A busca espera a pessoa parar de digitar: sem debounce, "Ana" viraria três
   * requisições e a lista piscaria resultados intermediários.
   */
  it('busca sem uma requisição por tecla', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const calls = renderList();

    await screen.findByText('Ana Beatriz');
    const before = calls.filter((call) => call.url.includes('q=')).length;

    await user.type(screen.getByLabelText('Buscar cliente'), 'Ana');

    await waitFor(() => {
      expect(calls.some((call) => call.url.includes('q=Ana'))).toBe(true);
    });

    const after = calls.filter((call) => call.url.includes('q=')).length;
    expect(after - before).toBeLessThan(3);
  });

  it('oferece limpar os filtros e volta a listar tudo', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const calls = renderList();

    await screen.findByText('Ana Beatriz');
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Situação'), 'CANCELLED');
    await user.click(await screen.findByRole('button', { name: 'Limpar filtros' }));

    await waitFor(() => {
      expect(calls.at(-1)?.url).toBe('/api/admin/bookings?page=1');
    });
  });

  it('explica o vazio sem filtro', async () => {
    renderList({ 'GET /api/admin/bookings': () => jsonResponse(page([])) });

    expect(await screen.findByText('Nenhuma reserva ainda')).toBeVisible();
    expect(screen.getByText(/aparece aqui para você confirmar/)).toBeVisible();
  });

  it('explica o vazio com filtro e oferece limpar', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderList({ 'GET /api/admin/bookings': () => jsonResponse(page([])) });

    await screen.findByText('Nenhuma reserva ainda');
    await user.selectOptions(screen.getByLabelText('Situação'), 'CANCELLED');

    expect(await screen.findByText('Nada com esses filtros')).toBeVisible();
  });

  describe('paginação', () => {
    const muitas = page([RESUMO], { total: 45, pageSize: 20 });

    it('mostra a página atual e o total de páginas', async () => {
      renderList({ 'GET /api/admin/bookings': () => jsonResponse(muitas) });

      expect(await screen.findByText('Página 1 de 3')).toBeVisible();
    });

    it('desabilita "Anterior" na primeira página', async () => {
      renderList({ 'GET /api/admin/bookings': () => jsonResponse(muitas) });

      expect(await screen.findByRole('button', { name: 'Anterior' })).toBeDisabled();
    });

    it('pede a página seguinte', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const calls = renderList({ 'GET /api/admin/bookings': () => jsonResponse(muitas) });

      await screen.findByText('Página 1 de 3');
      await user.click(screen.getByRole('button', { name: 'Próxima' }));

      await waitFor(() => {
        expect(calls.some((call) => call.url.includes('page=2'))).toBe(true);
      });
    });

    it('não pagina quando tudo cabe numa página', async () => {
      renderList();

      await screen.findByText('Ana Beatriz');
      expect(screen.queryByRole('button', { name: 'Próxima' })).not.toBeInTheDocument();
    });
  });

  it('explica a falha em vez de mostrar lista vazia', async () => {
    renderList({
      'GET /api/admin/bookings': () => errorResponse(500, 'INTERNAL', 'Algo deu errado.'),
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Algo deu errado.');
  });
});

describe('BookingDetailPage, painel', () => {
  function renderDetail(booking: AdminBooking | null, routes: Record<string, Handler> = {}) {
    const calls = stubFetch({
      'GET /api/admin/bookings/b-1': () =>
        booking
          ? jsonResponse(booking)
          : errorResponse(404, 'NOT_FOUND', 'Não encontramos esta reserva.'),
      ...routes,
    });

    renderWithProviders(
      <ToastProvider>
        <Routes>
          <Route path="/admin/reservas/:id" element={<BookingDetailPage />} />
        </Routes>
      </ToastProvider>,
      { route: '/admin/reservas/b-1', withAuth: false },
    );

    return calls;
  }

  it('mostra o snapshot: diárias com a regra, itens e combos', async () => {
    renderDetail(DETALHE);

    expect(await screen.findByText('Valores')).toBeVisible();
    expect(screen.getByText('Fim de semana')).toBeVisible();
    expect(screen.getByText('R$ 1.800,00')).toBeVisible();
    expect(screen.getByText('2× Painel de balões arco-íris')).toBeVisible();
    expect(screen.getByText('Combo Nuvens')).toBeVisible();
  });

  it('mostra o contato do cliente e o WhatsApp', async () => {
    renderDetail(DETALHE);

    expect(await screen.findByText('Ana Beatriz')).toBeVisible();
    expect(screen.getByText('ana@exemplo.com')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Falar pelo WhatsApp' })).toHaveAttribute(
      'href',
      expect.stringContaining('wa.me/5511988887777'),
    );
  });

  it('diz "não informado" no contato que falta', async () => {
    renderDetail({
      ...DETALHE,
      customer: { ...DETALHE.customer, email: null, phone: null },
    });

    expect((await screen.findAllByText('não informado')).length).toBe(2);
    expect(screen.queryByRole('link', { name: 'Falar pelo WhatsApp' })).not.toBeInTheDocument();
  });

  it('cita o que o cliente escreveu', async () => {
    renderDetail(DETALHE);

    expect(await screen.findByText('Chegamos na sexta para montar.')).toBeVisible();
  });

  it('conta o prazo do pedido em contagem e em data e hora', async () => {
    renderDetail(DETALHE);

    expect(await screen.findByText(/em 2 dias/)).toBeVisible();
    // 18:00 UTC é 15:00 em São Paulo.
    expect(screen.getByText(/terça-feira, 17 de novembro às 15:00/)).toBeVisible();
  });

  /*
   * Quais decisões existem é o servidor que diz, pelo `allowedTransitions`: a
   * máquina de estados da §9.2 é regra de negócio, e uma cópia na tela divergiria.
   */
  it('oferece as transições que o servidor permite', async () => {
    renderDetail(DETALHE);

    expect(await screen.findByRole('button', { name: 'Confirmar reserva' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cancelar reserva' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Marcar como concluída' })).not.toBeInTheDocument();
  });

  it('oferece concluir quando a reserva está confirmada', async () => {
    renderDetail({
      ...DETALHE,
      status: 'CONFIRMED',
      holdExpiresAt: null,
      allowedTransitions: ['CANCELLED', 'COMPLETED'],
    });

    expect(await screen.findByRole('button', { name: 'Marcar como concluída' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Confirmar reserva' })).not.toBeInTheDocument();
  });

  it('diz que não há mais o que mudar quando a reserva é final', async () => {
    renderDetail({
      ...DETALHE,
      status: 'CANCELLED',
      holdExpiresAt: null,
      allowedTransitions: [],
      cancelReason: 'Mudou a data.',
      cancelledBy: 'CLIENT',
    });

    expect(await screen.findByText(/cancelada e não muda mais/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Cancelar reserva' })).not.toBeInTheDocument();
  });

  /* §13.4: a confirmação explica o resultado, não pergunta "tem certeza?". */
  it('explica o que a confirmação causa antes de aplicar', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderDetail(DETALHE);

    await user.click(await screen.findByRole('button', { name: 'Confirmar reserva' }));

    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByText(/recebe um e-mail com as datas/)).toBeVisible();
    expect(dialog.getByText(/Ana Beatriz/)).toBeVisible();
  });

  it('confirma a reserva', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const calls = renderDetail(DETALHE, {
      'PATCH /api/admin/bookings/b-1/status': () =>
        jsonResponse({ ...DETALHE, status: 'CONFIRMED', allowedTransitions: ['COMPLETED'] }),
    });

    await user.click(await screen.findByRole('button', { name: 'Confirmar reserva' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Confirmar reserva' }));

    await waitFor(() => {
      expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({
        status: 'CONFIRMED',
        reason: null,
      });
    });
  });

  /* §11.3: o motivo é obrigatório para cancelar — vai no e-mail do cliente. */
  it('não deixa cancelar sem motivo', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const calls = renderDetail(DETALHE);

    await user.click(await screen.findByRole('button', { name: 'Cancelar reserva' }));

    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByRole('button', { name: 'Cancelar reserva' })).toBeDisabled();
    expect(calls.some((call) => call.method === 'PATCH')).toBe(false);
  });

  it('cancela com o motivo escrito', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const calls = renderDetail(DETALHE, {
      'PATCH /api/admin/bookings/b-1/status': () =>
        jsonResponse({
          ...DETALHE,
          status: 'CANCELLED',
          allowedTransitions: [],
          cancelReason: 'Obra na cozinha.',
          cancelledBy: 'ADMIN',
        }),
    });

    await user.click(await screen.findByRole('button', { name: 'Cancelar reserva' }));
    await user.type(await screen.findByLabelText('Motivo do cancelamento'), 'Obra na cozinha.');

    const dialog = within(screen.getByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Cancelar reserva' }));

    await waitFor(() => {
      expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({
        status: 'CANCELLED',
        reason: 'Obra na cozinha.',
      });
    });
  });

  it('avisa a mudança e mostra o novo estado', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderDetail(DETALHE, {
      'PATCH /api/admin/bookings/b-1/status': () =>
        jsonResponse({
          ...DETALHE,
          status: 'CONFIRMED',
          holdExpiresAt: null,
          allowedTransitions: ['CANCELLED', 'COMPLETED'],
        }),
    });

    await user.click(await screen.findByRole('button', { name: 'Confirmar reserva' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Confirmar reserva' }));

    // O aviso e o selo de status dizem a mesma palavra, cada um no seu lugar.
    expect(await screen.findByRole('status')).toHaveTextContent(/confirmada/i);
    expect(screen.getAllByText('Confirmada').length).toBeGreaterThan(0);
  });

  it('conta o problema quando a API recusa a mudança', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderDetail(DETALHE, {
      'PATCH /api/admin/bookings/b-1/status': () =>
        errorResponse(
          422,
          'INVALID_TRANSITION',
          'Esta reserva mudou enquanto você olhava. Recarregue a página.',
        ),
    });

    await user.click(await screen.findByRole('button', { name: 'Confirmar reserva' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Confirmar reserva' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('mudou enquanto você olhava');
  });

  describe('anotação interna', () => {
    it('deixa claro que o cliente não vê', async () => {
      renderDetail(DETALHE);

      expect(await screen.findByText(/Só você vê/)).toBeVisible();
    });

    it('começa com o que estava gravado', async () => {
      renderDetail({ ...DETALHE, adminNotes: 'Pediu desconto.' });

      expect(await screen.findByLabelText('Anotação interna')).toHaveValue('Pediu desconto.');
    });

    it('o botão de salvar fica inativo sem mudança', async () => {
      renderDetail({ ...DETALHE, adminNotes: 'Pediu desconto.' });

      expect(await screen.findByRole('button', { name: 'Salvar anotação' })).toBeDisabled();
    });

    it('salva o texto digitado', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const calls = renderDetail(DETALHE, {
        'PATCH /api/admin/bookings/b-1/notes': () =>
          jsonResponse({ ...DETALHE, adminNotes: 'Retirada na sexta.' }),
      });

      await user.type(await screen.findByLabelText('Anotação interna'), 'Retirada na sexta.');
      await user.click(screen.getByRole('button', { name: 'Salvar anotação' }));

      await waitFor(() => {
        expect(calls.find((call) => call.url.endsWith('/notes'))?.body).toEqual({
          adminNotes: 'Retirada na sexta.',
        });
      });
    });

    it('texto em branco vira nulo, não string vazia', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const calls = renderDetail(
        { ...DETALHE, adminNotes: 'Algo' },
        {
          'PATCH /api/admin/bookings/b-1/notes': () =>
            jsonResponse({ ...DETALHE, adminNotes: null }),
        },
      );

      await user.clear(await screen.findByLabelText('Anotação interna'));
      await user.click(screen.getByRole('button', { name: 'Salvar anotação' }));

      await waitFor(() => {
        expect(calls.find((call) => call.url.endsWith('/notes'))?.body).toEqual({
          adminNotes: null,
        });
      });
    });
  });

  describe('como chegou até aqui', () => {
    it('diz quando o pedido chegou e por onde', async () => {
      renderDetail(DETALHE);

      expect(await screen.findByText(/Pedido recebido/)).toBeVisible();
      expect(screen.getByText(/enviado pelo site/)).toBeVisible();
    });

    it('marca a reserva lançada no painel', async () => {
      renderDetail({ ...DETALHE, createdByAdmin: true });

      expect(await screen.findByText(/lançado por você no painel/)).toBeVisible();
    });

    it('registra quem cancelou e por quê', async () => {
      renderDetail({
        ...DETALHE,
        status: 'CANCELLED',
        allowedTransitions: [],
        cancelledBy: 'ADMIN',
        cancelReason: 'Obra na cozinha.',
      });

      // "Cancelada" sozinho também é o selo de status; aqui interessa a linha.
      expect(await screen.findByText(/por você: Obra na cozinha./)).toBeVisible();
    });

    /* Cancelamento pelo job não tem autor: foi o prazo que venceu (§9.9). */
    it('atribui ao prazo o cancelamento sem autor', async () => {
      renderDetail({
        ...DETALHE,
        status: 'CANCELLED',
        allowedTransitions: [],
        cancelledBy: null,
        cancelReason: 'HOLD_EXPIRED',
      });

      expect(await screen.findByText(/por prazo vencido/)).toBeVisible();
    });

    it('registra o cancelamento feito pelo cliente', async () => {
      renderDetail({
        ...DETALHE,
        status: 'CANCELLED',
        allowedTransitions: [],
        cancelledBy: 'CLIENT',
        cancelReason: null,
      });

      expect(await screen.findByText(/pelo cliente/)).toBeVisible();
    });
  });

  it('explica quando a reserva não existe', async () => {
    renderDetail(null);

    expect(await screen.findByText('Não encontramos esta reserva')).toBeVisible();
    expect(screen.getByRole('link', { name: /Voltar para as reservas/ })).toBeVisible();
  });
});
