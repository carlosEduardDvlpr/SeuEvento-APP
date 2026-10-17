import type { AdminCustomer, AdminCustomerDetail } from '@chacara/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/Toast';
import { errorResponse, jsonResponse, renderWithProviders } from '../../../../test/helpers/render';
import { CustomerDetailPage } from './CustomerDetailPage';
import { CustomersPage } from './CustomersPage';

/**
 * Clientes no painel (§13.4) e o cadastro sem senha da §9.8.
 */

const ANA: AdminCustomer = {
  id: 'u-1',
  name: 'Ana Beatriz',
  email: 'ana@exemplo.com',
  phone: '11988887777',
  hasAccess: true,
  emailVerified: true,
  createdAt: '2026-09-10T12:00:00.000Z',
  bookingCount: 2,
};

/** Cliente que o dono cadastrou: sem senha, sem e-mail. */
const CARLA: AdminCustomer = {
  id: 'u-2',
  name: 'Carla Dias',
  email: null,
  phone: '11977771234',
  hasAccess: false,
  emailVerified: false,
  createdAt: '2026-10-01T12:00:00.000Z',
  bookingCount: 0,
};

const DETALHE: AdminCustomerDetail = {
  ...ANA,
  bookings: [
    {
      id: 'b-1',
      startDate: '2026-12-05',
      endDate: '2026-12-06',
      status: 'CONFIRMED',
      eventType: 'BABY_SHOWER',
      guestCount: 60,
      totalCents: 436_000,
      holdExpiresAt: null,
      createdByAdmin: false,
      createdAt: '2026-11-14T12:00:00.000Z',
      customer: { id: ANA.id, name: ANA.name, email: ANA.email, phone: ANA.phone },
    },
  ],
};

type Call = { url: string; method: string; body: unknown };
type Handler = (call: Call) => Response;

function stubFetch(routes: Record<string, Handler> = {}) {
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

      const handler = routes[`${call.method} ${url.split('?')[0]!}`];
      if (handler) return Promise.resolve(handler(call));

      return Promise.resolve(jsonResponse([]));
    }),
  );

  return calls;
}

function page(items: AdminCustomer[], total = items.length, pageSize = 20) {
  return { items, total, page: 1, pageSize };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CustomersPage', () => {
  function renderList(routes: Record<string, Handler> = {}) {
    const calls = stubFetch({
      'GET /api/admin/customers': () => jsonResponse(page([ANA, CARLA])),
      ...routes,
    });

    renderWithProviders(
      <ToastProvider>
        <CustomersPage />
      </ToastProvider>,
      { route: '/admin/clientes', withAuth: false },
    );

    return calls;
  }

  it('lista nome, contato e quantas reservas cada um tem', async () => {
    renderList();

    expect(await screen.findByRole('link', { name: 'Ana Beatriz' })).toBeVisible();
    expect(screen.getByText(/11988887777 · ana@exemplo.com/)).toBeVisible();
    expect(screen.getByText(/2 reservas/)).toBeVisible();
  });

  it('usa singular com uma reserva e diz quando não há nenhuma', async () => {
    renderList({
      'GET /api/admin/customers': () => jsonResponse(page([{ ...ANA, bookingCount: 1 }, CARLA])),
    });

    expect(await screen.findByText(/1 reserva ·/)).toBeVisible();
    expect(screen.getByText(/nenhuma reserva/)).toBeVisible();
  });

  /* §9.8: a conta criada pelo dono não tem senha nem Google. */
  it('marca quem não consegue entrar no site', async () => {
    renderList();

    expect(await screen.findByText('cadastrado por você, sem acesso ao site')).toBeVisible();
  });

  it('não marca quem tem acesso', async () => {
    renderList({ 'GET /api/admin/customers': () => jsonResponse(page([ANA])) });

    await screen.findByRole('link', { name: 'Ana Beatriz' });
    expect(screen.queryByText(/sem acesso ao site/)).not.toBeInTheDocument();
  });

  it('diz "sem telefone" em vez de deixar o espaço vazio', async () => {
    renderList({
      'GET /api/admin/customers': () => jsonResponse(page([{ ...CARLA, phone: null }])),
    });

    expect(await screen.findByText('sem telefone')).toBeVisible();
  });

  it('oferece WhatsApp de quem tem telefone', async () => {
    renderList({ 'GET /api/admin/customers': () => jsonResponse(page([ANA])) });

    expect(await screen.findByRole('link', { name: 'WhatsApp' })).toHaveAttribute(
      'href',
      expect.stringContaining('wa.me/5511988887777'),
    );
  });

  it('o nome leva ao detalhe', async () => {
    renderList();

    expect(await screen.findByRole('link', { name: 'Ana Beatriz' })).toHaveAttribute(
      'href',
      '/admin/clientes/u-1',
    );
  });

  it('busca sem uma requisição por tecla', async () => {
    const user = userEvent.setup();
    const calls = renderList();

    await screen.findByRole('link', { name: 'Ana Beatriz' });
    await user.type(screen.getByLabelText('Buscar'), 'Ana');

    await waitFor(() => {
      expect(calls.some((call) => call.url.includes('q=Ana'))).toBe(true);
    });

    expect(calls.filter((call) => call.url.includes('q=')).length).toBeLessThan(3);
  });

  it('explica o vazio e convida a cadastrar', async () => {
    renderList({ 'GET /api/admin/customers': () => jsonResponse(page([])) });

    expect(await screen.findByText('Nenhum cliente ainda')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cadastrar um cliente' })).toBeVisible();
  });

  it('explica o vazio da busca sem convidar a cadastrar', async () => {
    const user = userEvent.setup();
    renderList({ 'GET /api/admin/customers': () => jsonResponse(page([])) });

    await screen.findByText('Nenhum cliente ainda');
    await user.type(screen.getByLabelText('Buscar'), 'ninguem');

    expect(await screen.findByText('Ninguém com esse nome')).toBeVisible();
  });

  describe('cadastro sem senha', () => {
    it('explica que a conta nasce sem senha e pode ser assumida depois', async () => {
      const user = userEvent.setup();
      renderList();

      await user.click(await screen.findByRole('button', { name: /Novo cliente/ }));

      const dialog = within(await screen.findByRole('dialog'));
      expect(dialog.getByText(/criada sem senha/)).toBeVisible();
      expect(dialog.getByText(/assume este cadastro e mantém o histórico/)).toBeVisible();
    });

    it('cria com nome e telefone, sem e-mail', async () => {
      const user = userEvent.setup();
      const calls = renderList({
        'POST /api/admin/customers': () => jsonResponse(CARLA, 201),
      });

      await user.click(await screen.findByRole('button', { name: /Novo cliente/ }));
      await user.type(await screen.findByLabelText('Nome'), 'Carla Dias');
      await user.type(screen.getByLabelText('WhatsApp'), '11977771234');
      await user.click(screen.getByRole('button', { name: 'Cadastrar' }));

      await waitFor(() => {
        expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
          name: 'Carla Dias',
          phone: '11977771234',
        });
      });
    });

    it('manda o e-mail quando preenchido', async () => {
      const user = userEvent.setup();
      const calls = renderList({
        'POST /api/admin/customers': () => jsonResponse(CARLA, 201),
      });

      await user.click(await screen.findByRole('button', { name: /Novo cliente/ }));
      await user.type(await screen.findByLabelText('Nome'), 'Carla Dias');
      await user.type(screen.getByLabelText('WhatsApp'), '11977771234');
      await user.type(screen.getByLabelText('E-mail'), 'carla@exemplo.com');
      await user.click(screen.getByRole('button', { name: 'Cadastrar' }));

      await waitFor(() => {
        expect(calls.find((call) => call.method === 'POST')?.body).toMatchObject({
          email: 'carla@exemplo.com',
        });
      });
    });

    it('recusa sem telefone, sem chamar a API', async () => {
      const user = userEvent.setup();
      const calls = renderList();

      await user.click(await screen.findByRole('button', { name: /Novo cliente/ }));
      await user.type(await screen.findByLabelText('Nome'), 'Carla Dias');
      await user.click(screen.getByRole('button', { name: 'Cadastrar' }));

      await waitFor(() => {
        expect(screen.getByLabelText('WhatsApp')).toHaveAttribute('aria-invalid', 'true');
      });
      expect(calls.some((call) => call.method === 'POST')).toBe(false);
    });

    it('avisa quando o cadastro dá certo', async () => {
      const user = userEvent.setup();
      renderList({ 'POST /api/admin/customers': () => jsonResponse(CARLA, 201) });

      await user.click(await screen.findByRole('button', { name: /Novo cliente/ }));
      await user.type(await screen.findByLabelText('Nome'), 'Carla Dias');
      await user.type(screen.getByLabelText('WhatsApp'), '11977771234');
      await user.click(screen.getByRole('button', { name: 'Cadastrar' }));

      // Por texto, não por papel: a contagem da lista também é `role="status"`.
      expect(await screen.findByText('Carla Dias entrou no cadastro.')).toBeVisible();
    });

    /* O e-mail repetido quase sempre é a mesma pessoa; o dono precisa saber. */
    it('conta quando o e-mail já existe', async () => {
      const user = userEvent.setup();
      renderList({
        'POST /api/admin/customers': () =>
          errorResponse(
            409,
            'EMAIL_IN_USE',
            'Já existe um cliente com este e-mail. Procure por ele na lista.',
          ),
      });

      await user.click(await screen.findByRole('button', { name: /Novo cliente/ }));
      await user.type(await screen.findByLabelText('Nome'), 'Carla Dias');
      await user.type(screen.getByLabelText('WhatsApp'), '11977771234');
      await user.type(screen.getByLabelText('E-mail'), 'ana@exemplo.com');
      await user.click(screen.getByRole('button', { name: 'Cadastrar' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Já existe um cliente');
    });
  });

  it('explica a falha em vez de mostrar lista vazia', async () => {
    renderList({
      'GET /api/admin/customers': () => errorResponse(500, 'INTERNAL', 'Algo deu errado.'),
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Algo deu errado.');
  });
});

describe('CustomerDetailPage', () => {
  function renderDetail(customer: AdminCustomerDetail | null) {
    stubFetch({
      'GET /api/admin/customers/u-1': () =>
        customer
          ? jsonResponse(customer)
          : errorResponse(404, 'NOT_FOUND', 'Não encontramos este cliente.'),
    });

    renderWithProviders(
      <ToastProvider>
        <Routes>
          <Route path="/admin/clientes/:id" element={<CustomerDetailPage />} />
        </Routes>
      </ToastProvider>,
      { route: '/admin/clientes/u-1', withAuth: false },
    );
  }

  it('mostra o contato e desde quando está no cadastro', async () => {
    renderDetail(DETALHE);

    expect(await screen.findByRole('heading', { name: 'Ana Beatriz' })).toBeVisible();
    expect(screen.getByText('11988887777')).toBeVisible();
    expect(screen.getByText('ana@exemplo.com')).toBeVisible();
    expect(screen.getByText(/No cadastro desde/)).toBeVisible();
  });

  /* A tela diz o que a pessoa consegue fazer, não só se "tem acesso". */
  it('descreve o acesso de quem entra com senha', async () => {
    renderDetail(DETALHE);

    expect(await screen.findByText('entra com senha ou Google')).toBeVisible();
  });

  it('descreve o acesso de quem o dono cadastrou', async () => {
    renderDetail({ ...DETALHE, ...CARLA, bookings: [] });

    expect(await screen.findByText('cadastrado por você, sem senha')).toBeVisible();
  });

  it('avisa quando tem senha mas o e-mail não foi confirmado', async () => {
    renderDetail({ ...DETALHE, hasAccess: true, emailVerified: false });

    expect(await screen.findByText(/e-mail não foi confirmado/)).toBeVisible();
  });

  it('lista o histórico de reservas com link para cada uma', async () => {
    renderDetail(DETALHE);

    expect(await screen.findByText('Histórico (1)')).toBeVisible();
    expect(screen.getByText('5 a 6 de dezembro de 2026')).toBeVisible();
    expect(screen.getByText('R$ 4.360,00')).toBeVisible();
    expect(screen.getByRole('link', { name: /5 a 6 de dezembro/ })).toHaveAttribute(
      'href',
      '/admin/reservas/b-1',
    );
  });

  it('marca a reserva que o dono lançou', async () => {
    renderDetail({
      ...DETALHE,
      bookings: [{ ...DETALHE.bookings[0]!, createdByAdmin: true }],
    });

    expect(await screen.findByText(/lançada por você/)).toBeVisible();
  });

  it('explica o histórico vazio', async () => {
    renderDetail({ ...DETALHE, bookings: [] });

    expect(await screen.findByText('Nenhuma reserva ainda')).toBeVisible();
  });

  it('explica quando o cliente não existe', async () => {
    renderDetail(null);

    expect(await screen.findByText('Não encontramos este cliente')).toBeVisible();
    expect(screen.getByRole('link', { name: /Voltar para os clientes/ })).toBeVisible();
  });
});
