import type { CatalogItem, GalleryImage, PublicVenue } from '@chacara/shared';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorResponse, jsonResponse, renderWithProviders } from '../../../test/helpers/render';
import { LandingPage } from './LandingPage';
import { resetRevealForTests } from './reveal';

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

/** Segunda área, para o carrossel ter para onde ir. */
const PISCINA: GalleryImage = { ...AREA, id: 'g-5', alt: 'Piscina', caption: null };

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

const CASAMENTO = { id: 'cat-casamento', name: 'Casamento', sortOrder: 0 };
const CHA_DE_BEBE = { id: 'cat-cha', name: 'Chá de bebê', sortOrder: 1 };

function vitrine(number: number, category: typeof CASAMENTO, stock = 1): CatalogItem {
  return {
    id: `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`,
    name: `Decoração ${category.name.toLowerCase()} ${number}`,
    description: null,
    imageUrl: `/catalogo/${category.id}/${number}.jpg`,
    priceCents: 35_000,
    // O mesmo valor nos dois preços é "sem promoção" (§13.1, item 5.1).
    venuePriceCents: 35_000,
    stock,
    assemblyNotes: null,
    sortOrder: number,
    category,
    themeIds: [],
  };
}

/**
 * Nove itens em duas categorias, e um décimo sem estoque, que não pode aparecer.
 * O primeiro sai mais barato junto com a chácara.
 */
const ITEMS: CatalogItem[] = [
  { ...vitrine(1, CASAMENTO), venuePriceCents: 30_000 },
  ...[2, 3, 4, 5, 6].map((number) => vitrine(number, CASAMENTO)),
  ...[7, 8, 9].map((number) => vitrine(number, CHA_DE_BEBE)),
  vitrine(10, CHA_DE_BEBE, 0),
];

type Routes = Record<string, () => Response>;

function stubFetch(routes: Routes = {}) {
  const urls: string[] = [];

  const base: Routes = {
    '/api/public/venue': () => jsonResponse(VENUE),
    '/api/gallery': () => jsonResponse([HERO, AREA, ...EVENT_PHOTOS]),
    '/api/items': () => jsonResponse(ITEMS),
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

    await screen.findByRole('heading', { name: 'Decorações' });

    const titles = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);

    // O hero não tem h2: é o h1 com uma frase e um botão.
    expect(titles).toEqual([
      'A chácara',
      'Pegue e monte: como funciona',
      // A vitrine entrou depois, a pedido do dono; estilos e combos saíram em novembro de 2026.
      'Decorações',
      'Perguntas frequentes',
      'Como chegar',
    ]);
  });

  /* Cada decoração é completa e tem os dois preços: a landing não pede mais estilos nem combos. */
  it('não busca estilos nem combos', async () => {
    const urls = renderLanding();

    await screen.findByRole('heading', { name: 'Decorações' });

    expect(urls.filter((url) => /^\/api\/(themes|combos)/.test(url))).toEqual([]);
    expect(screen.queryByText('Escolha um estilo')).not.toBeInTheDocument();
    expect(screen.queryByText('Combos que saem mais barato')).not.toBeInTheDocument();
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

    // Quando a vitrine aparece, a página inteira já montou: o pedido já teria saído.
    await screen.findByRole('heading', { name: 'Decorações' });

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

  /* Pedido do dono (novembro de 2026): as áreas num carrossel, uma foto por vez. */
  it('passa as áreas pelo carrossel, com as setas e com os pontos', async () => {
    const user = userEvent.setup();
    renderLanding({ '/api/gallery': () => jsonResponse([HERO, AREA, PISCINA]) });

    const carousel = within(await screen.findByRole('region', { name: 'Fotos da chácara' }));
    expect(carousel.getByRole('group', { name: '1 de 2' })).toHaveTextContent('Área coberta');
    // Sem fim: as setas nunca ficam desabilitadas.
    expect(carousel.getByRole('button', { name: 'Foto anterior' })).toBeEnabled();
    expect(carousel.getByRole('button', { name: 'Ver Área coberta' })).toHaveAttribute(
      'aria-current',
      'true',
    );

    await user.click(carousel.getByRole('button', { name: 'Próxima foto' }));

    expect(carousel.getByText('Foto 2 de 2: Piscina')).toBeInTheDocument();
    expect(carousel.getByRole('button', { name: 'Ver Piscina' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(carousel.getByRole('button', { name: 'Próxima foto' })).toBeEnabled();

    await user.click(carousel.getByRole('button', { name: 'Ver Área coberta' }));

    expect(carousel.getByText('Foto 1 de 2: Área coberta')).toBeInTheDocument();
  });

  it('dá a volta nas setas: da última vai para a primeira, e da primeira para a última', async () => {
    const user = userEvent.setup();
    renderLanding({ '/api/gallery': () => jsonResponse([HERO, AREA, PISCINA]) });

    const carousel = within(await screen.findByRole('region', { name: 'Fotos da chácara' }));

    await user.click(carousel.getByRole('button', { name: 'Foto anterior' }));
    expect(carousel.getByText('Foto 2 de 2: Piscina')).toBeInTheDocument();

    await user.click(carousel.getByRole('button', { name: 'Próxima foto' }));
    expect(carousel.getByText('Foto 1 de 2: Área coberta')).toBeInTheDocument();

    // Duas voltas inteiras para a frente, passando pelas cópias das pontas.
    for (const expected of [
      'Foto 2 de 2: Piscina',
      'Foto 1 de 2: Área coberta',
      'Foto 2 de 2: Piscina',
      'Foto 1 de 2: Área coberta',
    ]) {
      await user.click(carousel.getByRole('button', { name: 'Próxima foto' }));
      expect(carousel.getByText(expected)).toBeInTheDocument();
    }
  });

  /* As cópias que dão a volta são só para os olhos: cada área existe uma vez para o resto. */
  it('esconde do leitor de tela e do teclado as cópias da volta', async () => {
    renderLanding({ '/api/gallery': () => jsonResponse([HERO, AREA, PISCINA]) });

    const region = await screen.findByRole('region', { name: 'Fotos da chácara' });
    const slides = [...region.querySelectorAll('[aria-roledescription="foto"]')];
    const clones = slides.filter((slide) => slide.hasAttribute('inert'));

    expect(slides).toHaveLength(6);
    expect(clones).toHaveLength(4);
    clones.forEach((clone) => expect(clone).toHaveAttribute('aria-hidden', 'true'));
    expect(within(region).getAllByRole('group')).toHaveLength(2);
    expect(within(region).getAllByRole('heading', { name: 'Piscina' })).toHaveLength(1);
  });

  it('com uma área só, mostra a foto sem setas nem pontos', async () => {
    renderLanding();

    const carousel = within(await screen.findByRole('region', { name: 'Fotos da chácara' }));
    expect(carousel.getByRole('heading', { name: 'Área coberta' })).toBeVisible();
    expect(carousel.queryByRole('button', { name: 'Próxima foto' })).not.toBeInTheDocument();
    expect(carousel.queryByRole('button', { name: 'Pausar as fotos' })).not.toBeInTheDocument();
  });

  /*
   * Troca automática a cada 2 segundos, pedido do dono (§14.8, a exceção dele).
   *
   * O jsdom não tem `IntersectionObserver`: aqui ele é trocado por um que diz que
   * a faixa está toda na tela assim que passa a ser observada.
   */
  describe('troca automática', () => {
    class OnScreenObserver {
      readonly callback: IntersectionObserverCallback;

      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback;
      }

      observe(target: Element) {
        this.callback(
          [{ target, isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
      }

      unobserve() {}

      disconnect() {}

      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    }

    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
      vi.useRealTimers();
      // A entrada dos blocos guarda o observador da página: o de mentira não pode sobrar.
      resetRevealForTests();
    });

    async function renderCarousel() {
      renderLanding({ '/api/gallery': () => jsonResponse([HERO, AREA, PISCINA]) });
      return within(await screen.findByRole('region', { name: 'Fotos da chácara' }));
    }

    function wait(ms: number) {
      return act(() => vi.advanceTimersByTimeAsync(ms));
    }

    it('passa sozinha a cada 2 segundos e, da última, volta para a primeira', async () => {
      vi.stubGlobal('IntersectionObserver', OnScreenObserver);
      const carousel = await renderCarousel();

      const live = carousel.getByText('Foto 1 de 2: Área coberta');
      // Enquanto passa sozinha, o leitor de tela não é avisado de cada troca.
      await waitFor(() => expect(live).toHaveAttribute('aria-live', 'off'));

      await wait(2000);
      expect(live).toHaveTextContent('Foto 2 de 2: Piscina');
      expect(carousel.getByRole('button', { name: 'Ver Piscina' })).toHaveAttribute(
        'aria-current',
        'true',
      );

      await wait(2000);
      expect(live).toHaveTextContent('Foto 1 de 2: Área coberta');
    });

    it('para no botão de pausa, e o mesmo botão volta a passar as fotos', async () => {
      vi.stubGlobal('IntersectionObserver', OnScreenObserver);
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const carousel = await renderCarousel();
      const live = carousel.getByText('Foto 1 de 2: Área coberta');
      await waitFor(() => expect(live).toHaveAttribute('aria-live', 'off'));

      await user.click(carousel.getByRole('button', { name: 'Pausar as fotos' }));
      // O ponteiro e o foco em cima do carrossel também seguram a troca: aqui, quem segura é o botão.
      await user.click(document.body);
      await wait(4000);

      expect(live).toHaveTextContent('Foto 1 de 2: Área coberta');
      expect(live).toHaveAttribute('aria-live', 'polite');

      await user.click(carousel.getByRole('button', { name: 'Passar as fotos sozinhas' }));
      await user.click(document.body);
      await wait(2000);

      expect(live).toHaveTextContent('Foto 2 de 2: Piscina');
      expect(carousel.getByRole('button', { name: 'Pausar as fotos' })).toBeInTheDocument();
    });

    it('recomeça a contagem quando a pessoa troca a foto', async () => {
      vi.stubGlobal('IntersectionObserver', OnScreenObserver);
      const carousel = await renderCarousel();
      const live = carousel.getByText('Foto 1 de 2: Área coberta');
      await waitFor(() => expect(live).toHaveAttribute('aria-live', 'off'));

      await wait(1500);
      // Clique nativo de propósito: sem ponteiro nem foco, que também segurariam a troca.
      act(() => carousel.getByRole('button', { name: 'Próxima foto' }).click());
      expect(live).toHaveTextContent('Foto 2 de 2: Piscina');

      // A troca automática, que viria em 500 ms, agora só vem 2 segundos depois do clique.
      await wait(1000);
      expect(live).toHaveTextContent('Foto 2 de 2: Piscina');

      await wait(1000);
      expect(live).toHaveTextContent('Foto 1 de 2: Área coberta');
    });

    it('não passa sozinha quando o navegador não sabe dizer se o carrossel está na tela', async () => {
      const carousel = await renderCarousel();

      await wait(4000);

      expect(carousel.getByText('Foto 1 de 2: Área coberta')).toHaveAttribute(
        'aria-live',
        'polite',
      );
    });

    it('não passa sozinha para quem pede menos movimento, e aí nem oferece a pausa', async () => {
      vi.stubGlobal('IntersectionObserver', OnScreenObserver);
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        addEventListener: () => {},
        removeEventListener: () => {},
      }));
      const carousel = await renderCarousel();

      await wait(4000);

      expect(carousel.getByText('Foto 1 de 2: Área coberta')).toBeInTheDocument();
      expect(carousel.queryByRole('button', { name: 'Pausar as fotos' })).not.toBeInTheDocument();
    });
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

    await screen.findByRole('heading', { name: 'Decorações' });

    expect(screen.queryByText('Festas que já aconteceram aqui')).not.toBeInTheDocument();
    expect(screen.queryByAltText('Chá de bebê com painel de nuvens')).not.toBeInTheDocument();
    expect(screen.queryByAltText('Casamento no gramado')).not.toBeInTheDocument();
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

  it('responde o cancelamento com o prazo configurado', async () => {
    const user = userEvent.setup();
    renderLanding();

    await openQuestion(user, /Consigo cancelar/);

    expect(screen.getByText(/até 7 dias antes do início/)).toBeVisible();
  });

  /* Aviso do dono, em destaque, nos dois casos de prazo. */
  it('avisa que o sinal não é devolvido', async () => {
    const user = userEvent.setup();
    renderLanding({
      '/api/public/venue': () => jsonResponse({ ...VENUE, freeCancelUntilDays: 0 }),
    });

    await openQuestion(user, /Consigo cancelar/);

    expect(screen.getByText('O valor do sinal não é devolvido.')).toBeVisible();
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
  /*
   * Pedido do dono: o mapa embutido é a ficha do lugar no Google, e não mais a
   * busca pelo endereço. Só carrega quando a pessoa chega perto da seção, que é
   * a última da página. O link "Abrir no mapa" saiu junto: a ficha já leva ao
   * Google Maps.
   */
  it('mostra a ficha da chácara no Google, carregada sob demanda', async () => {
    renderLanding();

    const map = await screen.findByTitle('Mapa com a localização de Chácara Seu Evento');

    expect(map).toHaveAttribute(
      'src',
      expect.stringMatching(/^https:\/\/www\.google\.com\/maps\/embed\?pb=/),
    );
    expect(map).toHaveAttribute('loading', 'lazy');
    expect(screen.queryByRole('link', { name: 'Abrir no mapa' })).not.toBeInTheDocument();
  });

  it('fica sem mapa quando não há endereço', async () => {
    renderLanding({
      '/api/public/venue': () => jsonResponse({ ...VENUE, address: null, mapsUrl: null }),
    });

    await screen.findByText('Como chegar');
    expect(screen.queryByTitle(/Mapa com a localização/)).not.toBeInTheDocument();
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
});

/*
 * Vitrine de decorações: pedido do dono, e desde novembro de 2026 cada item é
 * uma decoração completa, com o preço avulso e o preço com a chácara.
 */
describe('vitrine de itens', () => {
  async function itemsSection() {
    const heading = await screen.findByRole('heading', { name: 'Decorações' });
    return heading.closest('section')!;
  }

  it('mostra as decorações cadastradas', async () => {
    renderLanding();

    const section = await itemsSection();

    expect(within(section).getByRole('heading', { name: 'Decoração casamento 1' })).toBeVisible();
  });

  it('some quando ainda não há item', async () => {
    renderLanding({ '/api/items': () => jsonResponse([]) });

    // A galeria chega na mesma rodada de requisições: a vitrine já teria aparecido.
    await screen.findByAltText('Mesa comprida montada no gramado ao fim da tarde');
    expect(screen.queryByRole('heading', { name: 'Decorações' })).not.toBeInTheDocument();
  });

  it('mostra o preço e leva ao wizard com o item no pedido', async () => {
    renderLanding();

    const section = await itemsSection();
    const link = within(section).getByRole('link', { name: /Decoração casamento 1/ });

    expect(link).toHaveAttribute('href', `/reservar?item=${ITEMS[0]!.id}`);
    expect(within(link).getByText('R$ 350,00')).toBeVisible();
  });

  it('mostra o preço com a chácara quando ele é menor que o avulso', async () => {
    renderLanding();

    const section = await itemsSection();
    const promo = within(section).getByRole('link', { name: /Decoração casamento 1/ });
    const regular = within(section).getByRole('link', { name: /Decoração casamento 2/ });

    expect(within(promo).getByText(/com a chácara/)).toHaveTextContent('R$ 300,00 com a chácara');
    // Os dois preços iguais: sem promoção, a segunda linha só repetiria o preço.
    expect(within(regular).queryByText(/com a chácara/)).not.toBeInTheDocument();
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
