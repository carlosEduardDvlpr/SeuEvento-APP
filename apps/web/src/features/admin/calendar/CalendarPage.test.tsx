import type { AdminBookingSummary, AdminCalendar, AdminCalendarDay } from '@chacara/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/Toast';
import { errorResponse, jsonResponse, renderWithProviders } from '../../../../test/helpers/render';
import { CalendarPage } from './CalendarPage';

/**
 * Calendário do painel (§13.4).
 *
 * O relógio é fixado porque a tela abre no mês corrente e marca o dia de hoje —
 * sem data fixa, o teste mudaria de comportamento conforme o dia em que roda.
 */

const RESERVA: AdminBookingSummary = {
  id: 'b-1',
  kind: 'VENUE',
  startDate: '2026-11-20',
  endDate: '2026-11-21',
  status: 'CONFIRMED',
  eventType: 'BABY_SHOWER',
  guestCount: 60,
  totalCents: 436_000,
  holdExpiresAt: null,
  createdByAdmin: false,
  createdAt: '2026-11-10T12:00:00.000Z',
  customer: {
    id: 'u-1',
    name: 'Ana Beatriz',
    email: 'ana@exemplo.com',
    phone: '11988887777',
  },
};

const PEDIDO: AdminBookingSummary = {
  ...RESERVA,
  id: 'b-2',
  startDate: '2026-11-28',
  endDate: '2026-11-28',
  status: 'PENDING',
  holdExpiresAt: '2026-11-17T18:00:00.000Z',
  customer: { id: 'u-2', name: 'Bia Costa', email: null, phone: null },
};

/** Novembro de 2026 com as reservas e os bloqueios que o caso precisar. */
function novemberCalendar(
  options: {
    bookings?: AdminBookingSummary[];
    blocked?: { date: string; reason: string | null }[];
  } = {},
): AdminCalendar {
  const bookings = options.bookings ?? [];
  const blocked = options.blocked ?? [];

  const days: AdminCalendarDay[] = [];

  for (let day = 1; day <= 30; day += 1) {
    const date = `2026-11-${String(day).padStart(2, '0')}`;
    const block = blocked.find((item) => item.date === date);
    const ids = bookings
      .filter((booking) => date >= booking.startDate && date <= booking.endDate)
      .map((booking) => booking.id);

    days.push({
      date,
      status: block ? 'blocked' : ids.length > 0 ? 'booked' : date < '2026-11-17' ? 'past' : 'free',
      bookingIds: ids,
      blockReason: block?.reason ?? null,
      // Bloqueio de teste é o original: fecha só a chácara.
      blockScope: block ? 'VENUE' : null,
    });
  }

  return { month: '2026-11', from: '2026-11-01', to: '2026-11-30', days, bookings };
}

type Call = { url: string; method: string; body: unknown };

function stubFetch(byMonth: Record<string, AdminCalendar | (() => Response)> = {}) {
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

      const month = new URL(url, 'http://local').searchParams.get('month');

      if (url.startsWith('/api/admin/calendar') && month) {
        const handler = byMonth[month];
        if (typeof handler === 'function') return Promise.resolve(handler());
        return Promise.resolve(jsonResponse(handler ?? novemberCalendar()));
      }

      // Bloquear e desbloquear respondem o dia; a tela relê o calendário depois.
      if (url.startsWith('/api/admin/blocked-dates')) {
        return Promise.resolve(
          call.method === 'DELETE'
            ? new Response(null, { status: 204 })
            : jsonResponse({ date: '2026-11-25', reason: null }),
        );
      }

      return Promise.resolve(jsonResponse([]));
    }),
  );

  return calls;
}

function renderCalendar() {
  return renderWithProviders(
    <ToastProvider>
      <CalendarPage />
    </ToastProvider>,
    { route: '/admin/calendario', withAuth: false },
  );
}

/** Botão do dia, pelo número visível na célula. */
function dayButton(day: number) {
  return screen
    .getAllByRole('button')
    .find((button) => button.textContent?.startsWith(String(day)) === true);
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

describe('CalendarPage', () => {
  it('abre no mês de hoje e pede esse mês à API', async () => {
    const calls = stubFetch();
    renderCalendar();

    expect(await screen.findByRole('heading', { name: 'Novembro de 2026' })).toBeVisible();
    expect(calls.some((call) => call.url === '/api/admin/calendar?month=2026-11')).toBe(true);
  });

  it('navega para o mês seguinte e para o anterior', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const calls = stubFetch({
      '2026-12': { ...novemberCalendar(), month: '2026-12' },
      '2026-10': { ...novemberCalendar(), month: '2026-10' },
    });
    renderCalendar();

    await screen.findByRole('heading', { name: 'Novembro de 2026' });

    await user.click(screen.getByRole('button', { name: 'Mês seguinte' }));
    await waitFor(() => {
      expect(calls.some((call) => call.url === '/api/admin/calendar?month=2026-12')).toBe(true);
    });

    await user.click(screen.getByRole('button', { name: 'Mês anterior' }));
    await waitFor(() => {
      expect(calls.some((call) => call.url === '/api/admin/calendar?month=2026-11')).toBe(true);
    });
  });

  it('oferece voltar para hoje só quando saiu do mês atual', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    stubFetch({ '2026-12': { ...novemberCalendar(), month: '2026-12' } });
    renderCalendar();

    await screen.findByRole('heading', { name: 'Novembro de 2026' });
    expect(screen.queryByRole('button', { name: 'Voltar para hoje' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Mês seguinte' }));

    expect(await screen.findByRole('button', { name: 'Voltar para hoje' })).toBeVisible();
  });

  it('mostra os sete dias da semana como cabeçalho', async () => {
    stubFetch();
    renderCalendar();

    await screen.findByRole('heading', { name: 'Novembro de 2026' });

    for (const label of ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']) {
      expect(screen.getByRole('columnheader', { name: label })).toBeVisible();
    }
  });

  /* §14.2: status nunca é comunicado só por cor. */
  it('escreve o estado de cada dia, não só colore', async () => {
    stubFetch({ '2026-11': novemberCalendar({ bookings: [RESERVA] }) });
    renderCalendar();

    await screen.findByRole('heading', { name: 'Novembro de 2026' });

    expect(dayButton(20)).toHaveTextContent('Reservado');
    expect(dayButton(25)).toHaveTextContent('Livre');
  });

  it('conta as reservas do dia na própria célula', async () => {
    stubFetch({ '2026-11': novemberCalendar({ bookings: [RESERVA] }) });
    renderCalendar();

    await screen.findByRole('heading', { name: 'Novembro de 2026' });

    expect(dayButton(20)).toHaveTextContent('1 reserva');
  });

  it('resume quantas reservas ativas o mês tem', async () => {
    stubFetch({ '2026-11': novemberCalendar({ bookings: [RESERVA, PEDIDO] }) });
    renderCalendar();

    expect(await screen.findByText(/2 reservas ativas/)).toBeVisible();
  });

  it('explica a falha em vez de mostrar grade vazia', async () => {
    stubFetch({
      '2026-11': () => errorResponse(500, 'INTERNAL', 'Algo deu errado do nosso lado.'),
    });
    renderCalendar();

    expect(await screen.findByRole('alert')).toHaveTextContent('Algo deu errado do nosso lado.');
  });

  describe('gaveta do dia', () => {
    it('lista a reserva do dia com cliente, datas e total', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      stubFetch({ '2026-11': novemberCalendar({ bookings: [RESERVA] }) });
      renderCalendar();

      await screen.findByRole('heading', { name: 'Novembro de 2026' });
      await user.click(dayButton(20)!);

      const dialog = within(await screen.findByRole('dialog'));

      expect(dialog.getByText('20 de novembro de 2026')).toBeVisible();
      expect(dialog.getByText('Ana Beatriz')).toBeVisible();
      expect(dialog.getByText(/20 a 21 de novembro de 2026/)).toBeVisible();
      expect(dialog.getByText('R$ 4.360,00')).toBeVisible();
      expect(dialog.getByText('Confirmada')).toBeVisible();
    });

    it('conta o prazo de resposta do pedido aguardando', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      stubFetch({ '2026-11': novemberCalendar({ bookings: [PEDIDO] }) });
      renderCalendar();

      await screen.findByRole('heading', { name: 'Novembro de 2026' });
      await user.click(dayButton(28)!);

      // De 15/11 15:00 UTC até 17/11 18:00 UTC são 2 dias e 3 horas.
      expect(await screen.findByText(/Prazo para responder em 2 dias/)).toBeVisible();
    });

    it('oferece o WhatsApp de quem tem telefone', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      stubFetch({ '2026-11': novemberCalendar({ bookings: [RESERVA] }) });
      renderCalendar();

      await screen.findByRole('heading', { name: 'Novembro de 2026' });
      await user.click(dayButton(20)!);

      expect(await screen.findByRole('link', { name: 'WhatsApp' })).toHaveAttribute(
        'href',
        expect.stringContaining('wa.me/5511988887777'),
      );
    });

    it('não oferece WhatsApp para cliente sem telefone', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      stubFetch({ '2026-11': novemberCalendar({ bookings: [PEDIDO] }) });
      renderCalendar();

      await screen.findByRole('heading', { name: 'Novembro de 2026' });
      await user.click(dayButton(28)!);

      await screen.findByText('Bia Costa');
      expect(screen.queryByRole('link', { name: 'WhatsApp' })).not.toBeInTheDocument();
    });

    it('leva ao detalhe da reserva', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      stubFetch({ '2026-11': novemberCalendar({ bookings: [RESERVA] }) });
      renderCalendar();

      await screen.findByRole('heading', { name: 'Novembro de 2026' });
      await user.click(dayButton(20)!);

      expect(await screen.findByRole('link', { name: 'Abrir reserva' })).toHaveAttribute(
        'href',
        '/admin/reservas/b-1',
      );
    });

    it('diz quando o dia não tem reserva', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      stubFetch();
      renderCalendar();

      await screen.findByRole('heading', { name: 'Novembro de 2026' });
      await user.click(dayButton(25)!);

      expect(await screen.findByText('Nenhuma reserva neste dia.')).toBeVisible();
    });

    it('marca a reserva que o próprio dono lançou', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      stubFetch({
        '2026-11': novemberCalendar({ bookings: [{ ...RESERVA, createdByAdmin: true }] }),
      });
      renderCalendar();

      await screen.findByRole('heading', { name: 'Novembro de 2026' });
      await user.click(dayButton(20)!);

      expect(await screen.findByText('lançada por você')).toBeVisible();
    });
  });

  describe('bloquear e liberar', () => {
    it('bloqueia o dia com o motivo escrito', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const calls = stubFetch();
      renderCalendar();

      await screen.findByRole('heading', { name: 'Novembro de 2026' });
      await user.click(dayButton(25)!);

      await user.type(await screen.findByLabelText('Motivo do bloqueio'), 'Manutenção');
      await user.click(screen.getByRole('button', { name: 'Bloquear este dia' }));

      // Sem escolher, o bloqueio é o de sempre: fecha só a chácara (T32).
      await waitFor(() => {
        expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
          date: '2026-11-25',
          reason: 'Manutenção',
          scope: 'VENUE',
        });
      });
    });

    it('aceita bloqueio sem motivo, mandando nulo', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const calls = stubFetch();
      renderCalendar();

      await screen.findByRole('heading', { name: 'Novembro de 2026' });
      await user.click(dayButton(25)!);
      await user.click(await screen.findByRole('button', { name: 'Bloquear este dia' }));

      await waitFor(() => {
        expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
          date: '2026-11-25',
          reason: null,
          scope: 'VENUE',
        });
      });
    });

    it('avisa o que ficou indisponível', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      stubFetch();
      renderCalendar();

      await screen.findByRole('heading', { name: 'Novembro de 2026' });
      await user.click(dayButton(25)!);
      await user.click(await screen.findByRole('button', { name: 'Bloquear este dia' }));

      expect(await screen.findByRole('status')).toHaveTextContent(
        '25 de novembro de 2026 ficou indisponível para a chácara.',
      );
    });

    /*
     * §11.2: bloquear dia com reserva é permitido, e é o que se faz quando a
     * chácara fica indisponível de verdade. O aviso impede a conclusão errada.
     */
    it('avisa que bloquear não cancela as reservas do dia', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      stubFetch({ '2026-11': novemberCalendar({ bookings: [RESERVA] }) });
      renderCalendar();

      await screen.findByRole('heading', { name: 'Novembro de 2026' });
      await user.click(dayButton(20)!);

      expect(await screen.findByText(/Bloquear não cancela as reservas acima/)).toBeVisible();
    });

    it('não repete o aviso em dia sem reserva', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      stubFetch();
      renderCalendar();

      await screen.findByRole('heading', { name: 'Novembro de 2026' });
      await user.click(dayButton(25)!);

      await screen.findByText('Nenhuma reserva neste dia.');
      expect(screen.queryByText(/Bloquear não cancela/)).not.toBeInTheDocument();
    });

    it('mostra o motivo gravado e oferece liberar o dia bloqueado', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      stubFetch({
        '2026-11': novemberCalendar({
          blocked: [{ date: '2026-11-25', reason: 'Uso da família' }],
        }),
      });
      renderCalendar();

      await screen.findByRole('heading', { name: 'Novembro de 2026' });
      await user.click(dayButton(25)!);

      expect(
        await screen.findByText(/A chácara está fechada neste dia: Uso da família/),
      ).toBeVisible();
      expect(screen.getByRole('button', { name: 'Liberar este dia' })).toBeVisible();
      // E não oferece bloquear de novo o que já está bloqueado.
      expect(screen.queryByRole('button', { name: 'Bloquear este dia' })).not.toBeInTheDocument();
    });

    it('libera o dia pelo caminho de desbloqueio', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const calls = stubFetch({
        '2026-11': novemberCalendar({ blocked: [{ date: '2026-11-25', reason: null }] }),
      });
      renderCalendar();

      await screen.findByRole('heading', { name: 'Novembro de 2026' });
      await user.click(dayButton(25)!);
      await user.click(await screen.findByRole('button', { name: 'Liberar este dia' }));

      await waitFor(() => {
        expect(
          calls.some(
            (call) =>
              call.method === 'DELETE' && call.url === '/api/admin/blocked-dates/2026-11-25',
          ),
        ).toBe(true);
      });
    });

    it('conta o problema quando a API recusa o bloqueio', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string, init?: { method?: string }) => {
          if (url.startsWith('/api/admin/calendar')) {
            return Promise.resolve(jsonResponse(novemberCalendar()));
          }
          if (init?.method === 'POST') {
            return Promise.resolve(
              errorResponse(500, 'INTERNAL', 'Algo deu errado do nosso lado.'),
            );
          }
          return Promise.resolve(jsonResponse([]));
        }),
      );
      renderCalendar();

      await screen.findByRole('heading', { name: 'Novembro de 2026' });
      await user.click(dayButton(25)!);
      await user.click(await screen.findByRole('button', { name: 'Bloquear este dia' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Algo deu errado do nosso lado.');
    });
  });
});

/*
 * T32: a decoração aparece por cima da agenda da chácara, sem mudar o estado do
 * dia. Os dados montados aqui imitam o servidor: reserva de decoração não deixa
 * o dia `booked`, e bloqueio só da decoração não o deixa `blocked`.
 */
describe('CalendarPage: decoração', () => {
  const DECORACAO: AdminBookingSummary = {
    ...RESERVA,
    id: 'b-3',
    kind: 'DECORATION',
    guestCount: null,
    startDate: '2026-11-28',
    endDate: '2026-11-28',
    customer: { id: 'u-3', name: 'Carla Dias', email: null, phone: '11977771234' },
  };

  /** Novembro com uma decoração saindo no dia 28 e a decoração fechada no dia 26. */
  function withDecoration(): AdminCalendar {
    const calendar = novemberCalendar({ bookings: [DECORACAO] });

    return {
      ...calendar,
      days: calendar.days.map((day) => {
        if (day.date === '2026-11-28') return { ...day, status: 'free' as const };
        if (day.date === '2026-11-26') {
          return { ...day, blockScope: 'DECORATION' as const, blockReason: 'Viagem' };
        }
        return day;
      }),
    };
  }

  it('mostra a decoração saindo sem ocupar o dia da chácara', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    stubFetch({ '2026-11': withDecoration() });
    renderCalendar();

    await screen.findByRole('heading', { name: 'Novembro de 2026' });

    expect(dayButton(28)).toHaveTextContent('Livre');
    expect(dayButton(28)).toHaveTextContent('1 decoração');

    await user.click(dayButton(28)!);
    expect(await screen.findByText(/só decoração/)).toBeVisible();
  });

  it('marca o dia com a decoração fechada e explica o que continua aberto', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    stubFetch({ '2026-11': withDecoration() });
    renderCalendar();

    await screen.findByRole('heading', { name: 'Novembro de 2026' });

    expect(dayButton(26)).toHaveTextContent('Livre');
    expect(dayButton(26)).toHaveTextContent('sem decoração');

    await user.click(dayButton(26)!);
    expect(await screen.findByText(/A decoração está fechada neste dia: Viagem/)).toBeVisible();
    expect(screen.getByText(/A chácara continua reservável/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Liberar este dia' })).toBeVisible();
  });

  it('bloqueia só a decoração quando a dona escolhe', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const calls = stubFetch();
    renderCalendar();

    await screen.findByRole('heading', { name: 'Novembro de 2026' });
    await user.click(dayButton(25)!);
    await user.click(await screen.findByRole('radio', { name: 'Só a decoração' }));
    await user.click(screen.getByRole('button', { name: 'Bloquear este dia' }));

    await waitFor(() => {
      expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
        date: '2026-11-25',
        reason: null,
        scope: 'DECORATION',
      });
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      '25 de novembro de 2026 ficou sem saída de decoração.',
    );
  });
});
