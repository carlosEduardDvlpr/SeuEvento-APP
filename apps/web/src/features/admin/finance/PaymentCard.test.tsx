import type { AdminPayment, PaymentPlan } from '@chacara/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/Toast';
import { errorResponse, jsonResponse, renderWithProviders } from '../../../../test/helpers/render';
import { PaymentCard } from './PaymentCard';

/**
 * Pagamento da reserva no painel (§9.11).
 *
 * O relógio fica parado em 15/11/2026, meio-dia em São Paulo: "hoje" é o dia
 * sugerido para o recebimento e o limite que o editor não deixa passar.
 */

const BOOKING = {
  id: 'b-1',
  startDate: '2026-12-05',
  totalCents: 50_000,
  customer: { id: 'u-1', name: 'Ana Beatriz', email: 'ana@exemplo.com', phone: '11988887777' },
};

function payment(overrides: Partial<AdminPayment> = {}): AdminPayment {
  return {
    id: 'p-1',
    kind: 'INSTALLMENT',
    number: 1,
    dueDate: '2026-12-05',
    amountCents: 50_000,
    paidOn: null,
    status: 'PENDING',
    label: 'À vista',
    ...overrides,
  };
}

const SINAL = payment({
  id: 'p-0',
  kind: 'DEPOSIT',
  number: 0,
  dueDate: '2026-11-01',
  amountCents: 30_000,
  paidOn: '2026-11-01',
  status: 'PAID',
  label: 'Sinal',
});

const RESTANTE = payment({ id: 'p-2', amountCents: 20_000, label: 'Restante' });

function plan(payments: AdminPayment[], overrides: Partial<PaymentPlan> = {}): PaymentPlan {
  const total = (paid: boolean) =>
    payments.filter((p) => (p.paidOn !== null) === paid).reduce((sum, p) => sum + p.amountCents, 0);

  return {
    bookingId: 'b-1',
    totalCents: 50_000,
    payments,
    paidCents: total(true),
    pendingCents: total(false),
    overdueCents: 0,
    canEdit: true,
    canDelete: payments.length > 0 && total(true) === 0,
    ...overrides,
  };
}

type Call = { url: string; method: string; body: unknown };
type Handler = (call: Call) => Response;

function stubFetch(routes: Record<string, Handler>) {
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
      if (call.method === 'DELETE') return Promise.resolve(new Response(null, { status: 204 }));

      return Promise.resolve(jsonResponse({}));
    }),
  );

  return calls;
}

function renderCard(initial: PaymentPlan, routes: Record<string, Handler> = {}) {
  const calls = stubFetch({
    'GET /api/admin/bookings/b-1/payments': () => jsonResponse(initial),
    ...routes,
  });

  renderWithProviders(
    <ToastProvider>
      <PaymentCard booking={BOOKING} />
    </ToastProvider>,
    { route: '/admin/reservas/b-1', withAuth: false },
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

describe('PaymentCard', () => {
  it('sem plano, convida a registrar o pagamento', async () => {
    renderCard(plan([]));

    expect(await screen.findByText(/Nenhum pagamento registrado/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Registrar pagamento' })).toBeVisible();
  });

  it('mostra cada recebimento com a situação, a data e as somas', async () => {
    renderCard(plan([SINAL, RESTANTE]));

    const sinal = (await screen.findByText('Sinal')).closest('li')!;
    expect(sinal).toHaveTextContent('Recebido');
    expect(sinal).toHaveTextContent('Recebido em 01/11/2026');
    expect(sinal).toHaveTextContent('R$ 300,00');

    const restante = screen.getByText('Restante').closest('li')!;
    expect(restante).toHaveTextContent('A receber');
    expect(restante).toHaveTextContent('Vence em 05/12/2026');
    expect(restante).toHaveTextContent('R$ 200,00');

    expect(screen.getByText('Recebido', { selector: 'dt' }).parentElement).toHaveTextContent(
      'R$ 300,00',
    );
    expect(screen.getByText('A receber', { selector: 'dt' }).parentElement).toHaveTextContent(
      'R$ 200,00',
    );
    expect(screen.getByRole('button', { name: 'Editar pagamento' })).toBeVisible();
  });

  it('registra o recebimento com o dia de hoje', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const calls = renderCard(plan([SINAL, RESTANTE]), {
      'PATCH /api/admin/payments/p-2': () =>
        jsonResponse(plan([SINAL, { ...RESTANTE, paidOn: '2026-11-15', status: 'PAID' }])),
    });

    await user.click(
      await screen.findByRole('button', { name: 'Registrar recebimento: Restante' }),
    );
    const dialog = within(await screen.findByRole('dialog', { name: 'Registrar recebimento' }));

    expect(dialog.getByText(/de Ana Beatriz/)).toBeVisible();
    expect(dialog.getByLabelText('Recebido em')).toHaveValue('2026-11-15');

    await user.click(dialog.getByRole('button', { name: 'Registrar recebimento' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'Recebimento registrado: Restante, R$ 200,00.',
      );
    });
    expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({ paidOn: '2026-11-15' });
    expect(
      await screen.findByRole('button', { name: 'Desfazer recebimento: Restante' }),
    ).toBeVisible();
  });

  /* Quem anota no sábado o Pix que caiu na terça registra a terça. */
  it('registra o recebimento em outro dia', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const calls = renderCard(plan([SINAL, RESTANTE]), {
      'PATCH /api/admin/payments/p-2': () => jsonResponse(plan([SINAL, RESTANTE])),
    });

    await user.click(
      await screen.findByRole('button', { name: 'Registrar recebimento: Restante' }),
    );
    const dialog = within(await screen.findByRole('dialog'));
    await user.clear(dialog.getByLabelText('Recebido em'));
    await user.type(dialog.getByLabelText('Recebido em'), '2026-11-10');
    await user.click(dialog.getByRole('button', { name: 'Registrar recebimento' }));

    await waitFor(() => {
      expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({
        paidOn: '2026-11-10',
      });
    });
  });

  it('não registra recebimento num dia que ainda não chegou', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const calls = renderCard(plan([SINAL, RESTANTE]));

    await user.click(
      await screen.findByRole('button', { name: 'Registrar recebimento: Restante' }),
    );
    const dialog = within(await screen.findByRole('dialog'));
    await user.clear(dialog.getByLabelText('Recebido em'));
    await user.type(dialog.getByLabelText('Recebido em'), '2026-11-16');
    await user.click(dialog.getByRole('button', { name: 'Registrar recebimento' }));

    expect(dialog.getByRole('alert')).toHaveTextContent(
      'A data do recebimento não pode ser depois de hoje.',
    );
    expect(calls.some((call) => call.method === 'PATCH')).toBe(false);
  });

  it('desfaz um recebimento', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const calls = renderCard(plan([SINAL, RESTANTE]), {
      'PATCH /api/admin/payments/p-0': () =>
        jsonResponse(plan([{ ...SINAL, paidOn: null, status: 'PENDING' }, RESTANTE])),
    });

    await user.click(await screen.findByRole('button', { name: 'Desfazer recebimento: Sinal' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Recebimento desfeito: Sinal.');
    });
    expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({ paidOn: null });
  });

  it('na reserva cancelada, não edita e explica o que deixou de ser cobrado', async () => {
    renderCard(
      plan([SINAL, { ...RESTANTE, status: 'CANCELLED' }], { canEdit: false, pendingCents: 0 }),
    );

    expect(await screen.findByText(/deixou de ser cobrado/)).toBeVisible();
    expect(screen.getByText('Restante').closest('li')).toHaveTextContent('Cancelado');
    expect(screen.queryByRole('button', { name: 'Editar pagamento' })).not.toBeInTheDocument();
  });

  it('exclui o plano sem recebimento, explicando antes o que acontece', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const calls = renderCard(plan([payment()]));

    await user.click(await screen.findByRole('button', { name: 'Excluir plano' }));
    const dialog = within(
      await screen.findByRole('dialog', { name: 'Excluir plano de pagamento' }),
    );

    expect(dialog.getByText(/A reserva e o total contratado não mudam/)).toBeVisible();

    await user.click(dialog.getByRole('button', { name: 'Excluir plano' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Plano de pagamento excluído.');
    });
    expect(calls.some((call) => call.method === 'DELETE')).toBe(true);
  });

  it('não oferece excluir o plano que já tem recebimento', async () => {
    renderCard(plan([SINAL, RESTANTE]));

    await screen.findByText('Sinal');
    expect(screen.queryByRole('button', { name: 'Excluir plano' })).not.toBeInTheDocument();
  });
});

describe('editor do plano', () => {
  async function openEditor(initial: PaymentPlan, routes: Record<string, Handler> = {}) {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const calls = renderCard(initial, {
      'PUT /api/admin/bookings/b-1/payments': () => jsonResponse(initial),
      ...routes,
    });

    await user.click(
      await screen.findByRole('button', {
        name: initial.payments.length > 0 ? 'Editar pagamento' : 'Registrar pagamento',
      }),
    );
    const dialog = within(await screen.findByRole('dialog'));
    const save = () => user.click(dialog.getByRole('button', { name: 'Salvar pagamento' }));
    const row = (name: string) => within(dialog.getByRole('group', { name }));

    return { user, calls, dialog, save, row };
  }

  const putBody = (calls: Call[]) => calls.find((call) => call.method === 'PUT')?.body;

  it('plano novo começa à vista, com o total no dia da festa', async () => {
    const { calls, dialog, save } = await openEditor(plan([]));

    expect(dialog.getByText('Total da reserva').parentElement).toHaveTextContent('R$ 500,00');
    expect(dialog.getByLabelText('Dividir o que falta em')).toHaveValue('1');
    expect(dialog.getByLabelText('Vencimento')).toHaveValue('2026-12-05');
    expect(dialog.getByText('À vista').parentElement).toHaveTextContent('R$ 500,00');
    expect(dialog.getByText('A soma bate com o total da reserva.')).toBeVisible();

    await save();

    await waitFor(() => {
      expect(putBody(calls)).toEqual({
        deposit: null,
        installments: [{ dueDate: '2026-12-05', amountCents: 50_000, paidOn: null }],
      });
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Pagamento salvo.');
  });

  /* O exemplo do dono: reserva de R$ 500, sinal de R$ 300, restante de R$ 200 numa data. */
  it('anota o sinal recebido e deixa o restante para a data escolhida', async () => {
    const { user, calls, dialog, save } = await openEditor(plan([]));

    await user.type(dialog.getByLabelText('Valor do sinal'), '300');

    expect(dialog.getByLabelText('Recebido em')).toHaveValue('2026-11-15');
    expect(dialog.getByLabelText('Já recebido')).toBeChecked();
    expect(dialog.getByText('Restante').parentElement).toHaveTextContent('R$ 200,00');

    await user.clear(dialog.getByLabelText('Vencimento'));
    await user.type(dialog.getByLabelText('Vencimento'), '2026-12-01');
    await save();

    await waitFor(() => {
      expect(putBody(calls)).toEqual({
        deposit: { dueDate: '2026-11-15', amountCents: 30_000, paidOn: '2026-11-15' },
        installments: [{ dueDate: '2026-12-01', amountCents: 20_000, paidOn: null }],
      });
    });
  });

  it('o sinal ainda não recebido vai com vencimento, sem recebimento', async () => {
    const { user, calls, dialog, save } = await openEditor(plan([]));

    await user.type(dialog.getByLabelText('Valor do sinal'), '100');
    await user.click(dialog.getByLabelText('Já recebido'));
    await user.clear(dialog.getByLabelText('Vence em'));
    await user.type(dialog.getByLabelText('Vence em'), '2026-11-20');
    await save();

    await waitFor(() => {
      expect(putBody(calls)).toMatchObject({
        deposit: { dueDate: '2026-11-20', amountCents: 10_000, paidOn: null },
      });
    });
  });

  it('divide em parcelas mensais, com o centavo que sobra na primeira', async () => {
    const { user, dialog, row } = await openEditor(plan([]));

    await user.selectOptions(dialog.getByLabelText('Dividir o que falta em'), '3');

    expect(dialog.getByLabelText('Primeira parcela em')).toHaveValue('2026-12-05');
    expect(row('Parcela 1 de 3').getByLabelText('Vencimento')).toHaveValue('2026-12-05');
    expect(row('Parcela 1 de 3').getByLabelText('Valor')).toHaveValue(166.68);
    expect(row('Parcela 2 de 3').getByLabelText('Vencimento')).toHaveValue('2027-01-05');
    expect(row('Parcela 3 de 3').getByLabelText('Vencimento')).toHaveValue('2027-02-05');
    expect(row('Parcela 3 de 3').getByLabelText('Valor')).toHaveValue(166.66);
  });

  it('mudar uma parcela não refaz as outras, e a soma diz quanto falta', async () => {
    const { user, calls, dialog, save, row } = await openEditor(plan([]));

    await user.selectOptions(dialog.getByLabelText('Dividir o que falta em'), '2');
    await user.clear(row('Parcela 2 de 2').getByLabelText('Valor'));
    await user.type(row('Parcela 2 de 2').getByLabelText('Valor'), '200');

    expect(row('Parcela 1 de 2').getByLabelText('Valor')).toHaveValue(250);
    expect(dialog.getByText('Faltam R$ 50,00 para fechar o total.')).toBeVisible();

    await save();

    expect(dialog.getByRole('alert')).toHaveTextContent(
      'A soma do sinal e das parcelas (R$ 450,00) precisa ser igual ao total da reserva (R$ 500,00).',
    );
    expect(putBody(calls)).toBeUndefined();
  });

  it('mudar o sinal refaz os valores, e as datas escolhidas continuam', async () => {
    const { user, dialog, row } = await openEditor(plan([]));

    await user.selectOptions(dialog.getByLabelText('Dividir o que falta em'), '2');
    await user.clear(row('Parcela 2 de 2').getByLabelText('Vencimento'));
    await user.type(row('Parcela 2 de 2').getByLabelText('Vencimento'), '2027-03-10');
    await user.type(dialog.getByLabelText('Valor do sinal'), '100');

    expect(row('Parcela 2 de 2').getByLabelText('Vencimento')).toHaveValue('2027-03-10');
    expect(row('Parcela 1 de 2').getByLabelText('Valor')).toHaveValue(200);
    expect(row('Parcela 2 de 2').getByLabelText('Valor')).toHaveValue(200);
  });

  it('não aceita sinal recebido num dia que ainda não chegou', async () => {
    const { user, calls, dialog, save } = await openEditor(plan([]));

    await user.type(dialog.getByLabelText('Valor do sinal'), '100');
    await user.clear(dialog.getByLabelText('Recebido em'));
    await user.type(dialog.getByLabelText('Recebido em'), '2026-11-20');
    await save();

    expect(dialog.getByText('A data do recebimento não pode ser depois de hoje.')).toBeVisible();
    expect(putBody(calls)).toBeUndefined();
  });

  it('trava o que já foi recebido e o devolve como estava', async () => {
    const { calls, dialog, save } = await openEditor(plan([SINAL, RESTANTE]));

    expect(dialog.getByText(/recebido em 01\/11\/2026/)).toBeVisible();
    expect(dialog.queryByLabelText('Valor do sinal')).not.toBeInTheDocument();
    expect(dialog.getByText(/desfaça o recebimento no cartão/)).toBeVisible();
    expect(dialog.getByText('Restante').parentElement).toHaveTextContent('R$ 200,00');

    await save();

    await waitFor(() => {
      expect(putBody(calls)).toEqual({
        deposit: { dueDate: '2026-11-01', amountCents: 30_000, paidOn: '2026-11-01' },
        installments: [{ dueDate: '2026-12-05', amountCents: 20_000, paidOn: null }],
      });
    });
  });

  it('mostra a recusa da API sem fechar o editor', async () => {
    const { dialog, save } = await openEditor(plan([]), {
      'PUT /api/admin/bookings/b-1/payments': () =>
        errorResponse(
          422,
          'PAYMENT_PLAN_LOCKED',
          'Esta reserva foi cancelada: o plano de pagamento não pode mais ser alterado.',
        ),
    });

    await save();

    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'Esta reserva foi cancelada: o plano de pagamento não pode mais ser alterado.',
    );
    expect(dialog.getByRole('button', { name: 'Salvar pagamento' })).toBeVisible();
  });
});
