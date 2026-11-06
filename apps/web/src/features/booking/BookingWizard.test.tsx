import type { CatalogItem, PublicVenue } from '@chacara/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderWithProviders } from '../../../test/helpers/render';
import { BookingWizard } from './BookingWizard';
import { type BookingDraft, EMPTY_DRAFT, saveDraft } from './draft';

/**
 * Os passos antes da revisão (§13.2), testados pela borda: rota, requisições e o
 * que a pessoa vê. A revisão e o envio estão em `BookingSubmit.test.tsx`, que é
 * onde há sessão para a revisão abrir.
 *
 * O relógio é fixado porque o calendário abre no mês corrente e pede a
 * disponibilidade desse período: sem data fixa, o teste mudaria de
 * comportamento conforme o dia em que roda.
 */

const VENUE: PublicVenue = {
  name: 'Chácara Seu Evento',
  maxGuests: 120,
  checkInTime: '08:00',
  checkOutTime: '22:00',
  whatsapp: null,
  address: null,
  mapsUrl: null,
  houseRules: null,
  minDays: 1,
  maxDays: 3,
  minLeadDays: 2,
  freeCancelUntilDays: 7,
  holdHours: 48,
};

const PAINEIS = { id: 'c-paineis', name: 'Painéis', sortOrder: 1 };
const MESAS = { id: 'c-mesas', name: 'Mesas', sortOrder: 2 };

/* Ids no formato de uuid: é o que o `?item=` da landing aceita. */
const PAINEL: CatalogItem = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Painel de balões arco-íris',
  description: 'Painel redondo com balões em degradê.',
  imageUrl: null,
  priceCents: 40_000,
  venuePriceCents: 30_000,
  stock: 2,
  assemblyNotes: 'Encaixe os balões de fora para dentro.',
  sortOrder: 1,
  category: PAINEIS,
  themeIds: [],
};

/** O mesmo preço com e sem a chácara: "sem promoção". */
const MESA: CatalogItem = {
  id: '00000000-0000-4000-8000-000000000002',
  name: 'Mesa de madeira rústica',
  description: null,
  imageUrl: null,
  priceCents: 25_000,
  venuePriceCents: 25_000,
  stock: 1,
  assemblyNotes: null,
  sortOrder: 2,
  category: MESAS,
  themeIds: [],
};

const SEM_ESTOQUE: CatalogItem = {
  ...MESA,
  id: '00000000-0000-4000-8000-000000000003',
  name: 'Arco de flores secas',
  stock: 0,
};

/*
 * Nome acessível do dia no calendário, como o `react-day-picker` o monta em pt-BR.
 * Ancorado nas duas pontas: sem o `$`, "9 de dezembro" casaria também com 19 e 29.
 */
const DIA_9 = /^quarta-feira, 9 de dezembro de 2026$/;
const DIA_10 = /^quinta-feira, 10 de dezembro de 2026$/;

function nextDay(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

type Stub = {
  items?: CatalogItem[];
  /** Dias ocupados na agenda da chácara. */
  booked?: string[];
  /** Dias em que a decoração escolhida já saiu para outra festa. */
  itemBooked?: string[];
  /** Dias em que a decoração está fechada. */
  closed?: string[];
  /** Estoque livre de cada decoração nas datas; sem a entrada, o estoque dela. */
  freeStock?: Record<string, number>;
};

/**
 * `fetch` de mentira. A agenda responde só o período pedido, como a API: o
 * passo da data confere o intervalo escolhido com uma consulta própria, e uma
 * resposta com o mês inteiro faria qualquer intervalo parecer ocupado.
 */
function stubFetch({
  items = [PAINEL, MESA, SEM_ESTOQUE],
  booked = ['2026-12-10'],
  itemBooked = [],
  closed = [],
  freeStock = {},
}: Stub = {}) {
  const urls: string[] = [];

  function agenda(url: URL) {
    const kind = url.searchParams.get('kind') ?? 'VENUE';
    const itemId = url.searchParams.get('itemId');
    const days: { date: string; status: 'free' | 'booked' | 'blocked' }[] = [];

    for (let date = url.searchParams.get('from')!; date <= url.searchParams.get('to')!;) {
      const status =
        kind === 'DECORATION' && closed.includes(date)
          ? 'blocked'
          : (kind === 'VENUE' ? booked : itemId ? itemBooked : []).includes(date)
            ? 'booked'
            : 'free';

      days.push({ date, status });
      date = nextDay(date);
    }

    return { days };
  }

  vi.stubGlobal(
    'fetch',
    vi.fn((input: string) => {
      urls.push(input);
      const url = new URL(input, 'http://localhost');

      const body =
        url.pathname === '/api/public/venue'
          ? VENUE
          : url.pathname === '/api/categories'
            ? [PAINEIS, MESAS]
            : url.pathname === '/api/items'
              ? items
              : url.pathname === '/api/items/availability'
                ? {
                    items: items
                      .filter((item) => item.stock > 0)
                      .map((item) => ({
                        itemId: item.id,
                        freeStock: freeStock[item.id] ?? item.stock,
                      })),
                  }
                : url.pathname === '/api/availability'
                  ? agenda(url)
                  : [];

      return Promise.resolve(jsonResponse(body));
    }),
  );

  return urls;
}

function renderWizard(route = '/reservar') {
  return renderWithProviders(<BookingWizard />, { route, withAuth: false });
}

/** Chave do pedido guardado no `sessionStorage`. */
const DRAFT_KEY = 'chacara:booking-draft';

function storedDraft(): BookingDraft | null {
  const raw = window.sessionStorage.getItem(DRAFT_KEY);
  return raw ? (JSON.parse(raw) as BookingDraft) : null;
}

/**
 * Semeia o pedido guardado, como se a pessoa já tivesse chegado à revisão e
 * voltado (é só a partir dela que o wizard guarda alguma coisa).
 */
function seedDraft(draft: Partial<BookingDraft> = {}) {
  saveDraft({
    ...EMPTY_DRAFT,
    startDate: '2026-12-05',
    endDate: '2026-12-06',
    guestCount: 60,
    ...draft,
  });
}

/** O cartão da decoração na lista, pelo nome do rádio. */
function decorationCard(name: string) {
  return within(screen.getByRole('radio', { name }).closest('li')!);
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-12-01T12:00:00.000Z'));
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  // Desfaz o `spyOn` do `scrollTo` no caso da rolagem.
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

function setupUser() {
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
}

describe('passo do tipo', () => {
  it('abre perguntando o que reservar, com a chácara escolhida', async () => {
    stubFetch();
    renderWizard();

    expect(await screen.findByText('O que você quer reservar?')).toBeVisible();
    expect(screen.getByRole('radio', { name: /A chácara/ })).toBeChecked();
  });

  it('segue para a data da chácara', async () => {
    const user = setupUser();
    stubFetch();
    renderWizard();

    await user.click(await screen.findByRole('button', { name: /Continuar/ }));

    expect(await screen.findByText('Quando é a festa?')).toBeVisible();
  });

  /* T32: a decoração é um dia só e não recebe convidados. */
  it('na decoração, pede um dia e pula os convidados', async () => {
    const user = setupUser();
    stubFetch();
    renderWizard();

    await user.click(await screen.findByRole('radio', { name: /Só a decoração/ }));
    await user.click(screen.getByRole('button', { name: /Continuar/ }));
    expect(await screen.findByText('Qual é o dia da festa?')).toBeVisible();

    await user.click(await screen.findByRole('button', { name: DIA_9 }));
    await user.click(screen.getByRole('button', { name: /Continuar/ }));

    expect(await screen.findByText('Escolha a decoração')).toBeVisible();
    expect(screen.queryByText('Quantas pessoas?')).not.toBeInTheDocument();
  });

  /* Até a revisão, nada de resumo no rodapé: só a navegação (novembro de 2026). */
  it('o rodapé dos passos só tem Voltar e Continuar', async () => {
    stubFetch();
    seedDraft({ itemId: PAINEL.id });
    renderWizard('/reservar?step=decoracao');

    await screen.findByText('Quer uma decoração?');

    const footer = within(screen.getByRole('contentinfo'));
    expect(footer.getByRole('button', { name: /Voltar/ })).toBeVisible();
    expect(footer.getByRole('button', { name: /Continuar/ })).toBeVisible();
    expect(footer.queryByText(/Total|Itens escolhidos|R\$/)).not.toBeInTheDocument();
  });

  it('volta um passo com o Voltar', async () => {
    const user = setupUser();
    stubFetch();
    renderWizard('/reservar?step=data');

    await screen.findByText('Quando é a festa?');
    await user.click(screen.getByRole('button', { name: /Voltar/ }));

    expect(await screen.findByText('O que você quer reservar?')).toBeVisible();
  });
});

/*
 * §13.1: a escolha feita na landing abre o wizard "já preenchido". A aplicação
 * acontece na inicialização do pedido, não num efeito, para o calendário não
 * aparecer vazio por um instante.
 *
 * E cada escolha começa um pedido **novo** (§12.2): o pedido não é carrinho, e
 * o que sobrou de outra visita não soma com o clique de agora.
 */
describe('escolha vinda da landing', () => {
  it('aplica a data do link como reserva de um dia', async () => {
    stubFetch();
    renderWizard('/reservar?step=data&data=2026-12-09');

    expect(await screen.findByText('9 de dezembro de 2026')).toBeVisible();
    expect(screen.getByText('(1 dia)')).toBeVisible();
  });

  it('começa um pedido novo, sem o que estava guardado', async () => {
    stubFetch();
    seedDraft();
    renderWizard('/reservar?step=convidados&data=2026-12-09');

    // Os convidados eram do pedido guardado, e ficaram com ele.
    expect(await screen.findByLabelText('Número de convidados')).toHaveValue(null);

    // E o pedido antigo não volta depois pelo "Reservar" do cabeçalho.
    await waitFor(() => expect(storedDraft()).toBeNull());
  });

  it('ignora data fora do formato em vez de quebrar', async () => {
    stubFetch();
    renderWizard('/reservar?step=data&data=ontem');

    await screen.findByText('Quando é a festa?');
    expect(screen.queryByText('(1 dia)')).not.toBeInTheDocument();
  });

  /*
   * Antes da revisão, o pedido vive só na tela. A limpeza do parâmetro da URL
   * não é verificável aqui: o `MemoryRouter` não mexe em `window.location`.
   */
  it('não guarda o pedido antes da revisão', async () => {
    stubFetch();
    renderWizard('/reservar?step=data&data=2026-12-09');

    await screen.findByText('9 de dezembro de 2026');
    await waitFor(() => expect(storedDraft()).toBeNull());
  });

  /*
   * Pedido do dono: quem clica numa decoração da landing está alugando a
   * decoração. O wizard pula o tipo e abre no dia, com a agenda dela.
   */
  it('abre no dia da decoração da vitrine, sem o passo do tipo', async () => {
    const urls = stubFetch();
    renderWizard(`/reservar?item=${PAINEL.id}`);

    expect(await screen.findByText('Qual é o dia da festa?')).toBeVisible();
    // É o primeiro passo deste pedido: não há para onde voltar.
    expect(screen.queryByRole('button', { name: /Voltar/ })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(urls).toContain(
        `/api/availability?from=2026-12-01&to=2027-01-31&kind=DECORATION&itemId=${PAINEL.id}`,
      );
    });
  });

  it('o calendário tira os dias em que a decoração já saiu para outra festa', async () => {
    // O dia 10 ocupado é da chácara, e não conta para a decoração.
    stubFetch({ itemBooked: ['2026-12-09'] });
    renderWizard(`/reservar?item=${PAINEL.id}`);

    expect(await screen.findByRole('button', { name: DIA_9 })).toBeDisabled();
    expect(screen.getByRole('button', { name: DIA_10 })).toBeEnabled();
  });

  it('chega à decoração com a da vitrine escolhida, sem a que estava guardada', async () => {
    const user = setupUser();
    stubFetch();
    seedDraft({ kind: 'DECORATION', endDate: '2026-12-05', itemId: MESA.id });
    renderWizard(`/reservar?item=${PAINEL.id}`);

    await user.click(await screen.findByRole('button', { name: DIA_9 }));
    await user.click(screen.getByRole('button', { name: /Continuar/ }));

    expect(await screen.findByRole('radio', { name: PAINEL.name })).toBeChecked();
    expect(screen.getByRole('radio', { name: MESA.name })).not.toBeChecked();
  });

  it('ignora decoração fora do formato em vez de quebrar', async () => {
    stubFetch();
    renderWizard('/reservar?item=nao-e-um-id');

    expect(await screen.findByText('O que você quer reservar?')).toBeVisible();
    expect(screen.getByRole('radio', { name: /A chácara/ })).toBeChecked();
  });
});

describe('passo da data', () => {
  it('pede a agenda do mês visível e do seguinte', async () => {
    const urls = stubFetch();
    renderWizard('/reservar?step=data');

    await screen.findByText('Quando é a festa?');

    await waitFor(() => {
      expect(urls).toContain('/api/availability?from=2026-12-01&to=2027-01-31');
    });
  });

  it('bloqueia o avanço e aponta o que falta sem a data', async () => {
    const user = setupUser();
    stubFetch();
    renderWizard('/reservar?step=data');

    await screen.findByText('Quando é a festa?');
    await user.click(screen.getByRole('button', { name: /Continuar/ }));

    expect(await screen.findByText('Escolha as datas da festa.')).toBeVisible();
    expect(screen.getByText('Quando é a festa?')).toBeVisible();
  });

  /*
   * O nome acessível do dia é a data inteira, e não o número: é o que o leitor
   * de tela anuncia, e é o que distingue os dois meses visíveis ao mesmo tempo.
   */
  it('mostra o dia ocupado como indisponível no calendário', async () => {
    stubFetch();
    renderWizard('/reservar?step=data');

    expect(await screen.findByRole('button', { name: DIA_10 })).toBeDisabled();
    expect(screen.getByRole('button', { name: DIA_9 })).toBeEnabled();
  });

  it('trata clique único como reserva de um dia', async () => {
    const user = setupUser();
    stubFetch();
    renderWizard('/reservar?step=data');

    await user.click(await screen.findByRole('button', { name: DIA_9 }));

    expect(await screen.findByText('9 de dezembro de 2026')).toBeVisible();
    expect(screen.getByText('(1 dia)')).toBeVisible();
  });

  /*
   * §13.2: dizer **qual** dia atrapalha, não só recusar a escolha. O
   * `react-day-picker` desabilita dia a dia, mas não impede um intervalo que
   * pule por cima de um dia ocupado.
   */
  it('diz qual dia do intervalo está indisponível e não deixa seguir', async () => {
    const user = setupUser();
    const urls = stubFetch();
    seedDraft({ startDate: '2026-12-09', endDate: '2026-12-11' });
    renderWizard('/reservar?step=data');

    expect(await screen.findByText(/10 de dezembro de 2026 não está disponível/)).toBeVisible();
    // A conferência é da agenda exata do intervalo, não dos meses na tela.
    expect(urls).toContain('/api/availability?from=2026-12-09&to=2026-12-11');

    await user.click(screen.getByRole('button', { name: /Continuar/ }));
    expect(screen.queryByText('Quantas pessoas?')).not.toBeInTheDocument();
  });

  it('avisa quando o intervalo passa do máximo de dias e não deixa seguir', async () => {
    const user = setupUser();
    stubFetch();
    seedDraft({ startDate: '2026-12-12', endDate: '2026-12-17' });
    renderWizard('/reservar?step=data');

    expect(await screen.findByText(/no máximo 3 dias seguidos/)).toBeVisible();

    await user.click(screen.getByRole('button', { name: /Continuar/ }));
    expect(screen.queryByText('Quantas pessoas?')).not.toBeInTheDocument();
  });

  it('avança para os convidados quando a data serve', async () => {
    const user = setupUser();
    stubFetch();
    seedDraft();
    renderWizard('/reservar?step=data');

    expect(await screen.findByText(/5 a 6 de dezembro de 2026/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Continuar/ }));

    expect(await screen.findByText('Quantas pessoas?')).toBeVisible();
  });
});

describe('passo dos convidados', () => {
  it('pede o número quando a pessoa tenta seguir sem ele', async () => {
    const user = setupUser();
    stubFetch();
    seedDraft({ guestCount: null });
    renderWizard('/reservar?step=convidados');

    await user.click(await screen.findByRole('button', { name: /Continuar/ }));

    expect(await screen.findByText('Informe quantas pessoas são esperadas.')).toBeVisible();
    expect(screen.getByText('Quantas pessoas?')).toBeVisible();
  });

  /* O teto é o `maxGuests` das configurações, e o aviso não espera o clique. */
  it('trava no máximo de convidados da chácara', async () => {
    const user = setupUser();
    stubFetch();
    seedDraft({ guestCount: null });
    renderWizard('/reservar?step=convidados');

    await user.type(await screen.findByLabelText('Número de convidados'), '150');

    expect(
      await screen.findByText('São mais pessoas do que a chácara recebe. O máximo é 120.'),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: /Continuar/ }));
    expect(screen.getByText('Quantas pessoas?')).toBeVisible();
    expect(screen.queryByText('Quer uma decoração?')).not.toBeInTheDocument();
  });

  it('segue para a decoração com o número dentro do limite', async () => {
    const user = setupUser();
    stubFetch();
    seedDraft({ guestCount: null });
    renderWizard('/reservar?step=convidados');

    await user.type(await screen.findByLabelText('Número de convidados'), '80');
    await user.click(screen.getByRole('button', { name: /Continuar/ }));

    expect(await screen.findByText('Quer uma decoração?')).toBeVisible();
  });
});

describe('passo da decoração', () => {
  it('pede o estoque livre das datas do pedido', async () => {
    const urls = stubFetch();
    seedDraft();
    renderWizard('/reservar?step=decoracao');

    await screen.findByText('Quer uma decoração?');
    await waitFor(() => {
      expect(urls).toContain('/api/items/availability?from=2026-12-05&to=2026-12-06');
    });
  });

  /* Com a chácara, a decoração sai pelo preço com a chácara (novembro de 2026). */
  it('na chácara, mostra o preço com a chácara e o avulso riscado', async () => {
    stubFetch();
    seedDraft();
    renderWizard('/reservar?step=decoracao');

    await screen.findByRole('radio', { name: PAINEL.name });
    const painel = decorationCard(PAINEL.name);

    expect(painel.getByText('R$ 300,00')).toBeVisible();
    expect(painel.getByText('R$ 400,00').closest('s')).not.toBeNull();
    expect(painel.getByText('com a chácara')).toBeVisible();
    expect(painel.getByText(/Encaixe os balões de fora para dentro/)).toBeVisible();

    // Preço igual nos dois é sem promoção: nada riscado.
    const mesa = decorationCard(MESA.name);
    expect(mesa.getByText('R$ 250,00')).toBeVisible();
    expect(mesa.queryByText('com a chácara')).not.toBeInTheDocument();
  });

  it('começa sem decoração e deixa escolher uma só', async () => {
    const user = setupUser();
    stubFetch();
    seedDraft();
    renderWizard('/reservar?step=decoracao');

    expect(await screen.findByRole('radio', { name: 'Sem decoração' })).toBeChecked();

    await user.click(screen.getByRole('radio', { name: PAINEL.name }));
    await user.click(screen.getByRole('radio', { name: MESA.name }));

    expect(screen.getByRole('radio', { name: MESA.name })).toBeChecked();
    expect(screen.getByRole('radio', { name: PAINEL.name })).not.toBeChecked();
    await waitFor(() => expect(storedDraft()?.itemId).toBe(MESA.id));
  });

  it('mostra a decoração em uso nessa data, sem deixar escolher', async () => {
    stubFetch({ freeStock: { [MESA.id]: 0 } });
    seedDraft({ endDate: '2026-12-05' });
    renderWizard('/reservar?step=decoracao');

    expect(await screen.findByRole('radio', { name: MESA.name })).toBeDisabled();
    expect(decorationCard(MESA.name).getByText('Em uso nessa data')).toBeVisible();
    expect(screen.getByRole('radio', { name: PAINEL.name })).toBeEnabled();
  });

  it('não oferece decoração sem estoque nenhum', async () => {
    stubFetch();
    seedDraft();
    renderWizard('/reservar?step=decoracao');

    await screen.findByRole('radio', { name: PAINEL.name });
    expect(screen.queryByRole('radio', { name: SEM_ESTOQUE.name })).not.toBeInTheDocument();
  });

  it('filtra pela categoria', async () => {
    const user = setupUser();
    stubFetch();
    seedDraft();
    renderWizard('/reservar?step=decoracao');

    await screen.findByRole('radio', { name: PAINEL.name });
    await user.click(screen.getByRole('button', { name: 'Mesas' }));

    expect(screen.getByRole('radio', { name: MESA.name })).toBeVisible();
    expect(screen.queryByRole('radio', { name: PAINEL.name })).not.toBeInTheDocument();
  });

  it('avisa quando a escolhida está em uso nessa data e não deixa seguir', async () => {
    const user = setupUser();
    stubFetch({ freeStock: { [MESA.id]: 0 } });
    seedDraft({ endDate: '2026-12-05', itemId: MESA.id });
    renderWizard('/reservar?step=decoracao');

    expect(
      await screen.findByText(
        'A decoração escolhida não está livre nessa data. Escolha outra ou siga sem decoração.',
      ),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: /Continuar/ }));
    expect(screen.getByText('Quer uma decoração?')).toBeVisible();
  });

  it('na decoração sozinha, pede a escolha antes de seguir e cobra o preço avulso', async () => {
    const user = setupUser();
    stubFetch();
    seedDraft({ kind: 'DECORATION', endDate: '2026-12-05', guestCount: null });
    renderWizard('/reservar?step=decoracao');

    expect(await screen.findByText('Escolha a decoração')).toBeVisible();
    await screen.findByRole('radio', { name: PAINEL.name });
    expect(screen.queryByRole('radio', { name: 'Sem decoração' })).not.toBeInTheDocument();
    expect(decorationCard(PAINEL.name).getByText('R$ 400,00')).toBeVisible();
    expect(decorationCard(PAINEL.name).queryByText('com a chácara')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Continuar/ }));
    expect(await screen.findByText('Escolha a decoração da festa.')).toBeVisible();
  });

  /*
   * Decoração desativada sai do `GET /items`. Mantê-la no pedido faria a API
   * recusar o envio com "um dos itens saiu do catálogo" sem a pessoa saber qual.
   */
  it('tira do pedido a decoração que saiu do catálogo', async () => {
    stubFetch({ items: [MESA] });
    seedDraft({ itemId: PAINEL.id });
    renderWizard('/reservar?step=decoracao');

    await screen.findByRole('radio', { name: MESA.name });
    await waitFor(() => expect(storedDraft()?.itemId).toBeNull());
  });

  it('explica quando a decoração está fechada nas datas da chácara', async () => {
    const user = setupUser();
    stubFetch({ closed: ['2026-12-05'] });
    seedDraft({ endDate: '2026-12-05', itemId: PAINEL.id });
    renderWizard('/reservar?step=decoracao');

    expect(await screen.findByText('A decoração não sai nessas datas')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Tirar a decoração do pedido' }));
    await waitFor(() => expect(storedDraft()?.itemId).toBeNull());
  });
});

/*
 * §13.2: o passo mora na URL para o botão voltar do navegador andar um passo.
 * No celular esse botão é o gesto de voltar do sistema.
 */
describe('navegação', () => {
  /*
   * A barra com os passos saiu a pedido do dono (novembro de 2026): andar é só
   * pelo "Voltar" e pelo "Continuar", e um link para um passo adiante com o
   * pedido pela metade cai no que falta.
   */
  it('cai no primeiro passo que falta quando a URL pede um adiante', async () => {
    stubFetch();
    renderWizard('/reservar?step=revisao');

    expect(await screen.findByText('Quando é a festa?')).toBeVisible();
  });

  it('recupera o rascunho guardado, que é o que sobrevive ao desvio por login', async () => {
    stubFetch();
    seedDraft();
    renderWizard('/reservar?step=convidados');

    expect(await screen.findByLabelText('Número de convidados')).toHaveValue(60);
  });

  /*
   * O pedido não é carrinho (§12.2): o que a pessoa monta e abandona antes da
   * revisão não fica guardado. A volta do login, que precisa do pedido inteiro,
   * só acontece a partir da revisão, e lá ele é guardado.
   */
  it('esquece o pedido que não chegou à revisão', async () => {
    const user = setupUser();
    stubFetch();
    const first = renderWizard('/reservar?step=data');

    await user.click(await screen.findByRole('button', { name: DIA_9 }));
    expect(await screen.findByText('9 de dezembro de 2026')).toBeVisible();

    first.unmount();
    renderWizard('/reservar?step=data');

    await screen.findByText('Quando é a festa?');
    expect(screen.queryByText('9 de dezembro de 2026')).not.toBeInTheDocument();
    expect(storedDraft()).toBeNull();
  });

  /*
   * A troca de passo é só na query, e a rolagem do navegador ficava onde estava:
   * quem tocava em "Continuar" no fim do passo caía no meio do seguinte.
   */
  it('começa o passo seguinte do topo', async () => {
    const user = setupUser();
    const scrollTo = vi.spyOn(window, 'scrollTo');
    stubFetch();
    renderWizard();

    await user.click(await screen.findByRole('button', { name: /Continuar/ }));

    expect(await screen.findByText('Quando é a festa?')).toBeVisible();
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });
});
