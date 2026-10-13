import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/Toast';
import { errorResponse, jsonResponse, renderWithProviders } from '../../../../test/helpers/render';
import { CategoriesPage } from './CategoriesPage';

const PAINEIS = { id: 'c1', name: 'Painéis', sortOrder: 1 };

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

function renderPage() {
  return renderWithProviders(
    <ToastProvider>
      <CategoriesPage />
    </ToastProvider>,
    { route: '/admin/categorias', withAuth: false },
  );
}

describe('CategoriesPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lista as categorias com a ordem', async () => {
    stubFetch({ 'GET /api/admin/categories': () => jsonResponse([PAINEIS]) });
    renderPage();

    expect(await screen.findByText('Painéis')).toBeVisible();
  });

  /*
   * Nome duplicado volta da API como VALIDATION_ERROR apontando o campo, e a
   * mensagem precisa aparecer **no campo** — num resumo genérico a pessoa não
   * saberia qual dos dois campos corrigir.
   */
  it('mostra o erro de nome repetido abaixo do campo', async () => {
    stubFetch({
      'GET /api/admin/categories': () => jsonResponse([PAINEIS]),
      'POST /api/admin/categories': () =>
        errorResponse(400, 'VALIDATION_ERROR', 'Já existe uma categoria com esse nome.', {
          context: 'body',
          fields: [{ field: 'name', message: 'Já existe uma categoria com esse nome.' }],
        }),
    });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Nova categoria' }));
    await userEvent.type(screen.getByLabelText('Nome'), 'Painéis');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    const field = await screen.findByLabelText('Nome');
    expect(field).toHaveAccessibleDescription(/Já existe uma categoria com esse nome\./);
  });

  /*
   * Categoria não tem "desativar": a API recusa excluir uma que ainda tem item, e
   * a mensagem dela já diz o próximo passo. Repetir isso na tela só criaria uma
   * segunda versão do texto para manter.
   */
  it('mostra a recusa da API quando a categoria tem itens', async () => {
    stubFetch({
      'GET /api/admin/categories': () => jsonResponse([PAINEIS]),
      'DELETE /api/admin/categories/c1': () =>
        errorResponse(
          400,
          'VALIDATION_ERROR',
          'Esta categoria ainda tem itens. Mova os itens para outra categoria antes de excluir.',
          { itemCount: 3 },
        ),
    });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Excluir Painéis' }));
    await userEvent.click(screen.getByRole('button', { name: 'Excluir categoria' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Esta categoria ainda tem itens.');
  });

  it('explica a consequência antes de excluir (§13)', async () => {
    stubFetch({ 'GET /api/admin/categories': () => jsonResponse([PAINEIS]) });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Excluir Painéis' }));

    expect(screen.getByText('A categoria "Painéis" sai do catálogo.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Excluir categoria' })).toBeVisible();
  });
});
