import type { CatalogItem, Combo, PublicVenue } from '@chacara/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderWithProviders } from '../../../test/helpers/render';
import { BookingWizard } from './BookingWizard';
import { type BookingDraft, EMPTY_DRAFT, saveDraft } from './draft';

/**
 * O wizard é testado pela borda: rota, requisições e o que a pessoa vê.
 *
 * O relógio é fixado porque o calendário abre no mês corrente e pede a
 * disponibilidade desse período — sem data fixa, o teste mudaria de
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

const BOHO = {
  id: 't-boho',
  slug: 'rustico-boho',
  name: 'Rústico boho',
  tagline: 'Tons naturais.',
  description: null,
  palette: [{ name: 'Sálvia', hex: '#A7B8A1' }],
  coverImageUrl: null,
  sortOrder: 1,
};

const NUVENS = {
  id: 't-nuvens',
  slug: 'nuvens-e-estrelas',
  name: 'Nuvens e estrelas',
  tagline: 'Algodão e luz baixa.',
  description: null,
  palette: [{ name: 'Céu', hex: '#C6D7E8' }],
  coverImageUrl: null,
  sortOrder: 2,
};

const PAINEIS = { id: 'c-paineis', name: 'Painéis', sortOrder: 1 };
const MESAS = { id: 'c-mesas', name: 'Mesas', sortOrder: 2 };

const PAINEL: CatalogItem = {
  id: 'i-painel',
  name: 'Painel de balões arco-íris',
  description: 'Painel redondo com balões em degradê.',
  imageUrl: null,
  priceCents: 12_000,
  stock: 2,
  assemblyNotes: 'Encaixe os balões de fora para dentro.',
  sortOrder: 1,
  category: PAINEIS,
  themeIds: [BOHO.id],
};

const MESA: CatalogItem = {
  id: 'i-mesa',
  name: 'Mesa de madeira rústica',
  description: null,
  imageUrl: null,
  priceCents: 8_000,
  stock: 0,
  assemblyNotes: null,
  sortOrder: 2,
  category: MESAS,
  themeIds: [BOHO.id],
};

const COMBO: Combo = {
  id: 'combo-1',
  name: 'Combo Rústico completo',
  description: 'Painel e mesa juntos.',
  imageUrl: null,
  themeId: BOHO.id,
  discountType: 'PERCENT',
  discountValue: 10,
  items: [
    {
      itemId: PAINEL.id,
      name: PAINEL.name,
      quantity: 1,
      unitPriceCents: PAINEL.priceCents,
      totalCents: PAINEL.priceCents,
    },
    {
      itemId: MESA.id,
      name: MESA.name,
      quantity: 1,
      unitPriceCents: MESA.priceCents,
      totalCents: MESA.priceCents,
    },
  ],
  itemsTotalCents: 20_000,
  discountCents: 2_000,
  priceCents: 18_000,
};

/** Dezembro inteiro livre, menos o dia 10. */
function decemberDays(booked: string[] = ['2026-12-10']) {
  const days: { date: string; status: 'free' | 'booked' }[] = [];

  for (let month = 12; month <= 13; month += 1) {
    const year = month > 12 ? 2027 : 2026;
    const real = month > 12 ? month - 12 : month;
    const last = new Date(Date.UTC(year, real, 0)).getUTCDate();

    for (let day = 1; day <= last; day += 1) {
      const date = `${year}-${String(real).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      days.push({ date, status: booked.includes(date) ? 'booked' : 'free' });
    }
  }

  return { days };
}

/*
 * Nome acessível do dia no calendário, como o `react-day-picker` o monta em pt-BR.
 * Ancorado nas duas pontas: sem o `$`, "9 de dezembro" casaria também com 19 e 29.
 */
const DIA_9 = /^quarta-feira, 9 de dezembro de 2026$/;
const DIA_10 = /^quinta-feira, 10 de dezembro de 2026$/;

type Routes = Record<string, unknown>;

function stubFetch(overrides: Routes = {}) {
  const urls: string[] = [];

  const routes: Routes = {
    '/api/public/venue': VENUE,
    '/api/themes': [BOHO, NUVENS],
    '/api/categories': [PAINEIS, MESAS],
    '/api/items': [PAINEL, MESA],
    '/api/combos': [COMBO],
    ...overrides,
  };

  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      urls.push(url);

      // Casa primeiro a URL exata (com query), depois só o caminho.
      const path = url.split('?')[0]!;
      const body = routes[url] ?? routes[path];

      if (body !== undefined) return Promise.resolve(jsonResponse(body));
      if (path === '/api/availability') return Promise.resolve(jsonResponse(decemberDays()));

      return Promise.resolve(jsonResponse([]));
    }),
  );

  return urls;
}

function renderWizard(route = '/reservar') {
  return renderWithProviders(<BookingWizard />, { route, withAuth: false });
}

/** Chave do pedido guardado no `sessionStorage`. */
const DRAFT_KEY = 'chacara:booking-draft';

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

describe('BookingWizard', () => {
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

  it('abre no passo das datas e mostra os limites da chácara', async () => {
    stubFetch();
    renderWizard();

    expect(await screen.findByText('Quando é a festa?')).toBeVisible();
    expect(screen.getByText(/de 1 a 3 dias seguidos/)).toBeVisible();
    expect(screen.getByText(/pelo menos 2 dias de antecedência/)).toBeVisible();
  });

  it('pede a disponibilidade do mês visível e do seguinte', async () => {
    const urls = stubFetch();
    renderWizard();

    await screen.findByText('Quando é a festa?');

    await waitFor(() => {
      expect(urls).toContain('/api/availability?from=2026-12-01&to=2027-01-31');
    });
  });

  it('respeita o passo pedido na URL', async () => {
    stubFetch();
    seedDraft();
    renderWizard('/reservar?step=itens');

    expect(await screen.findByText('Escolha o estilo da festa')).toBeVisible();
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
      renderWizard('/reservar?data=2026-12-09');

      expect(await screen.findByText('9 de dezembro de 2026')).toBeVisible();
      expect(screen.getByText('(1 dia)')).toBeVisible();
    });

    it('começa um pedido novo, sem o que estava guardado', async () => {
      stubFetch();
      seedDraft({ startDate: '2026-12-05', endDate: '2026-12-06' });
      renderWizard('/reservar?data=2026-12-09');

      expect(await screen.findByText('9 de dezembro de 2026')).toBeVisible();
      // Os convidados eram do pedido guardado, e ficaram com ele.
      expect(screen.getByLabelText('Número de convidados')).toHaveValue(null);

      // E o pedido antigo não volta depois pelo "Reservar" do cabeçalho.
      await waitFor(() => {
        expect(window.sessionStorage.getItem(DRAFT_KEY)).toBeNull();
      });
    });

    it('ignora data fora do formato em vez de quebrar', async () => {
      stubFetch();
      renderWizard('/reservar?data=ontem');

      await screen.findByText('Quando é a festa?');
      expect(screen.queryByText('(1 dia)')).not.toBeInTheDocument();
    });

    it('aplica o estilo do link ao filtro de itens', async () => {
      const urls = stubFetch();
      renderWizard(`/reservar?step=itens&estilo=${BOHO.id}`);

      await screen.findByText('Escolha o estilo da festa');

      await waitFor(() => {
        expect(urls).toContain(`/api/items?themeId=${BOHO.id}`);
      });
    });

    /*
     * Antes da revisão, o pedido vive só na tela: nada vai para o
     * armazenamento, e sair e voltar começa do zero (ver o caso "esquece o
     * pedido" mais abaixo). O que é guardado a partir da revisão está em
     * `BookingSubmit.test.tsx`, que é onde há sessão para a revisão abrir.
     *
     * A limpeza do parâmetro da URL não é verificável aqui — o `MemoryRouter` não
     * mexe em `window.location`, e um teste que passa por vacuidade seria pior
     * que nenhum. Ela está coberta na verificação ao vivo.
     */
    it('não guarda o pedido antes da revisão', async () => {
      stubFetch();
      renderWizard('/reservar?data=2026-12-09');

      await screen.findByText('9 de dezembro de 2026');

      await waitFor(() => {
        expect(window.sessionStorage.getItem(DRAFT_KEY)).toBeNull();
      });
    });

    /*
     * O cartão da vitrine de itens da landing manda `?item=`. O id precisa ter o
     * formato de uuid, por isso o item aqui não é o `PAINEL` dos outros casos.
     *
     * O que entrou no pedido se vê pelo rodapé, que conta as linhas e estima o
     * valor dos itens: antes da revisão, não há mais onde olhar.
     */
    const VITRINE: CatalogItem = { ...PAINEL, id: '00000000-0000-4000-8000-000000000001' };

    /*
     * Pedido do dono: quem clica numa peça da vitrine está alugando a decoração,
     * e o wizard já abre em "Só a decoração", com o item no pedido.
     */
    it('abre em "só a decoração", com uma unidade do item que veio da vitrine', async () => {
      stubFetch({ '/api/items': [VITRINE, MESA] });
      renderWizard(`/reservar?item=${VITRINE.id}`);

      expect(await screen.findByText('Qual é o dia da festa?')).toBeVisible();
      expect(screen.getByRole('radio', { name: /Só a decoração/ })).toBeChecked();
      // Sem a chácara, não há convidados a perguntar.
      expect(screen.queryByLabelText('Número de convidados')).not.toBeInTheDocument();

      expect(screen.getByText('Itens escolhidos (1)')).toBeVisible();
      expect(await screen.findByText('R$ 120,00')).toBeVisible();
    });

    /*
     * O defeito que o dono encontrou: escolher um item, voltar à landing e
     * escolher outro abria a reserva com os dois.
     */
    it('começa o pedido só com o item da vitrine, sem somar ao que estava guardado', async () => {
      stubFetch({ '/api/items': [VITRINE, MESA] });
      // O que sobrou de outra visita: a mesa, que levaria a estimativa a R$ 200,00.
      seedDraft({ items: [{ itemId: MESA.id, quantity: 1 }] });
      renderWizard(`/reservar?item=${VITRINE.id}`);

      expect(await screen.findByText('Itens escolhidos (1)')).toBeVisible();
      expect(await screen.findByText('R$ 120,00')).toBeVisible();
    });

    it('ignora item fora do formato em vez de quebrar', async () => {
      stubFetch();
      renderWizard('/reservar?item=nao-e-um-id');

      expect(await screen.findByText('Só a chácara, sem itens')).toBeVisible();
    });
  });

  /*
   * §13.2: o passo mora na URL para o botão voltar do navegador andar um passo.
   * No celular esse botão é o gesto de voltar do sistema.
   */
  it('avança para os itens quando o passo 1 está completo', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    stubFetch();
    seedDraft();
    renderWizard();

    await screen.findByText('Quando é a festa?');
    await user.click(screen.getByRole('button', { name: /Continuar/ }));

    expect(await screen.findByText('Escolha o estilo da festa')).toBeVisible();
  });

  it('bloqueia o avanço e aponta o que falta quando o passo 1 está incompleto', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    stubFetch();
    renderWizard();

    await screen.findByText('Quando é a festa?');
    await user.click(screen.getByRole('button', { name: /Continuar/ }));

    expect(await screen.findByText('Escolha as datas da festa.')).toBeVisible();
    expect(screen.getByText('Informe quantas pessoas são esperadas.')).toBeVisible();
    // Continua no passo 1: nada de pular para uma tela que não sabe as datas.
    expect(screen.getByText('Quando é a festa?')).toBeVisible();
  });

  it('não deixa pular direto para os itens antes de o passo 1 fechar', async () => {
    stubFetch();
    renderWizard();

    await screen.findByText('Quando é a festa?');

    expect(screen.getByRole('button', { name: /Itens/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Revisão/ })).toBeDisabled();
  });

  it('libera os atalhos dos passos quando o rascunho está completo', async () => {
    stubFetch();
    seedDraft();
    renderWizard();

    await screen.findByText('Quando é a festa?');

    expect(screen.getByRole('button', { name: /Itens/ })).toBeEnabled();
  });

  it('recupera o rascunho guardado, que é o que sobrevive ao desvio por login', async () => {
    stubFetch();
    seedDraft();
    renderWizard();

    // 5 a 6 de dezembro de 2026, sem repetir o mês.
    expect(await screen.findByText(/5 a 6 de dezembro de 2026/)).toBeVisible();
    expect(screen.getByLabelText('Número de convidados')).toHaveValue(60);
  });

  /*
   * O pedido não é carrinho (§12.2): o que a pessoa monta e abandona antes da
   * revisão não fica guardado. A volta do login, que precisa do pedido inteiro,
   * só acontece a partir da revisão, e lá ele é guardado.
   */
  it('esquece o pedido que não chegou à revisão', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    stubFetch();
    const first = renderWizard();

    await screen.findByText('Quando é a festa?');
    await user.click(await screen.findByRole('button', { name: DIA_9 }));
    await user.type(screen.getByLabelText('Número de convidados'), '80');
    expect(await screen.findByText('9 de dezembro de 2026')).toBeVisible();

    first.unmount();
    renderWizard();

    expect(await screen.findByLabelText('Número de convidados')).toHaveValue(null);
    expect(screen.queryByText('9 de dezembro de 2026')).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  /*
   * A troca de passo é só na query, e a rolagem do navegador ficava onde estava:
   * quem tocava em "Continuar" no fim do passo caía no meio do seguinte.
   */
  it('começa o passo seguinte do topo', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const scrollTo = vi.spyOn(window, 'scrollTo');
    stubFetch();
    seedDraft();
    renderWizard();

    await screen.findByText('Quando é a festa?');
    await user.click(screen.getByRole('button', { name: /Continuar/ }));

    expect(await screen.findByText('Escolha o estilo da festa')).toBeVisible();
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  /*
   * §13.2: dizer **qual** dia atrapalha, não só recusar a escolha. O
   * `react-day-picker` desabilita dia a dia, mas não impede um intervalo que
   * pule por cima de um dia ocupado.
   */
  it('diz qual dia do intervalo está indisponível', async () => {
    stubFetch();
    seedDraft({ startDate: '2026-12-09', endDate: '2026-12-11' });
    renderWizard();

    expect(await screen.findByText(/10 de dezembro de 2026 não está disponível/)).toBeVisible();
  });

  it('avisa quando o intervalo passa do máximo de dias', async () => {
    stubFetch();
    seedDraft({ startDate: '2026-12-01', endDate: '2026-12-06' });
    renderWizard();

    expect(await screen.findByText(/no máximo 3 dias seguidos/)).toBeVisible();
  });

  /*
   * O nome acessível do dia é a data inteira ("quinta-feira, 10 de dezembro de
   * 2026"), e não o número: é o que o leitor de tela anuncia, e é o que distingue
   * os dois meses visíveis ao mesmo tempo.
   */
  it('mostra o dia ocupado como indisponível no calendário', async () => {
    stubFetch();
    renderWizard();

    await screen.findByText('Quando é a festa?');

    expect(await screen.findByRole('button', { name: DIA_10 })).toBeDisabled();
    expect(screen.getByRole('button', { name: DIA_9 })).toBeEnabled();
  });

  it('trata clique único como reserva de um dia', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    stubFetch();
    renderWizard();

    await screen.findByText('Quando é a festa?');
    await user.click(await screen.findByRole('button', { name: DIA_9 }));

    expect(await screen.findByText('9 de dezembro de 2026')).toBeVisible();
    expect(screen.getByText('(1 dia)')).toBeVisible();
  });
});

describe('BookingWizard, passo de itens', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-12-01T12:00:00.000Z'));
    window.sessionStorage.clear();
    seedDraft();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
  });

  function renderItems() {
    return renderWizard('/reservar?step=itens');
  }

  it('lista os itens com preço, categoria e dica de montagem', async () => {
    stubFetch();
    renderItems();

    const name = await screen.findByText('Painel de balões arco-íris');
    const card = within(name.closest('li')!);

    expect(card.getByText('R$ 120,00')).toBeVisible();
    // A categoria aparece no card e também como chip de filtro: aqui só o card.
    expect(card.getByText('Painéis')).toBeVisible();
    expect(card.getByText(/Encaixe os balões de fora para dentro/)).toBeVisible();
  });

  it('marca o item sem estoque como esgotado, sem seletor de quantidade', async () => {
    stubFetch();
    renderItems();

    expect(await screen.findByText('Esgotado')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Aumentar Mesa de madeira rústica' }),
    ).not.toBeInTheDocument();
  });

  it('filtra os itens pelo estilo escolhido', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const urls = stubFetch();
    renderItems();

    await screen.findByText('Painel de balões arco-íris');
    await user.click(screen.getByRole('button', { name: /Nuvens e estrelas/ }));

    await waitFor(() => {
      expect(urls).toContain(`/api/items?themeId=${NUVENS.id}`);
    });
  });

  it('conta no rótulo da aba as unidades escolhidas', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    stubFetch();
    renderItems();

    await screen.findByText('Painel de balões arco-íris');
    await user.click(screen.getByRole('button', { name: 'Aumentar Painel de balões arco-íris' }));

    expect(await screen.findByRole('tab', { name: 'Itens (1)' })).toBeVisible();
  });

  it('não deixa passar do estoque do item', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    stubFetch();
    renderItems();

    await screen.findByText('Painel de balões arco-íris');
    const more = screen.getByRole('button', { name: 'Aumentar Painel de balões arco-íris' });

    await user.click(more);
    await user.click(more);

    expect(await screen.findByRole('tab', { name: 'Itens (2)' })).toBeVisible();
    expect(more).toBeDisabled();
  });

  it('mostra a economia do combo e o que falta para fechá-lo', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    stubFetch();
    renderItems();

    await screen.findByText('Painel de balões arco-íris');
    await user.click(screen.getByRole('tab', { name: 'Combos' }));

    expect(await screen.findByText('Combo Rústico completo')).toBeVisible();
    expect(screen.getByText('R$ 20,00')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Completar o combo' })).toBeVisible();
  });

  it('completa o combo pondo no pedido o que falta', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    stubFetch();
    renderItems();

    await screen.findByText('Painel de balões arco-íris');
    await user.click(screen.getByRole('tab', { name: 'Combos' }));
    await user.click(await screen.findByRole('button', { name: 'Completar o combo' }));

    expect(await screen.findByText(/Combo completo/)).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Itens (2)' })).toBeVisible();
  });

  /*
   * Item desativado sai do `GET /items`. Mantê-lo no pedido faria a API recusar
   * o envio com "um dos itens saiu do catálogo" sem a pessoa saber qual era.
   */
  it('tira do pedido o item que saiu do catálogo', async () => {
    stubFetch({ '/api/items': [MESA] });
    seedDraft({ items: [{ itemId: PAINEL.id, quantity: 2 }] });
    renderItems();

    await screen.findByText('Mesa de madeira rústica');

    await waitFor(() => {
      const stored = JSON.parse(window.sessionStorage.getItem(DRAFT_KEY) ?? '{}') as BookingDraft;
      expect(stored.items).toEqual([]);
    });
  });

  it('explica o vazio quando o filtro não devolve item', async () => {
    stubFetch({ '/api/items': [] });
    renderItems();

    expect(await screen.findByText('Nenhum item neste filtro')).toBeVisible();
  });

  it('mostra a estimativa como estimativa, deixando as diárias para a revisão', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    stubFetch();
    renderItems();

    await screen.findByText('Painel de balões arco-íris');
    await user.click(screen.getByRole('button', { name: 'Aumentar Painel de balões arco-íris' }));

    expect(await screen.findByText('Itens escolhidos (1)')).toBeVisible();
    expect(screen.getByText('As diárias entram no total na revisão.')).toBeVisible();
  });

  it('deixa claro que dá para alugar só a chácara', async () => {
    stubFetch();
    renderItems();

    expect(await screen.findByText('Só a chácara, sem itens')).toBeVisible();
  });
});
