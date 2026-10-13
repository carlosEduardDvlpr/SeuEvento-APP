import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/Toast';
import { jsonResponse, renderWithProviders } from '../../../../test/helpers/render';
import { ItemsPage } from './ItemsPage';

const PAINEIS = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Painéis', sortOrder: 1 };

const BOHO = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  slug: 'rustico-boho',
  name: 'Rústico boho',
  tagline: null,
  description: null,
  palette: [
    { name: 'Palha', hex: '#D8C7A3' },
    { name: 'Madeira', hex: '#8C6A4F' },
    { name: 'Sálvia', hex: '#A7B8A1' },
    { name: 'Rosa seco', hex: '#C9A29A' },
    { name: 'Branco cru', hex: '#F2EEE6' },
  ],
  coverImageUrl: null,
  sortOrder: 1,
  active: true,
};

const PAINEL = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Painel ripado',
  description: null,
  imageUrl: null,
  priceCents: 20000,
  stock: 2,
  assemblyNotes: null,
  sortOrder: 0,
  category: PAINEIS,
  themeIds: [BOHO.id],
  active: true,
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

function page(items: unknown[], total = items.length) {
  return { items, total, page: 1, pageSize: 20 };
}

function baseRoutes(itemsPage = page([PAINEL])) {
  return {
    'GET /api/admin/categories': () => jsonResponse([PAINEIS]),
    'GET /api/admin/themes': () => jsonResponse([BOHO]),
    'GET /api/admin/items?page=1&pageSize=20': () => jsonResponse(itemsPage),
  };
}

function renderPage() {
  return renderWithProviders(
    <ToastProvider>
      <ItemsPage />
    </ToastProvider>,
    { route: '/admin/itens', withAuth: false },
  );
}

describe('ItemsPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lista o item com categoria, estilos, preço e estoque', async () => {
    stubFetch(baseRoutes());
    renderPage();

    expect(await screen.findByText('Painel ripado')).toBeVisible();

    // "Painéis" e "Rústico boho" também aparecem nos filtros, por isso a busca
    // é escopada na tabela.
    const table = within(screen.getByRole('table'));
    expect(table.getByText('Painéis')).toBeVisible();
    // O estilo aparece pelo nome, não pelo id.
    expect(table.getByText('Rústico boho')).toBeVisible();
    expect(table.getByText('R$ 200,00')).toBeVisible();
    expect(table.getByText('2')).toBeVisible();
  });

  it('diz quando o item não tem estilo', async () => {
    stubFetch(baseRoutes(page([{ ...PAINEL, themeIds: [] }])));
    renderPage();

    expect(await screen.findByText('Sem estilo')).toBeVisible();
  });

  /* Item exige categoria: sem nenhuma, a tela diz o que fazer antes. */
  it('manda criar categoria antes de permitir criar item', async () => {
    stubFetch({
      'GET /api/admin/categories': () => jsonResponse([]),
      'GET /api/admin/themes': () => jsonResponse([]),
      'GET /api/admin/items?page=1&pageSize=20': () => jsonResponse(page([])),
    });
    renderPage();

    expect(await screen.findByText('Crie uma categoria primeiro')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Novo item' })).toBeDisabled();
  });

  /* O estoque é por dia (§9.3), e é a dúvida de quem cadastra pela primeira vez. */
  it('explica que o estoque é por dia', async () => {
    stubFetch(baseRoutes());
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Novo item' }));

    expect(screen.getByText('Unidades disponíveis por dia.')).toBeVisible();
    expect(screen.getByText('Cobrado uma vez pelo período.')).toBeVisible();
  });

  it('já vem com a primeira categoria escolhida', async () => {
    stubFetch(baseRoutes());
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Novo item' }));

    // O campo é obrigatório; deixá-lo vazio só geraria um erro evitável.
    expect(screen.getByLabelText('Categoria')).toHaveValue(PAINEIS.id);
  });

  it('cria o item convertendo reais em centavos e mandando os estilos', async () => {
    const calls = stubFetch({
      ...baseRoutes(page([])),
      'POST /api/admin/items': () => jsonResponse(PAINEL, 201),
    });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Novo item' }));
    await userEvent.type(screen.getByLabelText('Nome'), 'Painel ripado');
    await userEvent.type(screen.getByLabelText('Preço'), '200');
    await userEvent.clear(screen.getByLabelText('Estoque'));
    await userEvent.type(screen.getByLabelText('Estoque'), '2');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Rústico boho' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Item criado.');
    });

    const post = calls.find((call) => call.method === 'POST');
    expect(post?.body).toMatchObject({
      name: 'Painel ripado',
      categoryId: PAINEIS.id,
      priceCents: 20000,
      stock: 2,
      themeIds: [BOHO.id],
    });
  });

  it('recusa item sem preço localmente, sem chamar a API', async () => {
    const calls = stubFetch(baseRoutes(page([])));
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Novo item' }));
    await userEvent.type(screen.getByLabelText('Nome'), 'Sem preço');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Informe um valor.')).toBeVisible();
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0);
  });

  it('diz quando o item foi desativado em vez de excluído', async () => {
    stubFetch({
      ...baseRoutes(),
      'DELETE /api/admin/items/11111111-1111-4111-8111-111111111111': () =>
        jsonResponse({ outcome: 'deactivated' }),
    });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Excluir Painel ripado' }));
    await userEvent.click(screen.getByRole('button', { name: 'Excluir item' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Item desativado');
    });
  });

  /* Continuar na página 3 de um conjunto menor mostraria lista vazia. */
  it('volta para a primeira página ao trocar de filtro', async () => {
    const calls = stubFetch({
      ...baseRoutes(page([PAINEL], 45)),
      'GET /api/admin/items?page=2&pageSize=20': () => jsonResponse(page([PAINEL], 45)),
      [`GET /api/admin/items?page=1&pageSize=20&categoryId=${PAINEIS.id}`]: () =>
        jsonResponse(page([PAINEL], 3)),
    });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Próxima' }));
    await waitFor(() => {
      expect(calls.some((call) => call.url.includes('page=2'))).toBe(true);
    });

    await userEvent.selectOptions(screen.getByLabelText('Filtrar por categoria'), PAINEIS.id);

    await waitFor(() => {
      expect(calls.some((call) => call.url.includes(`page=1&pageSize=20&categoryId=`))).toBe(true);
    });
  });
});
