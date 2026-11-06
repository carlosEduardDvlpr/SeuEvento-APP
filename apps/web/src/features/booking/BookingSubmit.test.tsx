import type {
  Address,
  Booking,
  CatalogItem,
  PublicVenue,
  Quote,
  SessionUser,
} from '@chacara/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorResponse, jsonResponse, renderWithProviders } from '../../../test/helpers/render';
import { BookingWizard } from './BookingWizard';
import { EMPTY_DRAFT, type BookingDraft, saveDraft } from './draft';

/**
 * Revisão, envio e confirmação (§13.2).
 *
 * Os testes entram pela borda: o que a API responde e o que a pessoa vê. É aqui
 * que moram as duas garantias mais importantes do fluxo: o total exibido é
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
  priceCents: 40_000,
  venuePriceCents: 30_000,
  stock: 3,
  assemblyNotes: null,
  sortOrder: 1,
  category: { id: 'c1', name: 'Painéis', sortOrder: 1 },
  themeIds: [],
};

/** Orçamento da chácara com a decoração pelo preço com a chácara. */
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
      quantity: 1,
      unitPriceCents: 30_000,
      totalCents: 30_000,
    },
  ],
  itemsTotalCents: 30_000,
  combos: [],
  discountTotalCents: 0,
  totalCents: 360_000,
};

/** A decoração sozinha: sem diária, pelo preço avulso. */
const DECORATION_QUOTE: Quote = {
  ...QUOTE,
  days: [],
  dailyTotalCents: 0,
  lines: [{ ...QUOTE.lines[0]!, unitPriceCents: 40_000, totalCents: 40_000 }],
  itemsTotalCents: 40_000,
  totalCents: 40_000,
};

const BOOKING: Booking = {
  id: 'b-1',
  kind: 'VENUE',
  startDate: '2026-12-05',
  endDate: '2026-12-06',
  guestCount: 60,
  status: 'PENDING',
  holdExpiresAt: '2026-12-03T21:00:00.000Z',
  canCancel: true,
  cancelUntil: null,
  days: QUOTE.days,
  dailyTotalCents: QUOTE.dailyTotalCents,
  // A reserva gravada traz a foto do catálogo em cada linha (§11.3).
  items: QUOTE.lines.map((line) => ({ ...line, imageUrl: null })),
  itemsTotalCents: QUOTE.itemsTotalCents,
  combos: [],
  discountTotalCents: 0,
  totalCents: QUOTE.totalCents,
  fulfillment: null,
  deliveryAddress: null,
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
  address: null,
  hasPassword: true,
};

const ADDRESS: Address = {
  cep: '12954000',
  street: 'Rua das Orquídeas',
  number: '265',
  complement: null,
  district: 'Chácaras Fernão Dias',
  city: 'Atibaia',
  state: 'SP',
};

/** O que o ViaCEP responde para a Praça da Sé. */
const VIACEP_SE = {
  cep: '01001-000',
  logradouro: 'Praça da Sé',
  complemento: 'lado ímpar',
  bairro: 'Sé',
  localidade: 'São Paulo',
  uf: 'SP',
};

type Call = { url: string; method: string; body: unknown };
type Handler = (call: Call) => Response;

/**
 * `fetch` de mentira com rotas por `"MÉTODO /caminho"` (ou pela URL inteira,
 * que é como a busca no ViaCEP, fora da nossa API, é respondida).
 *
 * A sessão é aberta pelo `POST /auth/refresh`, que é o que o `AuthProvider` chama
 * ao montar: é assim que o teste entra logado sem simular a tela de login.
 */
function stubFetch(routes: Record<string, Handler> = {}, user: SessionUser | null = VERIFIED) {
  const calls: Call[] = [];

  const base: Record<string, Handler> = {
    'GET /api/public/venue': () => jsonResponse(VENUE),
    'GET /api/categories': () => jsonResponse([]),
    'GET /api/items': () => jsonResponse([PAINEL]),
    'GET /api/items/availability': () =>
      jsonResponse({ items: [{ itemId: PAINEL.id, freeStock: 3 }] }),
    'GET /api/availability': () => jsonResponse({ days: [] }),
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

    return Promise.resolve(handler ? handler(call) : jsonResponse([]));
  });

  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

/** O `PATCH /me` de mentira devolve o usuário com o que foi pedido. */
function patchMe(user: SessionUser = VERIFIED): Handler {
  return (call) => jsonResponse({ ...user, ...(call.body as Partial<SessionUser>) });
}

/** Chave do pedido guardado no `sessionStorage`. */
const DRAFT_KEY = 'chacara:booking-draft';

function storedDraft(): BookingDraft | null {
  const raw = window.sessionStorage.getItem(DRAFT_KEY);
  return raw ? (JSON.parse(raw) as BookingDraft) : null;
}

/**
 * Pedido completo e guardado, como o de quem chegou à revisão: é só a partir
 * dela que o wizard guarda alguma coisa, e é o que a volta do login encontra.
 */
function seedDraft(draft: Partial<BookingDraft> = {}) {
  saveDraft({
    ...EMPTY_DRAFT,
    startDate: '2026-12-05',
    endDate: '2026-12-06',
    guestCount: 60,
    itemId: PAINEL.id,
    ...draft,
  });
}

/** Pedido só de decoração, de um dia, ainda sem retirada nem entrega. */
function seedDecoration(draft: Partial<BookingDraft> = {}) {
  seedDraft({ kind: 'DECORATION', endDate: '2026-12-05', guestCount: null, ...draft });
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
  // Desfaz o `spyOn` do `scrollTo` do caso da confirmação.
  vi.restoreAllMocks();
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
   * §13.2: o front nunca soma preço para exibir o total oficial. O que o teste
   * garante é que o número exibido é o `totalCents` que veio na resposta.
   */
  it('exibe o total que o servidor calculou', async () => {
    stubFetch({
      'POST /api/pricing/quote': () => jsonResponse({ ...QUOTE, totalCents: 299_900 }),
    });
    renderReview();

    // Duas vezes: no resumo e no rodapé, que na revisão mostra o total oficial.
    expect(await screen.findAllByText('R$ 2.999,00')).toHaveLength(2);
  });

  it('pede o orçamento com as datas e a decoração, uma vez', async () => {
    const calls = stubFetch();
    renderReview();

    await screen.findByText('Valores');

    expect(calls.find((call) => call.url === '/api/pricing/quote')?.body).toEqual({
      kind: 'VENUE',
      startDate: '2026-12-05',
      endDate: '2026-12-06',
      items: [{ itemId: PAINEL.id, quantity: 1 }],
    });
  });

  /* O valor da linha é o do servidor; a etiqueta explica por que é menor que o da vitrine. */
  it('marca a decoração que saiu pelo preço com a chácara', async () => {
    stubFetch();
    renderReview();

    const line = (await screen.findByText('preço com a chácara')).closest('li')!;

    expect(within(line).getByText(PAINEL.name)).toBeVisible();
    expect(within(line).getByText('R$ 300,00')).toBeVisible();
  });

  /*
   * A foto vem do catálogo, e não do orçamento: é ela que deixa a pessoa
   * reconhecer a peça, porque o nome no catálogo costuma ser genérico.
   */
  it('mostra a foto da decoração do pedido', async () => {
    stubFetch({
      'GET /api/items': () => jsonResponse([{ ...PAINEL, imageUrl: '/catalogo/paineis/1.jpg' }]),
    });
    renderReview();

    const line = (await screen.findByText(PAINEL.name)).closest('li')!;

    await waitFor(() => {
      expect(line.querySelector('img')).toHaveAttribute('src', '/catalogo/paineis/1.jpg');
    });
    // Decorativa: o nome já está do lado, e o leitor de tela não repete.
    expect(line.querySelector('img')).toHaveAttribute('alt', '');
  });

  it('põe o ícone no lugar da foto quando a decoração não tem uma', async () => {
    stubFetch();
    renderReview();

    const line = (await screen.findByText(PAINEL.name)).closest('li')!;

    expect(line.querySelector('img')).toBeNull();
    expect(line.querySelector('svg')).not.toBeNull();
  });

  it('diz que é só a chácara quando não há decoração no pedido', async () => {
    stubFetch({
      'POST /api/pricing/quote': () =>
        jsonResponse({ ...QUOTE, lines: [], itemsTotalCents: 0, totalCents: 330_000 }),
    });
    seedDraft({ itemId: null });
    renderReview();

    expect(await screen.findByText(/Sem decoração neste pedido/)).toBeVisible();
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
    expect(screen.getByText('Valores')).toBeVisible();
  });

  it('avisa quando a decoração saiu para outra festa nessas datas', async () => {
    stubFetch({
      'POST /api/pricing/quote': () =>
        jsonResponse({
          ...QUOTE,
          available: false,
          issues: [{ code: 'STOCK_INSUFFICIENT', itemId: PAINEL.id, available: 0 }],
        }),
    });
    renderReview();

    expect(
      await screen.findByText(
        '“Painel de balões arco-íris” não está mais livre nessas datas. Volte à decoração e escolha outra, ou siga sem decoração.',
      ),
    ).toBeVisible();
  });

  it('mostra o prazo do pedido e o prazo de cancelamento antes de enviar', async () => {
    stubFetch();
    renderReview();

    expect(await screen.findByText(/em breve entraremos em contato com você/)).toBeVisible();
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

    await waitFor(() => expect(storedDraft()?.customerNotes).toBe('Chegamos às 14h.'));
  });
});

/*
 * O pedido não é carrinho (§12.2): só fica guardado a partir da revisão, que é
 * de onde quem não está logado sai para entrar ou se cadastrar, e só até ser
 * enviado. Os casos entram por um link da landing, que começa um pedido novo e
 * descarta o que o `beforeEach` deixou guardado.
 */
describe('pedido guardado a partir da revisão', () => {
  /** Do tipo à revisão, passo a passo, com a data que veio no link. */
  async function walkToReview(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByText('O que você quer reservar?');
    await user.click(screen.getByRole('button', { name: /Continuar/ }));

    await screen.findByText('5 de dezembro de 2026');
    await user.click(screen.getByRole('button', { name: /Continuar/ }));

    await user.type(await screen.findByLabelText('Número de convidados'), '40');
    await user.click(screen.getByRole('button', { name: /Continuar/ }));

    await screen.findByRole('radio', { name: 'Sem decoração' });
    expect(storedDraft()).toBeNull();

    await user.click(screen.getByRole('button', { name: /Continuar/ }));
  }

  it('guarda o pedido ao chegar à revisão, e não antes', async () => {
    const user = userEvent.setup();
    stubFetch({}, null);
    renderWithProviders(<BookingWizard />, { route: '/reservar?data=2026-12-05' });

    await walkToReview(user);

    expect(await screen.findByText('Falta só entrar')).toBeVisible();
    await waitFor(() => {
      expect(storedDraft()).toMatchObject({
        startDate: '2026-12-05',
        endDate: '2026-12-05',
        guestCount: 40,
        itemId: null,
      });
    });
  });

  it('segue guardando quando a pessoa volta da revisão para ajustar', async () => {
    const user = userEvent.setup();
    stubFetch({}, null);
    renderWithProviders(<BookingWizard />, { route: '/reservar?data=2026-12-05' });

    await walkToReview(user);
    await screen.findByText('Falta só entrar');

    await user.click(screen.getByRole('button', { name: /Voltar/ }));
    await user.click(await screen.findByRole('radio', { name: PAINEL.name }));

    await waitFor(() => expect(storedDraft()?.itemId).toBe(PAINEL.id));
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
    const calls = stubFetch({ 'PATCH /api/me': patchMe() }, { ...VERIFIED, phone: null });
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

/*
 * §9.12: na decoração sozinha, a pessoa escolhe retirar na chácara ou receber
 * no endereço do perfil. A taxa de entrega é combinada e não entra no total.
 */
describe('retirada ou entrega da decoração', () => {
  function stubDecoration(routes: Record<string, Handler> = {}, user: SessionUser = VERIFIED) {
    return stubFetch(
      { 'POST /api/pricing/quote': () => jsonResponse(DECORATION_QUOTE), ...routes },
      user,
    );
  }

  it('pede para escolher antes de enviar, sem chamar a API', async () => {
    const user = userEvent.setup();
    seedDecoration();
    const calls = stubDecoration();
    renderReview();

    expect(await screen.findByText('Como a decoração chega à festa?')).toBeVisible();
    expect(screen.getByRole('radio', { name: /Retirada na chácara/ })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /Entrega no endereço/ })).not.toBeChecked();

    await user.click(await screen.findByRole('button', { name: 'Solicitar reserva' }));

    // Na escolha e junto do botão, que é onde a pessoa está olhando.
    expect(
      await screen.findAllByText(
        'Escolha se você retira a decoração na chácara ou se ela vai até você.',
      ),
    ).toHaveLength(2);
    expect(calls.some((call) => call.url === '/api/bookings')).toBe(false);
  });

  it('a retirada não pede endereço e vai no pedido', async () => {
    const user = userEvent.setup();
    seedDecoration();
    const calls = stubDecoration({ 'POST /api/bookings': () => jsonResponse(BOOKING, 201) });
    renderReview();

    await user.click(await screen.findByRole('radio', { name: /Retirada na chácara/ }));
    await user.click(screen.getByRole('button', { name: 'Solicitar reserva' }));

    await waitFor(() => {
      expect(calls.find((call) => call.url === '/api/bookings')?.body).toMatchObject({
        kind: 'DECORATION',
        fulfillment: 'PICKUP',
      });
    });
  });

  it('na entrega sem endereço, pede o endereço no lugar do envio', async () => {
    const user = userEvent.setup();
    seedDecoration({ fulfillment: 'DELIVERY' });
    stubDecoration();
    renderReview();

    expect(await screen.findByText('Para onde vai a decoração?')).toBeVisible();
    expect(screen.getByText(/Falta o endereço de entrega/)).toBeVisible();
    expect(screen.getByText('A taxa de entrega é combinada com a chácara.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Solicitar reserva' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cadastrar endereço' }));
    expect(await screen.findByRole('dialog', { name: 'Endereço de entrega' })).toBeVisible();
  });

  it('libera o envio depois de cadastrar o endereço pelo CEP', async () => {
    const user = userEvent.setup();
    seedDecoration({ fulfillment: 'DELIVERY' });
    const calls = stubDecoration({
      'GET https://viacep.com.br/ws/01001000/json/': () => jsonResponse(VIACEP_SE),
      'PATCH /api/me': patchMe(),
    });
    renderReview();

    await user.click(await screen.findByRole('button', { name: 'Cadastrar endereço' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Endereço de entrega' }));

    await user.type(dialog.getByLabelText('CEP'), '01001000');
    await waitFor(() => expect(dialog.getByLabelText('Rua')).toHaveValue('Praça da Sé'));
    await user.type(dialog.getByLabelText('Número'), '100');
    await user.click(dialog.getByRole('button', { name: 'Salvar endereço' }));

    expect(await screen.findByRole('button', { name: 'Solicitar reserva' })).toBeVisible();
    expect(screen.getByText('Praça da Sé, 100 – Sé, São Paulo/SP – CEP 01001-000')).toBeVisible();
    expect(calls.find((call) => call.method === 'PATCH')?.body).toMatchObject({
      address: { cep: '01001000', number: '100', state: 'SP' },
    });
  });

  it('mostra o endereço do perfil e manda a entrega no pedido', async () => {
    const user = userEvent.setup();
    seedDecoration({ fulfillment: 'DELIVERY' });
    const calls = stubDecoration(
      { 'POST /api/bookings': () => jsonResponse(BOOKING, 201) },
      { ...VERIFIED, address: ADDRESS },
    );
    renderReview();

    expect(
      await screen.findByText(
        'Rua das Orquídeas, 265 – Chácaras Fernão Dias, Atibaia/SP – CEP 12954-000',
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Alterar endereço' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Solicitar reserva' }));

    await waitFor(() => {
      expect(calls.find((call) => call.url === '/api/bookings')?.body).toMatchObject({
        fulfillment: 'DELIVERY',
      });
    });
  });

  it('a chácara não pergunta como a decoração chega', async () => {
    stubFetch();
    renderReview();

    await screen.findByText('Valores');
    expect(screen.queryByText('Como a decoração chega à festa?')).not.toBeInTheDocument();
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
        guestCount: 60,
        items: [{ itemId: PAINEL.id, quantity: 1 }],
        fulfillment: null,
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
    expect(link).toHaveAttribute('href', expect.stringContaining('(60%20pessoas)'));
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

    expect(storedDraft()).toBeNull();
  });

  /* O botão de enviar fica no fim da revisão; a confirmação não pode abrir lá embaixo. */
  it('abre a confirmação do topo', async () => {
    const user = userEvent.setup();
    const scrollTo = vi.spyOn(window, 'scrollTo');
    stubFetch({
      'POST /api/bookings': () => jsonResponse(BOOKING, 201),
      'GET /api/bookings/b-1': () => jsonResponse(BOOKING),
    });
    renderReview();

    await user.click(await screen.findByRole('button', { name: 'Solicitar reserva' }));
    await screen.findByText('Pedido enviado');

    expect(scrollTo).toHaveBeenCalledWith(0, 0);
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
    expect(storedDraft()).not.toBeNull();
  });

  /*
   * §13.2: erro de envio volta ao passo que resolve. "A data foi reservada" na
   * tela de revisão deixaria o problema sem conserto.
   */
  it('volta ao passo da data quando a data foi tomada no meio do caminho', async () => {
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

  it('volta ao passo da decoração quando ela saiu para outra festa', async () => {
    const user = userEvent.setup();
    stubFetch({
      'POST /api/bookings': () =>
        errorResponse(
          409,
          'STOCK_INSUFFICIENT',
          'Esta decoração não está mais livre nessas datas.',
        ),
    });
    renderReview();

    await user.click(await screen.findByRole('button', { name: 'Solicitar reserva' }));

    expect(await screen.findByText('Quer uma decoração?')).toBeVisible();
    expect(screen.getByText('Esta decoração não está mais livre nessas datas.')).toBeVisible();
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
          'O valor mudou de R$ 3.600,00 para R$ 3.950,00. Confira o novo total antes de enviar.',
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
 * contrato com a API: o tipo vai no orçamento e no pedido, e convidados vai
 * nulo mesmo que o rascunho guarde um número de quando a pessoa olhou a chácara.
 */
describe('reserva só de decoração', () => {
  it('manda o pedido com o tipo, um dia, a retirada e sem convidados', async () => {
    const user = userEvent.setup();
    seedDecoration({ guestCount: 60, fulfillment: 'PICKUP' });
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
            fulfillment: 'PICKUP',
          },
          201,
        ),
    });
    renderReview();

    // Sem diária na decoração: o bloco some, em vez de mostrar R$ 0,00.
    expect(await screen.findByText('Valores')).toBeVisible();
    expect(screen.queryByText(/Diária/)).not.toBeInTheDocument();
    // O preço avulso, sem a etiqueta da chácara.
    expect(screen.queryByText('preço com a chácara')).not.toBeInTheDocument();
    expect(calls.find((call) => call.url === '/api/pricing/quote')?.body).toMatchObject({
      kind: 'DECORATION',
    });

    await user.click(screen.getByRole('button', { name: 'Solicitar reserva' }));

    await waitFor(() => {
      expect(calls.find((call) => call.url === '/api/bookings')?.body).toEqual({
        kind: 'DECORATION',
        startDate: '2026-12-05',
        endDate: '2026-12-05',
        guestCount: null,
        items: [{ itemId: PAINEL.id, quantity: 1 }],
        fulfillment: 'PICKUP',
        customerNotes: null,
        expectedTotalCents: DECORATION_QUOTE.totalCents,
      });
    });
  });
});
