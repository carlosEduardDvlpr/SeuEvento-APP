import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/Toast';
import { errorResponse, jsonResponse, renderWithProviders } from '../../../../test/helpers/render';
import { PricesPage } from './PricesPage';

const SABADO = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'Sábado',
  dayOfWeek: 6,
  startDate: null,
  endDate: null,
  priceCents: 220000,
  priority: 10,
  active: true,
};

const REVEILLON = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  name: 'Réveillon',
  dayOfWeek: null,
  startDate: '2026-12-28',
  endDate: '2027-01-02',
  priceCents: 350000,
  priority: 100,
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
      <PricesPage />
    </ToastProvider>,
    { route: '/admin/precos', withAuth: false },
  );
}

describe('PricesPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /*
   * "todo sábado" e "de 28/12 a 02/01" é como o dono leria a regra em voz alta.
   * Mostrar `dayOfWeek: 6` obrigaria a decorar a convenção do banco.
   */
  it('descreve quando a regra vale, em linguagem natural', async () => {
    stubFetch({ 'GET /api/admin/price-rules': () => jsonResponse([SABADO, REVEILLON]) });
    renderPage();

    expect(await screen.findByText('todo sábado')).toBeVisible();
    expect(screen.getByText('de 28/12/2026 a 02/01/2027')).toBeVisible();
  });

  it('descreve a regra sem dia nem período', async () => {
    stubFetch({
      'GET /api/admin/price-rules': () =>
        jsonResponse([{ ...SABADO, dayOfWeek: null, name: 'Padrão alto' }]),
    });
    renderPage();

    expect(await screen.findByText('todo dia, sem período')).toBeVisible();
  });

  it('explica que sem regra vale a diária base', async () => {
    stubFetch({ 'GET /api/admin/price-rules': () => jsonResponse([]) });
    renderPage();

    expect(await screen.findByText('Nenhuma regra de preço')).toBeVisible();
  });

  /* O simulador é o que torna a prioridade compreensível (§13). */
  it('mostra o valor de cada dia e qual regra venceu', async () => {
    stubFetch({
      'GET /api/admin/price-rules': () => jsonResponse([SABADO]),
      'GET /api/admin/price-rules/simulate?from=2026-12-04&to=2026-12-05': () =>
        jsonResponse({
          days: [
            { date: '2026-12-04', priceCents: 150000, ruleName: null },
            { date: '2026-12-05', priceCents: 220000, ruleName: 'Sábado' },
          ],
          totalCents: 370000,
          baseDailyPriceCents: 150000,
        }),
    });
    renderPage();

    await userEvent.type(await screen.findByLabelText('De'), '2026-12-04');
    await userEvent.type(screen.getByLabelText('Até'), '2026-12-05');
    await userEvent.click(screen.getByRole('button', { name: 'Simular' }));

    const day = await screen.findByText('sábado, 5 de dezembro');

    // O nome da regra vencedora aparece ao lado do dia, no mesmo item da lista.
    // "Sábado" também é o nome na tabela de regras, por isso a busca é escopada.
    const row = day.closest('li');
    expect(row).not.toBeNull();
    expect(row).toHaveTextContent('Sábado');
    expect(row).toHaveTextContent('R$ 2.200,00');

    expect(screen.getByText('diária base')).toBeVisible();
    expect(screen.getByText('R$ 3.700,00')).toBeVisible();
  });

  /* Sem `enabled`, abrir a tela já simularia um período que ninguém escolheu. */
  it('não simula antes de o dono pedir', async () => {
    const calls = stubFetch({ 'GET /api/admin/price-rules': () => jsonResponse([SABADO]) });
    renderPage();

    await screen.findByText('todo sábado');

    expect(calls.filter((call) => call.url.includes('simulate'))).toHaveLength(0);
  });

  it('recusa período invertido localmente, sem chamar a API', async () => {
    const calls = stubFetch({ 'GET /api/admin/price-rules': () => jsonResponse([]) });
    renderPage();

    await userEvent.type(await screen.findByLabelText('De'), '2026-12-10');
    await userEvent.type(screen.getByLabelText('Até'), '2026-12-05');
    await userEvent.click(screen.getByRole('button', { name: 'Simular' }));

    expect(await screen.findByText('A data final não pode ser anterior à inicial.')).toBeVisible();
    expect(calls.filter((call) => call.url.includes('simulate'))).toHaveLength(0);
  });

  it('mostra a recusa da API quando o período é longo demais', async () => {
    stubFetch({
      'GET /api/admin/price-rules': () => jsonResponse([]),
      'GET /api/admin/price-rules/simulate?from=2026-01-01&to=2026-12-31': () =>
        errorResponse(400, 'VALIDATION_ERROR', 'Simule no máximo 92 dias por vez.', {
          maxDays: 92,
          requestedDays: 365,
        }),
    });
    renderPage();

    await userEvent.type(await screen.findByLabelText('De'), '2026-01-01');
    await userEvent.type(screen.getByLabelText('Até'), '2026-12-31');
    await userEvent.click(screen.getByRole('button', { name: 'Simular' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Simule no máximo 92 dias');
  });

  it('cria a regra convertendo reais em centavos', async () => {
    const calls = stubFetch({
      'GET /api/admin/price-rules': () => jsonResponse([]),
      'POST /api/admin/price-rules': () => jsonResponse(SABADO, 201),
    });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Nova regra' }));
    await userEvent.type(screen.getByLabelText('Nome'), 'Sábado');
    await userEvent.type(screen.getByLabelText('Valor da diária'), '2200');
    await userEvent.selectOptions(screen.getByLabelText('Dia da semana'), 'Sábado');
    await userEvent.clear(screen.getByLabelText('Prioridade'));
    await userEvent.type(screen.getByLabelText('Prioridade'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Regra criada.');
    });

    const post = calls.find((call) => call.method === 'POST');
    expect(post?.body).toMatchObject({
      name: 'Sábado',
      dayOfWeek: 6,
      priceCents: 220000,
      priority: 10,
      startDate: null,
      endDate: null,
    });
  });

  /*
   * Diferente de item, combo e estilo, a regra é apagada de verdade: nenhuma
   * reserva a referencia. O diálogo precisa dizer isso para o dono não achar que
   * vai mexer no histórico.
   */
  it('explica que as reservas feitas não mudam ao excluir a regra', async () => {
    stubFetch({ 'GET /api/admin/price-rules': () => jsonResponse([SABADO]) });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Excluir Sábado' }));

    expect(screen.getByText(/As reservas já feitas não mudam/)).toBeVisible();
  });
});
