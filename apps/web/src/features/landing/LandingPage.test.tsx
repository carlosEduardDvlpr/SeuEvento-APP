import type { CatalogItem, Combo, GalleryImage, PublicVenue, Theme } from '@chacara/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorResponse, jsonResponse, renderWithProviders } from '../../../test/helpers/render';
import { LandingPage } from './LandingPage';

/**
 * Landing (§13.1).
 *
 * O que está sob teste, acima de tudo: **seção sem conteúdo não aparece** (§16.6).
 * A landing lê o que o dono cadastrou, e inventar nada é a regra.
 */

const VENUE: PublicVenue = {
  name: 'Chácara Seu Evento',
  maxGuests: 120,
  checkInTime: '08:00',
  checkOutTime: '22:00',
  whatsapp: '11988887777',
  address: 'Estrada do Sol, 100',
  mapsUrl: 'https://maps.exemplo.com/chacara',
  houseRules: 'Som até 22h.',
  minDays: 1,
  maxDays: 3,
  minLeadDays: 2,
  freeCancelUntilDays: 7,
  holdHours: 48,
};

const HERO: GalleryImage = {
  id: 'g-1',
  kind: 'HERO',
  url: 'https://exemplo.com/hero.webp',
  alt: 'Mesa comprida montada no gramado ao fim da tarde',
  caption: null,
  sortOrder: 1,
};

const AREA: GalleryImage = {
  id: 'g-2',
  kind: 'VENUE',
  url: 'https://exemplo.com/area.webp',
  alt: 'Área coberta',
  caption: 'Mesas para 60 pessoas, com ventilador e luz regulável.',
  sortOrder: 1,
};

const EVENT_PHOTOS: GalleryImage[] = [
  {
    id: 'g-3',
    kind: 'EVENTS',
    url: 'https://exemplo.com/festa-1.webp',
    alt: 'Chá de bebê com painel de nuvens',
    caption: 'Chá de bebê da Lia',
    sortOrder: 1,
  },
  {
    id: 'g-4',
    kind: 'EVENTS',
    url: 'https://exemplo.com/festa-2.webp',
    alt: 'Casamento no gramado',
    caption: null,
    sortOrder: 2,
  },
];

const THEME: Theme = {
  id: 't-1',
  slug: 'rustico-boho',
  name: 'Rústico boho',
  tagline: 'Tons naturais e trama de palha.',
  description: null,
  palette: [
    { name: 'Sálvia', hex: '#A7B8A1' },
    { name: 'Palha', hex: '#D8C7A3' },
  ],
  coverImageUrl: null,
  sortOrder: 1,
};

const COMBO: Combo = {
  id: 'c-1',
  name: 'Mesa do bolo boho',
  description: 'Mesa, toalha e arranjo.',
  imageUrl: null,
  themeId: THEME.id,
  discountType: 'PERCENT',
  discountValue: 20,
  items: [
    {
      itemId: 'i-1',
      name: 'Mesa rústica',
      quantity: 1,
      unitPriceCents: 20_000,
      totalCents: 20_000,
    },
    {
      itemId: 'i-2',
      name: 'Arranjo de flores',
      quantity: 2,
      unitPriceCents: 15_000,
      totalCents: 30_000,
    },
  ],
  itemsTotalCents: 50_000,
  discountCents: 10_000,
  priceCents: 40_000,
};

const CASAMENTO = { id: 'cat-casamento', name: 'Casamento', sortOrder: 0 };
const CHA_DE_BEBE = { id: 'cat-cha', name: 'Chá de bebê', sortOrder: 1 };

function vitrine(number: number, category: typeof CASAMENTO, stock = 1): CatalogItem {
  return {
    id: `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`,
    name: `Decoração ${category.name.toLowerCase()} ${number}`,
    description: null,
    imageUrl: `/catalogo/${category.id}/${number}.jpg`,
    // Diferente do preço do combo de exemplo: o teste de combos procura o dele na página.
    priceCents: 35_000,
    stock,
    assemblyNotes: null,
    sortOrder: number,
    category,
    themeIds: [],
  };
}

/** Nove itens em duas categorias, e um décimo sem estoque, que não pode aparecer. */
const ITEMS: CatalogItem[] = [
  ...[1, 2, 3, 4, 5, 6].map((number) => vitrine(number, CASAMENTO)),
  ...[7, 8, 9].map((number) => vitrine(number, CHA_DE_BEBE)),
  vitrine(10, CHA_DE_BEBE, 0),
];

type Routes = Record<string, () => Response>;

function stubFetch(routes: Routes = {}) {
  const urls: string[] = [];

  const base: Routes = {
    '/api/public/venue': () => jsonResponse(VENUE),
    '/api/gallery': () => jsonResponse([HERO, AREA, ...EVENT_PHOTOS]),
    '/api/themes': () => jsonResponse([THEME]),
    '/api/items': () => jsonResponse(ITEMS),
    '/api/combos': () => jsonResponse([COMBO]),
    ...routes,
  };

  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      urls.push(url);

      const path = url.split('?')[0]!;
      const handler = base[url] ?? base[path];

      return Promise.resolve(handler ? handler() : jsonResponse([]));
    }),
  );

  return urls;
}

function renderLanding(routes: Routes = {}) {
  const urls = stubFetch(routes);
  renderWithProviders(<LandingPage />, { route: '/', withAuth: false });
  return urls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LandingPage', () => {
  it('tem um único h1, e ele descreve a página (§18.1)', async () => {
    renderLanding();

    await screen.findByRole('heading', { level: 1 });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('mostra a mensagem da API quando a carga falha', async () => {
    renderLanding({
      '/api/public/venue': () => errorResponse(500, 'INTERNAL', 'Algo deu errado do nosso lado.'),
    });

    expect(await screen.findByText('Algo deu errado do nosso lado.')).toBeVisible();
  });

  /* A ordem é decisão de produto e está fixada na §13.1. */
  it('segue a ordem de seções da §13.1', async () => {
    renderLanding();

    await screen.findByRole('heading', { level: 1 });

    const titles = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);

    // O hero não tem h2: é o h1 com uma frase e um botão.
    expect(titles).toEqual([
      'A chácara',
      'Pegue e monte: como funciona',
      'Escolha um estilo',
      // A vitrine de itens entrou depois, a pedido do dono, no bloco da decoração.
      'Decorações',
      'Combos que saem mais barato',
      'Perguntas frequentes',
      'Como chegar',
    ]);
  });
});

/*
 * Hero (§13.1, item 1): o nome, uma frase e um botão só. Era um seletor com as
 * próximas datas livres; o dono preferiu levar direto ao calendário do wizard.
 */
describe('hero', () => {
  it('abre com o nome e a frase da chácara', async () => {
    renderLanding();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Espaço Donna Belle' }),
    ).toBeVisible();
    expect(screen.getByText('O cenário perfeito para momentos inesquecíveis.')).toBeVisible();
  });

  it('leva ao calendário do wizard por um botão só', async () => {
    renderLanding();

    expect(await screen.findByRole('link', { name: 'Reservar uma data' })).toHaveAttribute(
      'href',
      '/reservar',
    );
  });

  /* Os dias livres são do calendário do wizard, que pede a agenda na hora. */
  it('não consulta a agenda', async () => {
    const urls = renderLanding();

    // Quando os combos aparecem, a página inteira já montou: o pedido já teria saído.
    await screen.findByText('Combos que saem mais barato');

    expect(urls.filter((url) => url.startsWith('/api/availability'))).toEqual([]);
  });

  it('usa a foto de destaque quando o dono subiu uma', async () => {
    renderLanding();

    expect(
      await screen.findByAltText('Mesa comprida montada no gramado ao fim da tarde'),
    ).toBeVisible();
  });
});

describe('a chácara', () => {
  it('mostra capacidade, horários e período vindos da configuração', async () => {
    renderLanding();

    expect(await screen.findByText('120 pessoas')).toBeVisible();
    expect(screen.getByText('08:00 às 22:00')).toBeVisible();
    expect(screen.getByText('de 1 a 3 dias')).toBeVisible();
  });

  it('usa singular quando o período é de um único dia', async () => {
    renderLanding({
      '/api/public/venue': () => jsonResponse({ ...VENUE, minDays: 1, maxDays: 1 }),
    });

    expect(await screen.findByText('1 dia')).toBeVisible();
  });

  /*
   * O tour por áreas sai das fotos "A chácara" da galeria: o dono descreve o que
   * existe de verdade pelo painel, e nós não inventamos uma área (§16.6).
   */
  it('monta o tour com as áreas cadastradas na galeria', async () => {
    renderLanding();

    expect(await screen.findByRole('heading', { name: 'Área coberta' })).toBeVisible();
    expect(screen.getByText(/Mesas para 60 pessoas/)).toBeVisible();
  });

  it('mostra o endereço quando preenchido', async () => {
    renderLanding();

    // Duas vezes de propósito: aqui e no "como chegar", onde se age sobre ele.
    expect(await screen.findAllByText('Estrada do Sol, 100')).toHaveLength(2);
  });
});

/*
 * A galeria de festas saiu da landing a pedido do dono. O stub continua
 * devolvendo fotos da seção "Eventos", como o banco pode ainda ter: a landing
 * tem de ignorá-las.
 */
describe('fotos de festas', () => {
  it('não aparecem, mesmo que a API ainda as devolva', async () => {
    renderLanding();

    await screen.findByText('Combos que saem mais barato');

    expect(screen.queryByText('Festas que já aconteceram aqui')).not.toBeInTheDocument();
    expect(screen.queryByAltText('Chá de bebê com painel de nuvens')).not.toBeInTheDocument();
    expect(screen.queryByAltText('Casamento no gramado')).not.toBeInTheDocument();
  });
});

describe('estilos', () => {
  it('leva ao wizard com o filtro do estilo', async () => {
    renderLanding();

    const link = await screen.findByRole('link', { name: /Rústico boho/ });

    expect(link).toHaveAttribute('href', '/reservar?estilo=t-1');
  });

  it('mostra a tagline e a paleta com nome legível', async () => {
    renderLanding();

    expect(await screen.findByText('Tons naturais e trama de palha.')).toBeVisible();
    // A cor é dado, não decoração (§14.3).
    expect(screen.getByText('Sálvia (#A7B8A1)')).toBeInTheDocument();
  });

  it('não aparece sem estilo cadastrado', async () => {
    renderLanding({ '/api/themes': () => jsonResponse([]) });

    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText('Escolha um estilo')).not.toBeInTheDocument();
  });
});

describe('combos', () => {
  /* A economia vem calculada da API (§9.6): a landing não soma desconto. */
  it('mostra o preço do combo e quanto a pessoa economiza', async () => {
    renderLanding();

    expect(await screen.findByText('Mesa do bolo boho')).toBeVisible();
    expect(screen.getByText('R$ 500,00')).toBeVisible();
    expect(screen.getByText('R$ 400,00')).toBeVisible();
    expect(screen.getByText(/você economiza/)).toBeVisible();
  });

  it('lista os itens do combo', async () => {
    renderLanding();

    expect(await screen.findByText('1× Mesa rústica')).toBeVisible();
    expect(screen.getByText('2× Arranjo de flores')).toBeVisible();
  });

  it('não aparece sem combo cadastrado', async () => {
    renderLanding({ '/api/combos': () => jsonResponse([]) });

    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText('Combos que saem mais barato')).not.toBeInTheDocument();
  });
});

describe('perguntas frequentes', () => {
  /**
   * Abre uma pergunta e devolve a resposta.
   *
   * O `<details>` nasce fechado, então a resposta está no DOM — encontrável pelo
   * Ctrl+F do navegador — mas invisível até alguém abrir. O helper reproduz esse
   * caminho em vez de contornar.
   */
  async function openQuestion(user: ReturnType<typeof userEvent.setup>, question: RegExp) {
    await user.click(await screen.findByText(question));
  }

  it('lista as perguntas, fechadas', async () => {
    renderLanding();

    expect(await screen.findByText('Qual é o horário?')).toBeVisible();
    // A resposta existe no DOM, mas só aparece ao abrir.
    expect(screen.getByText(/O espaço é seu durante todo esse período/)).not.toBeVisible();
  });

  /* Cada resposta sai da configuração: mudar no painel muda a resposta aqui. */
  it('responde o horário com o que está configurado', async () => {
    const user = userEvent.setup();
    renderLanding({
      '/api/public/venue': () =>
        jsonResponse({ ...VENUE, checkInTime: '10:00', checkOutTime: '20:00' }),
    });

    await openQuestion(user, /Qual é o horário/);

    expect(screen.getByText(/a partir das 10:00 e a saída até as 20:00/)).toBeVisible();
  });

  it('responde a antecedência com o número configurado', async () => {
    const user = userEvent.setup();
    renderLanding();

    await openQuestion(user, /antecedência preciso reservar/);

    expect(screen.getByText(/Pelo menos 2 dias antes da festa/)).toBeVisible();
  });

  it('diz que dá para reservar para hoje quando não há antecedência', async () => {
    const user = userEvent.setup();
    renderLanding({ '/api/public/venue': () => jsonResponse({ ...VENUE, minLeadDays: 0 }) });

    await openQuestion(user, /antecedência preciso reservar/);

    expect(screen.getByText(/até para hoje/)).toBeVisible();
  });

  /* O prazo do pedido saiu do hero com o seletor de datas; agora só a FAQ o diz. */
  it('responde quanto tempo a data fica segura com o prazo configurado', async () => {
    const user = userEvent.setup();
    renderLanding({ '/api/public/venue': () => jsonResponse({ ...VENUE, holdHours: 24 }) });

    await openQuestion(user, /Quanto tempo a data fica reservada/);

    expect(screen.getByText(/seguras por até 24 horas/)).toBeVisible();
  });

  it('responde o cancelamento com o prazo configurado', async () => {
    const user = userEvent.setup();
    renderLanding();

    await openQuestion(user, /Consigo cancelar/);

    expect(screen.getByText(/até 7 dias antes do início/)).toBeVisible();
  });

  it('deixa claro que o site não cobra nada', async () => {
    const user = userEvent.setup();
    renderLanding();

    await openQuestion(user, /Como funciona o pagamento/);

    expect(screen.getByText(/Nada é cobrado pelo site/)).toBeVisible();
  });

  it('mostra as regras da casa quando o dono escreveu', async () => {
    renderLanding();

    expect(await screen.findByText('Som até 22h.')).toBeVisible();
  });

  /* §16.6: o seed não inventa regra da casa, e a seção simplesmente não aparece. */
  it('omite as regras da casa quando não estão preenchidas', async () => {
    renderLanding({ '/api/public/venue': () => jsonResponse({ ...VENUE, houseRules: null }) });

    await screen.findByText('Perguntas frequentes');
    expect(screen.queryByText('Regras da casa')).not.toBeInTheDocument();
  });
});

describe('como chegar', () => {
  it('leva ao mapa por link, não por embed', async () => {
    renderLanding();

    expect(await screen.findByRole('link', { name: 'Abrir no mapa' })).toHaveAttribute(
      'href',
      'https://maps.exemplo.com/chacara',
    );
  });

  it('oferece o WhatsApp da chácara com mensagem pronta', async () => {
    renderLanding();

    expect(await screen.findByRole('link', { name: 'Falar pelo WhatsApp' })).toHaveAttribute(
      'href',
      expect.stringContaining('wa.me/5511988887777'),
    );
  });

  it('não aparece sem endereço nem WhatsApp', async () => {
    renderLanding({
      '/api/public/venue': () =>
        jsonResponse({ ...VENUE, address: null, whatsapp: null, mapsUrl: null }),
    });

    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText('Como chegar')).not.toBeInTheDocument();
  });

  it('esconde só o link do mapa quando não há URL', async () => {
    renderLanding({ '/api/public/venue': () => jsonResponse({ ...VENUE, mapsUrl: null }) });

    await screen.findByText('Como chegar');
    expect(screen.queryByRole('link', { name: 'Abrir no mapa' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Falar pelo WhatsApp' })).toBeVisible();
  });
});

/*
 * Vitrine de itens: pedido do dono para a landing mostrar a decoração mesmo
 * antes de existir estilo cadastrado.
 */
describe('vitrine de itens', () => {
  async function itemsSection() {
    const heading = await screen.findByRole('heading', { name: 'Decorações' });
    return heading.closest('section')!;
  }

  it('aparece mesmo sem estilo cadastrado', async () => {
    renderLanding({ '/api/themes': () => jsonResponse([]) });

    const section = await itemsSection();

    expect(within(section).getByRole('heading', { name: 'Decoração casamento 1' })).toBeVisible();
    expect(screen.queryByText('Escolha um estilo')).not.toBeInTheDocument();
  });

  it('some quando ainda não há item', async () => {
    renderLanding({ '/api/items': () => jsonResponse([]) });

    // Os combos chegam pela mesma rodada de requisições: a vitrine já teria aparecido.
    await screen.findByText('Combos que saem mais barato');
    expect(screen.queryByRole('heading', { name: 'Decorações' })).not.toBeInTheDocument();
  });

  it('mostra o preço e leva ao wizard com o item no pedido', async () => {
    renderLanding();

    const section = await itemsSection();
    const link = within(section).getByRole('link', { name: /Decoração casamento 1/ });

    expect(link).toHaveAttribute('href', `/reservar?item=${ITEMS[0]!.id}`);
    expect(within(link).getByText('R$ 350,00')).toBeVisible();
  });

  it('filtra por categoria', async () => {
    const user = userEvent.setup();
    renderLanding();

    const section = await itemsSection();
    await user.click(within(section).getByRole('button', { name: 'Chá de bebê' }));

    expect(within(section).getByRole('button', { name: 'Chá de bebê' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(section).getAllByRole('listitem')).toHaveLength(3);
    expect(
      within(section).queryByRole('heading', { name: 'Decoração casamento 1' }),
    ).not.toBeInTheDocument();
  });

  it('mostra oito, revela o resto sob pedido e deixa de fora o item sem estoque', async () => {
    const user = userEvent.setup();
    renderLanding();

    const section = await itemsSection();
    expect(within(section).getAllByRole('listitem')).toHaveLength(8);

    await user.click(within(section).getByRole('button', { name: 'Mostrar mais 1 decoração' }));

    expect(within(section).getAllByRole('listitem')).toHaveLength(9);
    expect(within(section).queryByText('Decoração chá de bebê 10')).not.toBeInTheDocument();
    // §18.1: o botão some, e o foco vai para o primeiro cartão que apareceu.
    expect(within(section).getByRole('link', { name: /Decoração chá de bebê 9/ })).toHaveFocus();
  });
});
