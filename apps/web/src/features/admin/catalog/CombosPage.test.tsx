import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/Toast';
import { jsonResponse, renderWithProviders } from '../../../../test/helpers/render';
import { CombosPage } from './CombosPage';

const CATEGORY = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Painéis', sortOrder: 1 };

const PAINEL = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Painel ripado',
  description: null,
  imageUrl: null,
  priceCents: 20000,
  stock: 2,
  assemblyNotes: null,
  sortOrder: 0,
  category: CATEGORY,
  themeIds: [],
  active: true,
};

const MESA = {
  ...PAINEL,
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Mesa de doces',
  priceCents: 12000,
};

const COMBO = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  name: 'Kit boho',
  description: null,
  imageUrl: null,
  themeId: null,
  discountType: 'PERCENT' as const,
  discountValue: 10,
  items: [
    {
      itemId: '11111111-1111-4111-8111-111111111111',
      name: 'Painel ripado',
      quantity: 1,
      unitPriceCents: 20000,
      totalCents: 20000,
      active: true,
    },
    {
      itemId: '22222222-2222-4222-8222-222222222222',
      name: 'Mesa de doces',
      quantity: 1,
      unitPriceCents: 12000,
      totalCents: 12000,
      active: true,
    },
  ],
  itemsTotalCents: 32000,
  discountCents: 3200,
  priceCents: 28800,
  active: true,
  available: true,
};

type Call = { url: string; method: string; body: unknown };

function stubFetch(routes: Record<string, (call: Call) => Response>) {
  const calls: Call[] = [];

  const fetchMock = vi.fn((url: string, init?: { method?: string; body?: string }) => {
    const call = {
      url,
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);

    const handler = routes[`${call.method} ${url}`];
    if (handler) return Promise.resolve(handler(call));

    return Promise.resolve(jsonResponse([]));
  });

  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

const CATALOG_ROUTE = 'GET /api/admin/items?page=1&pageSize=100';

function baseRoutes(combos: unknown[] = [COMBO]) {
  return {
    'GET /api/admin/combos': () => jsonResponse(combos),
    'GET /api/admin/themes': () => jsonResponse([]),
    [CATALOG_ROUTE]: () =>
      jsonResponse({ items: [PAINEL, MESA], total: 2, page: 1, pageSize: 100 }),
  };
}

function renderPage() {
  return renderWithProviders(
    <ToastProvider>
      <CombosPage />
    </ToastProvider>,
    { route: '/admin/combos', withAuth: false },
  );
}

describe('CombosPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /* A §13 pede os três números na tabela: soma, economia e o que o cliente paga. */
  it('mostra soma dos itens, economia e preço final', async () => {
    stubFetch(baseRoutes());
    renderPage();

    expect(await screen.findByText('Kit boho')).toBeVisible();
    expect(screen.getByText('R$ 320,00')).toBeVisible();
    expect(screen.getByText('R$ 32,00')).toBeVisible();
    expect(screen.getByText('R$ 288,00')).toBeVisible();
  });

  /*
   * A vitrine esconde combo com item desativado. Sem este aviso, o dono veria o
   * combo no painel e não entenderia por que ele não aparece para o cliente.
   */
  it('avisa quando o combo está fora da vitrine por item desativado', async () => {
    stubFetch(baseRoutes([{ ...COMBO, available: false }]));
    renderPage();

    expect(await screen.findByText('Fora da vitrine: tem item desativado')).toBeVisible();
  });

  /*
   * A prévia vem da API para não existir uma segunda implementação da regra da
   * §9.6 — o arredondamento do percentual e o piso do preço fechado.
   */
  it('pede a prévia da economia ao servidor, não calcula aqui', async () => {
    const calls = stubFetch({
      ...baseRoutes([]),
      'POST /api/admin/combos/preview': () =>
        jsonResponse({ itemsTotalCents: 20000, discountCents: 3000, priceCents: 17000 }),
    });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Novo combo' }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Painel ripado/ }));
    await userEvent.type(screen.getByLabelText('Desconto'), '15');

    expect(await screen.findByText('R$ 30,00')).toBeVisible();

    // A última chamada é a que vale: digitar "15" passa por "1" no caminho, e a
    // prévia acompanha a composição mais recente.
    const previews = calls.filter((call) => call.url.endsWith('/combos/preview'));
    expect(previews.at(-1)?.body).toEqual({
      discountType: 'PERCENT',
      discountValue: 15,
      items: [{ itemId: '11111111-1111-4111-8111-111111111111', quantity: 1 }],
    });
  });

  it('não pede prévia de combo sem item', async () => {
    const calls = stubFetch(baseRoutes([]));
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Novo combo' }));
    await userEvent.type(screen.getByLabelText('Desconto'), '10');

    expect(
      screen.getByText(
        'Escolha os itens e informe o desconto para ver quanto o cliente economiza.',
      ),
    ).toBeVisible();
    expect(calls.filter((call) => call.url.endsWith('/combos/preview'))).toHaveLength(0);
  });

  /*
   * Os dois tipos dividem a coluna `discountValue`. Manter o número ao trocar
   * faria 28000 centavos virarem 28000 por cento, que a API recusa.
   */
  it('limpa o valor ao trocar o tipo de desconto', async () => {
    stubFetch(baseRoutes([]));
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Novo combo' }));
    await userEvent.type(screen.getByLabelText('Desconto'), '10');
    await userEvent.selectOptions(
      screen.getByLabelText('Tipo de desconto'),
      'Preço fechado do combo',
    );

    expect(screen.getByLabelText('Preço fechado do combo')).toHaveValue(null);
  });

  it('recusa combo sem item localmente, sem chamar a API', async () => {
    const calls = stubFetch(baseRoutes([]));
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Novo combo' }));
    await userEvent.type(screen.getByLabelText('Nome'), 'Kit vazio');
    await userEvent.type(screen.getByLabelText('Desconto'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Escolha ao menos um item para o combo.')).toBeVisible();
    expect(calls.filter((call) => call.url.endsWith('/admin/combos'))).toHaveLength(1);
  });

  it('cria o combo com a quantidade escolhida', async () => {
    const calls = stubFetch({
      ...baseRoutes([]),
      'POST /api/admin/combos': () => jsonResponse(COMBO, 201),
      'POST /api/admin/combos/preview': () =>
        jsonResponse({ itemsTotalCents: 40000, discountCents: 4000, priceCents: 36000 }),
    });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Novo combo' }));
    await userEvent.type(screen.getByLabelText('Nome'), 'Kit duplo');
    await userEvent.click(screen.getByRole('checkbox', { name: /Painel ripado/ }));
    await userEvent.clear(screen.getByLabelText('Quantidade de Painel ripado'));
    await userEvent.type(screen.getByLabelText('Quantidade de Painel ripado'), '2');
    await userEvent.type(screen.getByLabelText('Desconto'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Combo criado.');
    });

    const post = calls.find((call) => call.method === 'POST' && call.url === '/api/admin/combos');
    expect(post?.body).toMatchObject({
      name: 'Kit duplo',
      discountType: 'PERCENT',
      discountValue: 10,
      items: [{ itemId: '11111111-1111-4111-8111-111111111111', quantity: 2 }],
    });
  });

  it('diz quando o combo foi desativado em vez de excluído', async () => {
    stubFetch({
      ...baseRoutes(),
      'DELETE /api/admin/combos/cccccccc-cccc-4ccc-8ccc-cccccccccccc': () =>
        jsonResponse({ outcome: 'deactivated' }),
    });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Excluir Kit boho' }));
    await userEvent.click(screen.getByRole('button', { name: 'Excluir combo' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Combo desativado');
    });
  });

  it('pede itens antes de permitir criar combo', async () => {
    stubFetch({
      'GET /api/admin/combos': () => jsonResponse([]),
      'GET /api/admin/themes': () => jsonResponse([]),
      [CATALOG_ROUTE]: () => jsonResponse({ items: [], total: 0, page: 1, pageSize: 100 }),
    });
    renderPage();

    expect(await screen.findByText('Cadastre itens primeiro')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Novo combo' })).toBeDisabled();
  });
});
