import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/Toast';
import { errorResponse, jsonResponse, renderWithProviders } from '../../../../test/helpers/render';
import { GalleryPage } from './GalleryPage';

const CAPA = {
  id: 'g1',
  kind: 'HERO' as const,
  url: 'https://exemplo.com/capa.webp',
  alt: 'Festa montada na hora dourada',
  caption: null,
  sortOrder: 0,
  active: true,
};

const FESTA_A = {
  id: 'g2',
  kind: 'EVENTS' as const,
  url: 'https://exemplo.com/festa-a.webp',
  alt: 'Mesa de doces sob o arco de balões',
  caption: 'Chá de bebê',
  sortOrder: 0,
  active: true,
};

const FESTA_B = {
  id: 'g3',
  kind: 'EVENTS' as const,
  url: 'https://exemplo.com/festa-b.webp',
  alt: 'Painel de folhagens na área coberta',
  caption: null,
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
      <GalleryPage />
    </ToastProvider>,
    { route: '/admin/galeria', withAuth: false },
  );
}

describe('GalleryPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /* A ordem só faz sentido dentro da seção, por isso a tela agrupa. */
  it('separa as fotos por seção', async () => {
    stubFetch({ 'GET /api/admin/gallery': () => jsonResponse([CAPA, FESTA_A, FESTA_B]) });
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Capa', level: 2 })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'A chácara', level: 2 })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Festas realizadas', level: 2 })).toBeVisible();

    expect(screen.getByText('2 fotos, na ordem em que aparecem.')).toBeVisible();
    expect(screen.getAllByText('Nenhuma foto nesta seção.')).toHaveLength(1);
  });

  /*
   * A API exige a lista completa da seção para recusar aba desatualizada. Se a
   * tela mandasse só o par trocado, aquela proteção não serviria para nada.
   */
  it('manda a seção inteira ao reordenar, na nova ordem', async () => {
    const calls = stubFetch({
      'GET /api/admin/gallery': () => jsonResponse([CAPA, FESTA_A, FESTA_B]),
      'PATCH /api/admin/gallery/order': () => jsonResponse([CAPA, FESTA_B, FESTA_A]),
    });
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Descer Mesa de doces sob o arco de balões' }),
    );

    await waitFor(() => {
      const patch = calls.find((call) => call.method === 'PATCH');
      expect(patch?.body).toEqual({ kind: 'EVENTS', ids: ['g3', 'g2'] });
    });
  });

  it('não oferece subir a primeira nem descer a última', async () => {
    stubFetch({ 'GET /api/admin/gallery': () => jsonResponse([FESTA_A, FESTA_B]) });
    renderPage();

    expect(
      await screen.findByRole('button', { name: 'Subir Mesa de doces sob o arco de balões' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Descer Painel de folhagens na área coberta' }),
    ).toBeDisabled();
  });

  /* Foto sem descrição deixa de fora quem usa leitor de tela (§18). */
  it('exige a descrição da imagem', async () => {
    const calls = stubFetch({ 'GET /api/admin/gallery': () => jsonResponse([CAPA]) });
    renderPage();

    const buttons = await screen.findAllByRole('button', { name: 'Adicionar foto' });
    await userEvent.click(buttons[0]!);
    await userEvent.type(screen.getByLabelText('Endereço da imagem'), 'https://exemplo.com/a.webp');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Descreva a imagem para quem não pode vê-la.')).toBeVisible();
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0);
  });

  it('recusa endereço de imagem com outro esquema', async () => {
    stubFetch({ 'GET /api/admin/gallery': () => jsonResponse([CAPA]) });
    renderPage();

    const buttons = await screen.findAllByRole('button', { name: 'Adicionar foto' });
    await userEvent.click(buttons[0]!);
    await userEvent.type(screen.getByLabelText('Endereço da imagem'), 'javascript:alert(1)');
    await userEvent.type(screen.getByLabelText('Descrição da imagem'), 'Foto da chácara');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Use um endereço começando com http://, https:// ou /.'),
    ).toBeVisible();
  });

  it('mostra a mensagem da API quando reordenar é recusado', async () => {
    stubFetch({
      'GET /api/admin/gallery': () => jsonResponse([FESTA_A, FESTA_B]),
      'PATCH /api/admin/gallery/order': () =>
        errorResponse(
          400,
          'VALIDATION_ERROR',
          'A lista de imagens mudou. Recarregue a página e ordene de novo.',
        ),
    });
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Descer Mesa de doces sob o arco de balões' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('A lista de imagens mudou.');
  });

  it('explica para que serve a tela quando não há foto', async () => {
    stubFetch({ 'GET /api/admin/gallery': () => jsonResponse([]) });
    renderPage();

    expect(await screen.findByText('Nenhuma foto ainda')).toBeVisible();
  });
});
