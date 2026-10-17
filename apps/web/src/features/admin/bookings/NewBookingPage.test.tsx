import type { AdminCustomer, CatalogItem, Quote } from '@chacara/shared';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/Toast';
import { errorResponse, jsonResponse, renderWithProviders } from '../../../../test/helpers/render';
import { NewBookingPage } from './NewBookingPage';

/**
 * Reserva manual (§9.8, §13.4).
 *
 * O que está sob teste: o total enviado é o que o **servidor** calculou (§9.7), o
 * cliente pode ser escolhido ou criado, e as recusas da API chegam à tela.
 */

const ANA: AdminCustomer = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Ana Beatriz',
  email: 'ana@exemplo.com',
  phone: '11988887777',
  hasAccess: true,
  emailVerified: true,
  createdAt: '2026-09-10T12:00:00.000Z',
  bookingCount: 2,
};

const PAINEL: CatalogItem = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Painel de balões arco-íris',
  description: null,
  imageUrl: null,
  priceCents: 12_000,
  stock: 3,
  assemblyNotes: null,
  sortOrder: 1,
  category: { id: 'c1', name: 'Painéis', sortOrder: 1 },
  themeIds: [],
};

const QUOTE: Quote = {
  available: true,
  issues: [],
  days: [
    { date: '2027-04-09', priceCents: 180_000, ruleName: 'Fim de semana' },
    { date: '2027-04-10', priceCents: 150_000, ruleName: null },
  ],
  dailyTotalCents: 330_000,
  lines: [],
  itemsTotalCents: 0,
  combos: [],
  discountTotalCents: 0,
  totalCents: 330_000,
};

type Call = { url: string; method: string; body: unknown };
type Handler = (call: Call) => Response;

function stubFetch(routes: Record<string, Handler> = {}) {
  const calls: Call[] = [];

  const base: Record<string, Handler> = {
    'GET /api/admin/customers': () =>
      jsonResponse({ items: [ANA], total: 1, page: 1, pageSize: 20 }),
    'GET /api/items': () => jsonResponse([PAINEL]),
    'POST /api/pricing/quote': () => jsonResponse(QUOTE),
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

function renderPage(routes: Record<string, Handler> = {}) {
  const calls = stubFetch(routes);

  renderWithProviders(
    <ToastProvider>
      <NewBookingPage />
    </ToastProvider>,
    { route: '/admin/reservas/nova', withAuth: false },
  );

  return calls;
}

/**
 * Preenche datas e convidados, que é o mínimo para o orçamento aparecer.
 *
 * As datas vão por `fireEvent.change` em vez de digitação: num `input[type=date]`
 * cada tecla dispara `onChange` com um valor parcial, e o preenchimento automático
 * da saída reage a esses valores intermediários. O que este helper precisa é das
 * datas prontas; quem exercita a digitação é o caso dedicado.
 */
async function fillParty(user: ReturnType<typeof userEvent.setup>) {
  fireEvent.change(await screen.findByLabelText('Entrada'), { target: { value: '2027-04-09' } });
  fireEvent.change(screen.getByLabelText('Saída'), { target: { value: '2027-04-10' } });

  const guests = screen.getByLabelText('Convidados');
  await user.clear(guests);
  await user.type(guests, '80');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('NewBookingPage', () => {
  it('começa escolhendo cliente já cadastrado', async () => {
    renderPage();

    expect(await screen.findByRole('button', { name: 'Cliente já cadastrado' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByLabelText('Procurar cliente')).toBeVisible();
  });

  it('lista os clientes e deixa escolher um', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Ana Beatriz/ }));

    expect(await screen.findByText('Ana Beatriz')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Trocar' })).toBeVisible();
  });

  it('deixa trocar o cliente escolhido', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Ana Beatriz/ }));
    await user.click(screen.getByRole('button', { name: 'Trocar' }));

    expect(await screen.findByLabelText('Procurar cliente')).toBeVisible();
  });

  it('troca para o cadastro na hora', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Cadastrar agora' }));

    expect(await screen.findByLabelText('Nome')).toBeVisible();
    expect(screen.getByLabelText('WhatsApp')).toBeVisible();
    expect(screen.queryByLabelText('Procurar cliente')).not.toBeInTheDocument();
  });

  it('diz que precisa de datas antes de mostrar valor', async () => {
    renderPage();

    expect(await screen.findByText('Escolha as datas para ver o valor.')).toBeVisible();
  });

  /* §9.7: o total é o do servidor; a tela não soma nada. */
  it('pede o orçamento ao servidor e mostra o que ele devolveu', async () => {
    const user = userEvent.setup();
    const calls = renderPage();

    await fillParty(user);

    expect(await screen.findByText('R$ 3.300,00')).toBeVisible();
    expect(screen.getByText(/Fim de semana/)).toBeVisible();

    await waitFor(() => {
      expect(calls.find((call) => call.url === '/api/pricing/quote')?.body).toMatchObject({
        startDate: '2027-04-09',
        endDate: '2027-04-10',
      });
    });
  });

  it('a saída acompanha a entrada quando ficaria antes dela', async () => {
    renderPage();

    fireEvent.change(await screen.findByLabelText('Entrada'), { target: { value: '2027-04-09' } });

    expect(screen.getByLabelText('Saída')).toHaveValue('2027-04-09');
  });

  it('não encurta a saída que já estava depois da entrada', async () => {
    renderPage();

    fireEvent.change(await screen.findByLabelText('Entrada'), { target: { value: '2027-04-09' } });
    fireEvent.change(screen.getByLabelText('Saída'), { target: { value: '2027-04-12' } });
    fireEvent.change(screen.getByLabelText('Entrada'), { target: { value: '2027-04-10' } });

    expect(screen.getByLabelText('Saída')).toHaveValue('2027-04-12');
  });

  it('lança a reserva com o total que o servidor calculou', async () => {
    const user = userEvent.setup();
    const calls = renderPage({
      'POST /api/admin/bookings': () => jsonResponse({ id: 'b-1' }, 201),
    });

    await user.click(await screen.findByRole('button', { name: /Ana Beatriz/ }));
    await fillParty(user);
    await screen.findByText('R$ 3.300,00');
    await user.click(screen.getByRole('button', { name: 'Lançar reserva' }));

    await waitFor(() => {
      expect(calls.find((call) => call.url === '/api/admin/bookings')?.body).toMatchObject({
        customerId: ANA.id,
        startDate: '2027-04-09',
        endDate: '2027-04-10',
        guestCount: 80,
        expectedTotalCents: 330_000,
        confirmed: true,
      });
    });
  });

  it('manda o cliente novo junto, sem e-mail quando não há', async () => {
    const user = userEvent.setup();
    const calls = renderPage({
      'POST /api/admin/bookings': () => jsonResponse({ id: 'b-1' }, 201),
    });

    await user.click(await screen.findByRole('button', { name: 'Cadastrar agora' }));
    await user.type(await screen.findByLabelText('Nome'), 'Carla Dias');
    await user.type(screen.getByLabelText('WhatsApp'), '11977771234');
    await fillParty(user);
    await screen.findByText('R$ 3.300,00');
    await user.click(screen.getByRole('button', { name: 'Lançar reserva' }));

    await waitFor(() => {
      expect(calls.find((call) => call.url === '/api/admin/bookings')?.body).toMatchObject({
        customer: { name: 'Carla Dias', phone: '11977771234' },
      });
    });

    const body = calls.find((call) => call.url === '/api/admin/bookings')?.body as {
      customer: Record<string, unknown>;
    };
    expect(body.customer).not.toHaveProperty('email');
  });

  it('inclui os itens escolhidos no orçamento e no envio', async () => {
    const user = userEvent.setup();
    const calls = renderPage({
      'POST /api/admin/bookings': () => jsonResponse({ id: 'b-1' }, 201),
    });

    await user.click(await screen.findByRole('button', { name: /Ana Beatriz/ }));
    await fillParty(user);
    await user.click(screen.getByRole('button', { name: 'Aumentar Painel de balões arco-íris' }));

    await waitFor(() => {
      expect(
        calls.some(
          (call) =>
            call.url === '/api/pricing/quote' && JSON.stringify(call.body).includes(PAINEL.id),
        ),
      ).toBe(true);
    });
  });

  it('respeita o estoque do item', async () => {
    const user = userEvent.setup();
    renderPage({ 'GET /api/items': () => jsonResponse([{ ...PAINEL, stock: 1 }]) });

    const more = await screen.findByRole('button', {
      name: 'Aumentar Painel de balões arco-íris',
    });
    await user.click(more);

    expect(more).toBeDisabled();
  });

  it('deixa lançar aguardando confirmação', async () => {
    const user = userEvent.setup();
    const calls = renderPage({
      'POST /api/admin/bookings': () => jsonResponse({ id: 'b-1' }, 201),
    });

    await user.click(await screen.findByRole('button', { name: /Ana Beatriz/ }));
    await fillParty(user);
    await screen.findByText('R$ 3.300,00');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Lançar reserva' }));

    await waitFor(() => {
      expect(calls.find((call) => call.url === '/api/admin/bookings')?.body).toMatchObject({
        confirmed: false,
      });
    });
  });

  /* A tela diz o que cada escolha causa, em vez de só nomear a opção. */
  it('explica a consequência de confirmar ou deixar aguardando', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText(/recebe o e-mail de confirmação/)).toBeVisible();

    await user.click(screen.getByRole('checkbox'));

    expect(await screen.findByText(/ninguém é avisado/)).toBeVisible();
  });

  it('não deixa lançar sem o valor calculado', async () => {
    renderPage();

    expect(await screen.findByRole('button', { name: 'Lançar reserva' })).toBeDisabled();
  });

  it('exige um cliente antes de lançar', async () => {
    const user = userEvent.setup();
    const calls = renderPage();

    await fillParty(user);
    await screen.findByText('R$ 3.300,00');
    await user.click(screen.getByRole('button', { name: 'Lançar reserva' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Procurar cliente')).toHaveAttribute('aria-invalid', 'true');
    });
    expect(calls.some((call) => call.url === '/api/admin/bookings')).toBe(false);
  });

  it('mostra os problemas que o orçamento aponta', async () => {
    const user = userEvent.setup();
    renderPage({
      'POST /api/pricing/quote': () =>
        jsonResponse({
          ...QUOTE,
          available: false,
          issues: [{ code: 'DATE_UNAVAILABLE', dates: ['2027-04-09'] }],
        }),
    });

    await fillParty(user);

    expect(await screen.findByText(/já está ocupada ou bloqueada/)).toBeVisible();
  });

  /* O mesmo núcleo transacional do cliente: a data pode cair entre ver e lançar. */
  it('conta quando a API recusa a data', async () => {
    const user = userEvent.setup();
    renderPage({
      'POST /api/admin/bookings': () =>
        errorResponse(409, 'DATE_UNAVAILABLE', 'Alguém reservou essas datas agora mesmo.'),
    });

    await user.click(await screen.findByRole('button', { name: /Ana Beatriz/ }));
    await fillParty(user);
    await screen.findByText('R$ 3.300,00');
    await user.click(screen.getByRole('button', { name: 'Lançar reserva' }));

    expect(
      (await screen.findAllByText('Alguém reservou essas datas agora mesmo.')).length,
    ).toBeGreaterThan(0);
  });

  it('conta quando o preço mudou', async () => {
    const user = userEvent.setup();
    renderPage({
      'POST /api/admin/bookings': () =>
        errorResponse(409, 'PRICE_CHANGED', 'O valor mudou. Confira o novo total antes de enviar.'),
    });

    await user.click(await screen.findByRole('button', { name: /Ana Beatriz/ }));
    await fillParty(user);
    await screen.findByText('R$ 3.300,00');
    await user.click(screen.getByRole('button', { name: 'Lançar reserva' }));

    expect((await screen.findAllByText(/O valor mudou/)).length).toBeGreaterThan(0);
  });
});
