import type {
  AdminBookingSummary,
  AdminFinance,
  FinanceBooking,
  FinancePayment,
  PaymentPlan,
} from '@chacara/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/Toast';
import { errorResponse, jsonResponse, renderWithProviders } from '../../../../test/helpers/render';
import { FinancePage } from './FinancePage';

/**
 * Financeiro do painel (§9.11, §13.4).
 *
 * O relógio fica parado em 15/11/2026, meio-dia em São Paulo: a tela abre no mês
 * de hoje, e "hoje" é o dia sugerido para registrar um recebimento.
 */

const ANA = { id: 'u-1', name: 'Ana Beatriz', email: 'ana@exemplo.com', phone: '11988887777' };
const BIA = { id: 'u-2', name: 'Bia Costa', email: null, phone: null };

const RESERVA: FinanceBooking = {
  id: 'b-1',
  kind: 'VENUE',
  startDate: '2026-12-05',
  endDate: '2026-12-06',
  status: 'CONFIRMED',
  totalCents: 50_000,
  customer: ANA,
};

const SINAL: FinancePayment = {
  id: 'p-0',
  kind: 'DEPOSIT',
  number: 0,
  dueDate: '2026-11-10',
  amountCents: 30_000,
  paidOn: '2026-11-10',
  status: 'PAID',
  label: 'Sinal',
  booking: RESERVA,
};

const PARCELA: FinancePayment = {
  id: 'p-1',
  kind: 'INSTALLMENT',
  number: 1,
  dueDate: '2026-11-20',
  amountCents: 10_000,
  paidOn: null,
  status: 'PENDING',
  label: 'Parcela 1 de 2',
  booking: RESERVA,
};

const ATRASADA: FinancePayment = {
  ...PARCELA,
  id: 'p-9',
  dueDate: '2026-11-05',
  amountCents: 5_000,
  status: 'OVERDUE',
  label: 'Restante',
  booking: { ...RESERVA, id: 'b-2', startDate: '2026-11-07', endDate: '2026-11-07', customer: BIA },
};

const SEM_PLANO: AdminBookingSummary = {
  id: 'b-3',
  kind: 'DECORATION',
  startDate: '2026-11-28',
  endDate: '2026-11-28',
  status: 'CONFIRMED',
  guestCount: null,
  totalCents: 42_000,
  holdExpiresAt: null,
  createdByAdmin: true,
  createdAt: '2026-11-01T12:00:00.000Z',
  customer: { id: 'u-3', name: 'Carla Dias', email: null, phone: '11977776666' },
};

const NOVEMBRO: AdminFinance = {
  month: '2026-11',
  summary: { dueCents: 45_000, paidCents: 30_000, pendingCents: 15_000 },
  days: [
    {
      date: '2026-11-05',
      count: 1,
      dueCents: 5_000,
      paidCents: 0,
      pendingCents: 5_000,
      overdue: true,
    },
    {
      date: '2026-11-10',
      count: 1,
      dueCents: 30_000,
      paidCents: 30_000,
      pendingCents: 0,
      overdue: false,
    },
    {
      date: '2026-11-20',
      count: 1,
      dueCents: 10_000,
      paidCents: 0,
      pendingCents: 10_000,
      overdue: false,
    },
  ],
  payments: [ATRASADA, SINAL, PARCELA],
  overdue: { totalCents: 5_000, payments: [ATRASADA] },
  unplanned: [SEM_PLANO],
};

function empty(month: string): AdminFinance {
  return {
    month,
    summary: { dueCents: 0, paidCents: 0, pendingCents: 0 },
    days: [],
    payments: [],
    overdue: { totalCents: 0, payments: [] },
    unplanned: [],
  };
}

/** O plano que o `PATCH` devolve. A tela do financeiro não o mostra: relê o mês. */
const PLANO: PaymentPlan = {
  bookingId: 'b-1',
  totalCents: 50_000,
  payments: [],
  paidCents: 0,
  pendingCents: 0,
  overdueCents: 0,
  canEdit: true,
  canDelete: false,
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

      const handler =
        routes[`${call.method} ${url}`] ?? routes[`${call.method} ${url.split('?')[0]!}`];
      if (handler) return Promise.resolve(handler(call));

      const month = new URL(url, 'http://local').searchParams.get('month');
      if (url.startsWith('/api/admin/finance') && month) {
        return Promise.resolve(jsonResponse(month === '2026-11' ? NOVEMBRO : empty(month)));
      }

      if (call.method === 'PATCH') return Promise.resolve(jsonResponse(PLANO));

      return Promise.resolve(jsonResponse({}));
    }),
  );

  return calls;
}

function renderPage(routes: Record<string, Handler> = {}) {
  const calls = stubFetch(routes);

  renderWithProviders(
    <ToastProvider>
      <FinancePage />
    </ToastProvider>,
    { route: '/admin/financeiro', withAuth: false },
  );

  return calls;
}

/** Espera os números do mês: a partir daí as seções estão na tela. */
function loaded() {
  return screen.findByText('previsto para o mês');
}

/** Botão do dia, pelo número visível na célula. */
function dayButton(day: number) {
  return screen
    .getAllByRole('button')
    .find((button) => button.textContent?.startsWith(String(day)) === true);
}

const section = (name: string) => within(screen.getByRole('region', { name }));

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // 15/11/2026 às 12:00 em São Paulo.
  vi.setSystemTime(new Date('2026-11-15T15:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('FinancePage', () => {
  it('abre no mês de hoje e pede esse mês à API', async () => {
    const calls = renderPage();

    expect(await screen.findByRole('heading', { name: 'Novembro de 2026' })).toBeVisible();
    expect(calls.some((call) => call.url === '/api/admin/finance?month=2026-11')).toBe(true);
  });

  it('mostra o previsto, o recebido e o que falta no mês, e o atraso de todos os meses', async () => {
    renderPage();

    expect((await loaded()).parentElement).toHaveTextContent('R$ 450,00');
    expect(screen.getByText('recebido').parentElement).toHaveTextContent('R$ 300,00');
    expect(screen.getByText('a receber').parentElement).toHaveTextContent('R$ 150,00');
    expect(screen.getByText('em atraso, de todos os meses').parentElement).toHaveTextContent(
      'R$ 50,00',
    );
  });

  /* §14.2: a grade diz em texto o que a cor mostra. */
  it('marca os dias com vencimento, com a situação e o valor', async () => {
    renderPage();
    await loaded();

    expect(dayButton(20)).toHaveTextContent('A receber');
    expect(dayButton(20)).toHaveTextContent('R$ 100,00');
    expect(dayButton(5)).toHaveTextContent('Em atraso');
    expect(dayButton(5)).toHaveTextContent('R$ 50,00');
    expect(dayButton(10)).toHaveTextContent('Recebido');
    expect(dayButton(10)).toHaveTextContent('R$ 300,00');
    expect(dayButton(21)?.textContent).toBe('21');
  });

  it('tocar num dia mostra só os vencimentos dele, e dá para voltar ao mês', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage();
    await loaded();

    await user.click(dayButton(20)!);

    const day = section('Vencimentos de 20 de novembro de 2026');
    expect(day.getByText('Parcela 1 de 2 · Ana Beatriz')).toBeVisible();
    expect(day.queryByText('Sinal · Ana Beatriz')).not.toBeInTheDocument();
    expect(dayButton(20)).toHaveAttribute('aria-pressed', 'true');

    await user.click(day.getByRole('button', { name: 'Ver o mês inteiro' }));

    const month = section('Vencimentos de novembro de 2026');
    expect(month.getByText('Sinal · Ana Beatriz')).toBeVisible();
    expect(month.getByText('Parcela 1 de 2 · Ana Beatriz')).toBeVisible();
  });

  it('explica o dia sem vencimento', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage();
    await loaded();

    await user.click(dayButton(21)!);

    expect(
      section('Vencimentos de 21 de novembro de 2026').getByText('Nenhum vencimento neste dia.'),
    ).toBeVisible();
  });

  it('registra o recebimento pela lista, com o dia de hoje, e relê o mês', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const calls = renderPage();
    await loaded();

    await user.click(
      section('Vencimentos de novembro de 2026').getByRole('button', {
        name: 'Registrar recebimento: Parcela 1 de 2 de Ana Beatriz',
      }),
    );

    const dialog = within(await screen.findByRole('dialog', { name: 'Registrar recebimento' }));
    expect(dialog.getByText(/de Ana Beatriz/)).toBeVisible();
    expect(dialog.getByLabelText('Recebido em')).toHaveValue('2026-11-15');

    await user.click(dialog.getByRole('button', { name: 'Registrar recebimento' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'Recebimento registrado: Parcela 1 de 2, R$ 100,00.',
      );
    });
    expect(calls.find((call) => call.method === 'PATCH')).toMatchObject({
      url: '/api/admin/payments/p-1',
      body: { paidOn: '2026-11-15' },
    });
    // As somas do mês mudaram: a tela pede o mês de novo.
    await waitFor(() => {
      expect(calls.filter((call) => call.url === '/api/admin/finance?month=2026-11')).toHaveLength(
        2,
      );
    });
  });

  it('desfaz um recebimento pela lista', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const calls = renderPage();
    await loaded();

    await user.click(
      screen.getByRole('button', { name: 'Desfazer recebimento: Sinal de Ana Beatriz' }),
    );

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'Recebimento desfeito: Sinal de Ana Beatriz.',
      );
    });
    expect(calls.find((call) => call.method === 'PATCH')).toMatchObject({
      url: '/api/admin/payments/p-0',
      body: { paidOn: null },
    });
  });

  it('oferece cobrar pelo WhatsApp o que está em aberto, com o valor e o vencimento', async () => {
    renderPage();
    await loaded();

    const month = section('Vencimentos de novembro de 2026');
    const href = month.getByRole('link', { name: 'Cobrar pelo WhatsApp' }).getAttribute('href')!;
    const text = new URL(href).searchParams.get('text') ?? '';

    expect(href).toMatch(/^https:\/\/wa\.me\/5511988887777\?text=/);
    expect(text).toContain('Parcela 1 de 2');
    expect(text).toMatch(/R\$\s100,00, com vencimento em 20\/11\/2026/);
    // O recebido não se cobra, e quem não tem telefone não tem link.
    expect(month.getAllByRole('link', { name: 'Cobrar pelo WhatsApp' })).toHaveLength(1);
  });

  it('lista o que está em atraso, de qualquer mês, com o total', async () => {
    renderPage();
    await loaded();

    const late = section('Em atraso');
    expect(late.getByText('Restante · Bia Costa')).toBeVisible();
    expect(late.getByText(/Vence em 05\/11\/2026/)).toBeVisible();
    expect(late.getAllByText('R$ 50,00').length).toBeGreaterThan(0);
  });

  it('aponta as reservas fechadas do mês que ainda não têm pagamento', async () => {
    renderPage();
    await loaded();

    const unplanned = section('Sem pagamento registrado');
    expect(unplanned.getByText('Carla Dias')).toBeVisible();
    expect(
      unplanned.getByRole('link', { name: 'Registrar pagamento da reserva de Carla Dias' }),
    ).toHaveAttribute('href', '/admin/reservas/b-3');
  });

  it('navega entre os meses e explica o mês sem vencimento', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const calls = renderPage();
    await loaded();

    await user.click(screen.getByRole('button', { name: 'Mês seguinte' }));

    const december = within(
      await screen.findByRole('region', { name: 'Vencimentos de dezembro de 2026' }),
    );
    expect(screen.getByRole('heading', { name: 'Dezembro de 2026' })).toBeVisible();
    expect(calls.some((call) => call.url === '/api/admin/finance?month=2026-12')).toBe(true);
    expect(december.getByText('Nenhum vencimento em dezembro de 2026.')).toBeVisible();
    expect(section('Em atraso').getByText('Nada em atraso.')).toBeVisible();
    expect(
      screen.queryByRole('region', { name: 'Sem pagamento registrado' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Voltar para hoje' }));

    expect(await screen.findByRole('heading', { name: 'Novembro de 2026' })).toBeVisible();
  });

  it('explica a falha em vez de mostrar números zerados', async () => {
    renderPage({
      'GET /api/admin/finance?month=2026-11': () =>
        errorResponse(
          500,
          'INTERNAL',
          'Algo deu errado do nosso lado. Tente de novo em instantes.',
        ),
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Algo deu errado do nosso lado.');
    expect(screen.queryByText('previsto para o mês')).not.toBeInTheDocument();
  });
});
