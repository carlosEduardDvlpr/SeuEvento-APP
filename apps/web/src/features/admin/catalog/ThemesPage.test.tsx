import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/Toast';
import { jsonResponse, renderWithProviders } from '../../../../test/helpers/render';
import { ThemesPage } from './ThemesPage';

const PALETTE = [
  { name: 'Palha', hex: '#D8C7A3' },
  { name: 'Madeira', hex: '#8C6A4F' },
  { name: 'Sálvia', hex: '#A7B8A1' },
  { name: 'Rosa seco', hex: '#C9A29A' },
  { name: 'Branco cru', hex: '#F2EEE6' },
];

const BOHO = {
  id: 't1',
  slug: 'rustico-boho',
  name: 'Rústico boho',
  tagline: 'Tons naturais e trama de palha.',
  description: null,
  palette: PALETTE,
  coverImageUrl: null,
  sortOrder: 1,
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

function renderPage() {
  return renderWithProviders(
    <ToastProvider>
      <ThemesPage />
    </ToastProvider>,
    { route: '/admin/temas', withAuth: false },
  );
}

describe('ThemesPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lista o estilo com a paleta legível por leitor de tela', async () => {
    stubFetch({ 'GET /api/admin/themes': () => jsonResponse([BOHO]) });
    renderPage();

    expect(await screen.findByText('Rústico boho')).toBeVisible();
    expect(screen.getByText('rustico-boho')).toBeVisible();
    // A cor é dado, não decoração: o nome e o hex ficam disponíveis como texto.
    expect(screen.getByText('Sálvia (#A7B8A1)')).toBeInTheDocument();
  });

  it('marca o estilo desativado com texto, não só com cor', async () => {
    stubFetch({
      'GET /api/admin/themes': () => jsonResponse([{ ...BOHO, active: false }]),
    });
    renderPage();

    expect(await screen.findByText('Desativado')).toBeVisible();
  });

  it('explica para que serve a tela quando não há estilo', async () => {
    stubFetch({ 'GET /api/admin/themes': () => jsonResponse([]) });
    renderPage();

    expect(await screen.findByText('Nenhum estilo ainda')).toBeVisible();
  });

  // §12.5: valida com o schema do servidor antes de enviar.
  it('recusa nome curto localmente, sem chamar a API', async () => {
    const calls = stubFetch({ 'GET /api/admin/themes': () => jsonResponse([]) });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Novo estilo' }));
    await userEvent.type(screen.getByLabelText('Nome'), 'a');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Dê um nome ao estilo.')).toBeVisible();
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0);
  });

  it('cria o estilo e confirma por aviso', async () => {
    const calls = stubFetch({
      'GET /api/admin/themes': () => jsonResponse([]),
      'POST /api/admin/themes': () => jsonResponse({ ...BOHO, name: 'Tropical' }, 201),
    });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Novo estilo' }));
    await userEvent.type(screen.getByLabelText('Nome'), 'Tropical');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Estilo criado.');

    const post = calls.find((call) => call.method === 'POST');
    expect(post?.body).toMatchObject({ name: 'Tropical', palette: expect.any(Array) });
  });

  /*
   * A API decide entre excluir e desativar, e a diferença importa para quem
   * opera: dizer "excluído" quando o estilo continua no banco faria o dono
   * procurá-lo na vitrine sem entender por que sumiu de um lugar e não do outro.
   */
  it('diz quando o estilo foi desativado em vez de excluído', async () => {
    stubFetch({
      'GET /api/admin/themes': () => jsonResponse([BOHO]),
      'DELETE /api/admin/themes/t1': () => jsonResponse({ outcome: 'deactivated' }),
    });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Excluir Rústico boho' }));
    await userEvent.click(screen.getByRole('button', { name: 'Excluir estilo' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Estilo desativado');
    });
  });

  it('diz quando o estilo foi excluído de verdade', async () => {
    stubFetch({
      'GET /api/admin/themes': () => jsonResponse([BOHO]),
      'DELETE /api/admin/themes/t1': () => jsonResponse({ outcome: 'deleted' }),
    });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Excluir Rústico boho' }));
    await userEvent.click(screen.getByRole('button', { name: 'Excluir estilo' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Estilo excluído.');
    });
  });

  /* O slug é o endereço na vitrine: renomear não pode quebrar link. */
  it('avisa que o endereço não muda ao renomear', async () => {
    stubFetch({ 'GET /api/admin/themes': () => jsonResponse([BOHO]) });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Editar Rústico boho' }));

    expect(
      screen.getByText('O endereço na vitrine continua /rustico-boho, mesmo trocando o nome.'),
    ).toBeVisible();
  });
});
