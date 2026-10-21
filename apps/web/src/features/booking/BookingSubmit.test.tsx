import type { Booking, CatalogItem, PublicVenue, Quote, SessionUser } from '@chacara/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorResponse, jsonResponse, renderWithProviders } from '../../../test/helpers/render';
import { BookingWizard } from './BookingWizard';
import { EMPTY_DRAFT, type BookingDraft, saveDraft } from './draft';

/**
 * Revisão, envio e confirmação (§13.2).
 *
 * Os testes entram pela borda: o que a API responde e o que a pessoa vê. É aqui
 * que moram as duas garantias mais importantes do fluxo — o total exibido é
 * **sempre** o do servidor, e um envio recusado devolve a pessoa ao passo que
 * resolve o problema.
 */

const VENUE: PublicVenue = {
  name: 'Chácara Seu Evento',
  maxGuests: 120,
  checkInTime: '08:00',
  checkOutTime: '22:00',
  whatsapp: '(11) 99999-0000',
  address: null,
  mapsUrl: null,
  houseRules: 'Som até 22h. Sem fogos.',
  minDays: 1,
  maxDays: 3,
  minLeadDays: 2,
  freeCancelUntilDays: 7,
  holdHours: 48,
};

const PAINEL: CatalogItem = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Painel de balões arco-íris',
  description: null,
  imageUrl: null,
  priceCents: 12_000,
  stock: 3,
  assemblyNotes: null,
  sortOrder: 1,
  category: { id: 'c1', name: 'Painéis', sortOrder: 1 },
  themeIds: [],
};

const QUOTE: Quote = {
  available: true,
  issues: [],
  days: [
    { date: '2026-12-05', priceCents: 180_000, ruleName: 'Fim de semana' },
    { date: '2026-12-06', priceCents: 150_000, ruleName: null },
  ],
  dailyTotalCents: 330_000,
  lines: [
    {
      itemId: PAINEL.id,
      name: PAINEL.name,
      quantity: 2,
      unitPriceCents: 12_000,
      totalCents: 24_000,
    },
  ],
  itemsTotalCents: 24_000,
  combos: [{ comboId: 'combo-1', name: 'Combo Nuvens', times: 1, discountCents: 4_000 }],
  discountTotalCents: 4_000,
  totalCents: 350_000,
};

const BOOKING: Booking = {
  id: 'b-1',
  kind: 'VENUE',
  startDate: '2026-12-05',
  endDate: '2026-12-06',
  eventType: 'BABY_SHOWER',
  guestCount: 60,
  status: 'PENDING',
  holdExpiresAt: '2026-12-03T21:00:00.000Z',
  canCancel: true,
  cancelUntil: null,
  days: QUOTE.days,
  dailyTotalCents: QUOTE.dailyTotalCents,
  items: QUOTE.lines,
  itemsTotalCents: QUOTE.itemsTotalCents,
  combos: QUOTE.combos,
  discountTotalCents: QUOTE.discountTotalCents,
  totalCents: QUOTE.totalCents,
  customerNotes: null,
  cancelReason: null,
  createdAt: '2026-12-01T12:00:00.000Z',
};

const VERIFIED: SessionUser = {
  id: 'u-1',
  name: 'Ana',
  email: 'ana@exemplo.com',
  phone: '(11) 98888-0000',
  role: 'CLIENT',
  emailVerified: true,
};

type Call = { url: string; method: string; body: unknown };
type Handler = (call: Call) => Response;

/**
 * `fetch` de mentira com rotas por `"MÉTODO /caminho"`.
 *
 * A sessão é aberta pelo `POST /auth/refresh`, que é o que o `AuthProvider` chama
 * ao montar: é assim que o teste entra logado sem simular a tela de login.
 */
function stubFetch(routes: Record<string, Handler> = {}, user: SessionUser | null = VERIFIED) {
  const calls: Call[] = [];

  const base: Record<string, Handler> = {
    'GET /api/public/venue': () => jsonResponse(VENUE),
    'GET /api/themes': () => jsonResponse([]),
    'GET /api/categories': () => jsonResponse([]),
    'GET /api/items': () => jsonResponse([PAINEL]),
    'GET /api/combos': () => jsonResponse([]),
    'POST /api/pricing/quote': () => jsonResponse(QUOTE),
    'POST /api/auth/refresh': () =>
      user
        ? jsonResponse({ accessToken: 'token-de-teste', user })
        : errorResponse(401, 'UNAUTHORIZED', 'Sessão expirada.'),
    ...routes,
  };

  const fetchMock = vi.fn((url: string, init?: { method?: string; body?: string }) => {
    const call = {
      url,
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);

    const path = url.split('?')[0]!;
    const handler = base[`${call.method} ${url}`] ?? base[`${call.method} ${path}`];

    if (handler) return Promise.resolve(handler(call));
    if (path === '/api/availability') return Promise.resolve(jsonResponse({ days: [] }));

    return Promise.resolve(jsonResponse([]));
  });

  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

/** Rascunho completo, como quem já passou pelos dois primeiros passos. */
function seedDraft(draft: Partial<BookingDraft> = {}) {
  saveDraft({
    ...EMPTY_DRAFT,
    startDate: '2026-12-05',
    endDate: '2026-12-06',
    eventType: 'BABY_SHOWER',
    guestCount: 60,
    items: [{ itemId: PAINEL.id, quantity: 2 }],
    ...draft,
  });
}

function renderReview(route = '/reservar?step=revisao') {
  return renderWithProviders(<BookingWizard />, { route });
}

beforeEach(() => {
  window.sessionStorage.clear();
  seedDraft();
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

describe('ReviewStep', () => {
  it('mostra a diária de cada dia com o nome da regra que a definiu', async () => {
    stubFetch();
    renderReview();

    expect(await screen.findByText('Valores')).toBeVisible();
    expect(screen.getByText('Fim de semana')).toBeVisible();
    expect(screen.getByText('R$ 1.800,00')).toBeVisible();
    expect(screen.getByText('R$ 1.500,00')).toBeVisible();
  });

  /*
   * §13.2: o front nunca soma preço para exibir o total oficial. 3.300 + 240 − 40
   * daria 3.500 por coincidência aqui; o que o teste garante é que o número
   * exibido é o `totalCents` que veio na resposta.
   */
  it('exibe o total que o servidor calculou', async () => {
    stubFetch({
      'POST /api/pricing/quote': () => jsonResponse({ ...QUOTE, totalCents: 299_900 }),
    });
    renderReview();

    // Duas vezes: no resumo e no rodapé fixo, que na revisão também mostra o
    // total oficial em vez da estimativa.
    expect(await screen.findAllByText('R$ 2.999,00')).toHaveLength(2);
  });

  it('mostra os combos aplicados e quanto a pessoa economiza', async () => {
    stubFetch();
    renderReview();

    expect(await screen.findByText('Combo Nuvens')).toBeVisible();
    expect(screen.getByText(/Você economiza/)).toBeVisible();
  });

  it('pede o orçamento com as datas e os itens do rascunho', async () => {
    const calls = stubFetch();
    renderReview();

    await screen.findByText('Valores');

    const quoteCall = calls.find((call) => call.url === '/api/pricing/quote');
    expect(quoteCall?.body).toEqual({
      kind: 'VENUE',
      startDate: '2026-12-05',
      endDate: '2026-12-06',
      items: [{ itemId: PAINEL.id, quantity: 2 }],
    });
  });

  it('diz que é só a chácara quando não há item no pedido', async () => {
    stubFetch({
      'POST /api/pricing/quote': () =>
        jsonResponse({ ...QUOTE, lines: [], itemsTotalCents: 0, combos: [] }),
    });
    seedDraft({ items: [] });
    renderReview();

    expect(await screen.findByText(/Sem itens de decoração neste pedido/)).toBeVisible();
  });

  /*
   * O orçamento responde 200 com `available: false` e os `issues` (§11.3). O
   * problema aparece sem esvaziar a tela: a pessoa precisa do que montou para
   * poder ajustar.
   */
  it('conta qual dia foi reservado sem perder o pedido montado', async () => {
    stubFetch({
      'POST /api/pricing/quote': () =>
        jsonResponse({
          ...QUOTE,
          available: false,
          issues: [{ code: 'DATE_UNAVAILABLE', dates: ['2026-12-05'] }],
        }),
    });
    renderReview();

    expect(await screen.findByText(/5 de dezembro de 2026 acabou de ser reservado/)).toBeVisible();
    // O resumo continua na tela.
    expect(screen.getByText('Valores')).toBeVisible();
  });

  it('diz quantas unidades ainda cabem quando o item está acabando', async () => {
    stubFetch({
      'POST /api/pricing/quote': () =>
        jsonResponse({
          ...QUOTE,
          available: false,
          issues: [{ code: 'STOCK_INSUFFICIENT', itemId: PAINEL.id, available: 1 }],
        }),
    });
    renderReview();

    expect(
      await screen.findByText(/Só temos 1 unidade de “Painel de balões arco-íris”/),
    ).toBeVisible();
  });

  it('avisa quando o item zerou nas datas escolhidas', async () => {
    stubFetch({
      'POST /api/pricing/quote': () =>
        jsonResponse({
          ...QUOTE,
          available: false,
          issues: [{ code: 'STOCK_INSUFFICIENT', itemId: PAINEL.id, available: 0 }],
        }),
    });
    renderReview();

    expect(await screen.findByText(/não está mais disponível nessas datas/)).toBeVisible();
  });

  it('mostra o prazo do pedido e o prazo de cancelamento antes de enviar', async () => {
    stubFetch();
    renderReview();

    expect(await screen.findByText(/as datas ficam seguras por/i)).toBeVisible();
    expect(screen.getByText(/até 7 dias antes do início/)).toBeVisible();
  });

  it('mostra as regras da casa que o admin escreveu', async () => {
    stubFetch();
    renderReview();

    expect(await screen.findByText('Som até 22h. Sem fogos.')).toBeVisible();
  });

  it('guarda a observação no rascunho enquanto a pessoa escreve', async () => {
    const user = userEvent.setup();
    stubFetch();
    renderReview();

    await user.type(await screen.findByLabelText('Alguma observação?'), 'Chegamos às 14h.');

    await waitFor(() => {
      const stored = JSON.parse(
        window.sessionStorage.getItem('chacara:booking-draft') ?? '{}',
      ) as BookingDraft;
      expect(stored.customerNotes).toBe('Chegamos às 14h.');
    });
  });
});

describe('SubmitGate', () => {
  it('oferece entrar sem perder o pedido quando não há sessão', async () => {
    stubFetch({}, null);
    renderReview();

    expect(await screen.findByText('Falta só entrar')).toBeVisible();
    // O `next` devolve a pessoa ao passo em que ela estava.
    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute(
      'href',
      '/entrar?next=%2Freservar%3Fstep%3Drevisao',
    );
    expect(screen.getByRole('link', { name: 'Criar uma conta' })).toHaveAttribute(
      'href',
      '/cadastro?next=%2Freservar%3Fstep%3Drevisao',
    );
  });

  it('não mostra o botão de enviar para quem não entrou', async () => {
    stubFetch({}, null);
    renderReview();

    await screen.findByText('Falta só entrar');
    expect(screen.queryByRole('button', { name: 'Solicitar reserva' })).not.toBeInTheDocument();
  });

  /* §13.2: conta criada por cadastro próprio confirma o e-mail antes de enviar. */
  it('explica a confirmação de e-mail e oferece reenviar', async () => {
    stubFetch({}, { ...VERIFIED, emailVerified: false });
    renderReview();

    expect(await screen.findByText('Confirme seu e-mail')).toBeVisible();
    expect(screen.getByText('ana@exemplo.com')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reenviar o link' })).toBeVisible();
  });

  it('reconsulta o perfil para quem confirmou o e-mail em outra aba', async () => {
    const user = userEvent.setup();
    stubFetch(
      { 'GET /api/me': () => jsonResponse(VERIFIED) },
      { ...VERIFIED, emailVerified: false },
    );
    renderReview();

    await user.click(await screen.findByRole('button', { name: 'Já confirmei, verificar' }));

    expect(await screen.findByRole('button', { name: 'Solicitar reserva' })).toBeVisible();
  });

  it('insiste quando o e-mail continua sem confirmação', async () => {
    const user = userEvent.setup();
    const unverified = { ...VERIFIED, emailVerified: false };
    stubFetch({ 'GET /api/me': () => jsonResponse(unverified) }, unverified);
    renderReview();

    await user.click(await screen.findByRole('button', { name: 'Já confirmei, verificar' }));

    expect(await screen.findByText(/Ainda não consta como confirmado/)).toBeVisible();
  });

  /* O telefone é exigido pela API (§11.3); pedir aqui evita recusar o envio. */
  it('pede o telefone que falta em vez de recusar o envio', async () => {
    stubFetch({}, { ...VERIFIED, phone: null });
    renderReview();

    expect(await screen.findByText('Qual é o seu WhatsApp?')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Solicitar reserva' })).not.toBeInTheDocument();
  });

  it('libera o envio depois de salvar o telefone', async () => {
    const user = userEvent.setup();
    const calls = stubFetch(
      { 'PATCH /api/me': () => jsonResponse(VERIFIED) },
      { ...VERIFIED, phone: null },
    );
    renderReview();

    await user.type(await screen.findByLabelText('WhatsApp'), '(11) 98888-0000');
    await user.click(screen.getByRole('button', { name: 'Salvar e continuar' }));

    expect(await screen.findByRole('button', { name: 'Solicitar reserva' })).toBeVisible();
    // O schema normaliza para dígitos, então o banco não guarda duas grafias do
    // mesmo número.
    expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({
      phone: '11988880000',
    });
  });

  it('recusa telefone malformado sem chamar a API', async () => {
    const user = userEvent.setup();
    const calls = stubFetch({}, { ...VERIFIED, phone: null });
    renderReview();

    await user.type(await screen.findByLabelText('WhatsApp'), '123');
    await user.click(screen.getByRole('button', { name: 'Salvar e continuar' }));

    expect(calls.some((call) => call.method === 'PATCH')).toBe(false);
  });
});

describe('envio do pedido', () => {
  it('manda o total do orçamento como expectedTotalCents', async () => {
    const user = userEvent.setup();
    const calls = stubFetch({ 'POST /api/bookings': () => jsonResponse(BOOKING, 201) });
    renderReview();

    await user.click(await screen.findByRole('button', { name: 'Solicitar reserva' }));

    await waitFor(() => {
      expect(calls.find((call) => call.url === '/api/bookings')?.body).toEqual({
        kind: 'VENUE',
        startDate: '2026-12-05',
        endDate: '2026-12-06',
        eventType: 'BABY_SHOWER',
        guestCount: 60,
        items: [{ itemId: PAINEL.id, quantity: 2 }],
        customerNotes: null,
        expectedTotalCents: QUOTE.totalCents,
      });
    });
  });

  it('mostra a confirmação com o prazo em data e hora', async () => {
    const user = userEvent.setup();
    stubFetch({
      'POST /api/bookings': () => jsonResponse(BOOKING, 201),
      'GET /api/bookings/b-1': () => jsonResponse(BOOKING),
    });
    renderReview();

    await user.click(await screen.findByRole('button', { name: 'Solicitar reserva' }));

    expect(await screen.findByText('Pedido enviado')).toBeVisible();
    // 21:00 UTC é 18:00 em São Paulo.
    expect(screen.getByText(/seguras até quinta-feira, 3 de dezembro às 18:00/)).toBeVisible();
    expect(screen.getByText('Aguardando confirmação')).toBeVisible();
  });

  it('oferece o WhatsApp da chácara com a mensagem pronta', async () => {
    const user = userEvent.setup();
    stubFetch({
      'POST /api/bookings': () => jsonResponse(BOOKING, 201),
      'GET /api/bookings/b-1': () => jsonResponse(BOOKING),
    });
    renderReview();

    await user.click(await screen.findByRole('button', { name: 'Solicitar reserva' }));

    const link = await screen.findByRole('link', { name: 'Agilizar pelo WhatsApp' });
    expect(link).toHaveAttribute('href', expect.stringContaining('https://wa.me/5511999990000'));
    expect(link).toHaveAttribute('href', expect.stringContaining('Ch%C3%A1%20de%20beb%C3%AA'));
  });

  /* §13.2: tratamento otimista é proibido; o rascunho só sai depois do 201. */
  it('esvazia o rascunho só depois da resposta de sucesso', async () => {
    const user = userEvent.setup();
    stubFetch({
      'POST /api/bookings': () => jsonResponse(BOOKING, 201),
      'GET /api/bookings/b-1': () => jsonResponse(BOOKING),
    });
    renderReview();

    await user.click(await screen.findByRole('button', { name: 'Solicitar reserva' }));
    await screen.findByText('Pedido enviado');

    expect(window.sessionStorage.getItem('chacara:booking-draft')).toBeNull();
  });

  it('mantém o rascunho quando o envio falha', async () => {
    const user = userEvent.setup();
    stubFetch({
      'POST /api/bookings': () =>
        errorResponse(422, 'TOO_MANY_PENDING', 'Você já tem 3 pedidos aguardando confirmação.'),
    });
    renderReview();

    await user.click(await screen.findByRole('button', { name: 'Solicitar reserva' }));

    expect(await screen.findByText('Você já tem 3 pedidos aguardando confirmação.')).toBeVisible();
    expect(window.sessionStorage.getItem('chacara:booking-draft')).not.toBeNull();
  });

  /*
   * §13.2: erro de envio volta ao passo que resolve. "A data foi reservada" na
   * tela de revisão deixaria o problema sem conserto.
   */
  it('volta ao passo das datas quando a data foi tomada no meio do caminho', async () => {
    const user = userEvent.setup();
    stubFetch({
      'POST /api/bookings': () =>
        errorResponse(409, 'DATE_UNAVAILABLE', 'O dia 05/12 acabou de ser reservado.'),
    });
    renderReview();

    await user.click(await screen.findByRole('button', { name: 'Solicitar reserva' }));

    expect(await screen.findByText('Quando é a festa?')).toBeVisible();
    expect(screen.getByText('O dia 05/12 acabou de ser reservado.')).toBeVisible();
  });

  it('volta ao passo dos itens quando o estoque acabou', async () => {
    const user = userEvent.setup();
    stubFetch({
      'POST /api/bookings': () =>
        errorResponse(409, 'STOCK_INSUFFICIENT', 'Só temos 1 unidade nessas datas.'),
    });
    renderReview();

    await user.click(await screen.findByRole('button', { name: 'Solicitar reserva' }));

    expect(await screen.findByText('Escolha o estilo da festa')).toBeVisible();
    expect(screen.getByText('Só temos 1 unidade nessas datas.')).toBeVisible();
  });

  /* §9.7: o cliente nunca paga um valor que não viu. */
  it('fica na revisão e mostra o novo valor quando o preço mudou', async () => {
    const user = userEvent.setup();
    let quoteCalls = 0;

    stubFetch({
      'POST /api/pricing/quote': () => {
        quoteCalls += 1;
        return jsonResponse(quoteCalls === 1 ? QUOTE : { ...QUOTE, totalCents: 395_000 });
      },
      'POST /api/bookings': () =>
        errorResponse(
          409,
          'PRICE_CHANGED',
          'O valor mudou de R$ 3.500,00 para R$ 3.950,00. Confira o novo total antes de enviar.',
        ),
    });
    renderReview();

    await user.click(await screen.findByRole('button', { name: 'Solicitar reserva' }));

    expect(await screen.findByText(/O valor mudou de/)).toBeVisible();
    // O orçamento é refeito, então o novo total aparece no resumo e no rodapé.
    expect(await screen.findAllByText('R$ 3.950,00')).toHaveLength(2);
    expect(screen.getByText('Confira seu pedido')).toBeVisible();
  });
});

/*
 * T32: o mesmo wizard manda o pedido só de decoração. O que o teste garante é o
 * contrato com a API — o tipo vai no orçamento e no pedido, e convidados vai
 * nulo mesmo que o rascunho guarde um número de quando a pessoa olhou a chácara.
 */
describe('reserva só de decoração', () => {
  const DECORATION_QUOTE: Quote = {
    ...QUOTE,
    days: [],
    dailyTotalCents: 0,
    totalCents: QUOTE.itemsTotalCents - QUOTE.discountTotalCents,
  };

  it('manda o pedido com o tipo, um dia e sem convidados', async () => {
    const user = userEvent.setup();
    seedDraft({ kind: 'DECORATION', endDate: '2026-12-05', guestCount: 60 });
    const calls = stubFetch({
      'POST /api/pricing/quote': () => jsonResponse(DECORATION_QUOTE),
      'POST /api/bookings': () =>
        jsonResponse(
          {
            ...BOOKING,
            kind: 'DECORATION',
            endDate: '2026-12-05',
            guestCount: null,
            days: [],
            dailyTotalCents: 0,
          },
          201,
        ),
    });
    renderReview();

    // Sem diária na decoração: o bloco some, em vez de mostrar R$ 0,00.
    expect(await screen.findByText('Valores')).toBeVisible();
    expect(screen.queryByText(/Diária/)).not.toBeInTheDocument();
    expect(calls.find((call) => call.url === '/api/pricing/quote')?.body).toMatchObject({
      kind: 'DECORATION',
    });

    await user.click(screen.getByRole('button', { name: 'Solicitar reserva' }));

    await waitFor(() => {
      expect(calls.find((call) => call.url === '/api/bookings')?.body).toEqual({
        kind: 'DECORATION',
        startDate: '2026-12-05',
        endDate: '2026-12-05',
        eventType: 'BABY_SHOWER',
        guestCount: null,
        items: [{ itemId: PAINEL.id, quantity: 2 }],
        customerNotes: null,
        expectedTotalCents: DECORATION_QUOTE.totalCents,
      });
    });
  });
});
