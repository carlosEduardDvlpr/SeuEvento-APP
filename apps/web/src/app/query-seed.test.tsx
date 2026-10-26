import type { CatalogItem, Combo, GalleryImage, PublicVenue, Theme } from '@chacara/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { LandingPage } from '@/features/landing/LandingPage';
import { jsonResponse } from '../../test/helpers/render';
import { applySeed, readSeed, SEED_GLOBAL } from './query-seed';

/**
 * Pacote de dados da landing pré-renderizada (§18.3, camada 3).
 *
 * O teste que importa é o primeiro: ele cobra que as chaves daqui sejam as
 * mesmas dos hooks. Errar uma chave não dá erro em lugar nenhum — a landing
 * simplesmente refaz as requisições e todo o ganho desaparece em silêncio.
 */

const VENUE: PublicVenue = {
  name: 'Chácara Seu Evento',
  maxGuests: 120,
  checkInTime: '08:00',
  checkOutTime: '22:00',
  whatsapp: '(11) 98888-7777',
  address: 'Estrada do Sol, 100',
  mapsUrl: 'https://maps.exemplo.com/chacara',
  houseRules: 'Som até 22h.',
  minDays: 1,
  maxDays: 3,
  minLeadDays: 2,
  freeCancelUntilDays: 7,
  holdHours: 48,
};

const GALLERY: GalleryImage[] = [
  {
    id: 'g-1',
    kind: 'HERO',
    url: 'https://exemplo.com/hero.webp',
    alt: 'Mesa comprida montada no gramado',
    caption: null,
    sortOrder: 1,
  },
];

const THEMES: Theme[] = [
  {
    id: 't-1',
    slug: 'rustico-boho',
    name: 'Rústico Boho',
    tagline: 'Madeira, linho e capim-dos-pampas.',
    description: null,
    palette: [{ name: 'Sálvia', hex: '#A7B8A1' }],
    coverImageUrl: null,
    sortOrder: 1,
  },
];

const COMBOS: Combo[] = [
  {
    id: 'c-1',
    name: 'Combo Nuvens',
    description: null,
    imageUrl: null,
    themeId: null,
    discountType: 'PERCENT',
    discountValue: 10,
    items: [],
    itemsTotalCents: 0,
    discountCents: 0,
    priceCents: 0,
  },
];

const ITEMS: CatalogItem[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Decoração casamento 1',
    description: null,
    imageUrl: '/catalogo/casamento/1.jpg',
    priceCents: 40_000,
    stock: 1,
    assemblyNotes: null,
    sortOrder: 1,
    category: { id: 'cat-1', name: 'Casamento', sortOrder: 0 },
    themeIds: [],
  },
];

const SEED = { venue: VENUE, gallery: GALLERY, themes: THEMES, combos: COMBOS, items: ITEMS };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('applySeed', () => {
  it('deixa a landing pronta sem nenhuma requisição', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        urls.push(url);
        return Promise.resolve(jsonResponse([]));
      }),
    );

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    applySeed(client, SEED);

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/']}>
          <LandingPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // A landing já desenha com o conteúdo, sem passar pelo estado de carregamento.
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Rústico Boho')).toBeInTheDocument();
    expect(screen.getByText('Decoração casamento 1')).toBeInTheDocument();

    /*
     * Nenhuma requisição, nem a da agenda. A disponibilidade continua fora do
     * pacote de propósito (depende de hoje e do que já foi reservado), mas a
     * landing nem a consulta: o hero leva ao calendário do wizard, que pede a
     * agenda na hora. O pedido de montagem sai durante o `render`, então a lista
     * já estaria preenchida aqui.
     */
    expect(urls).toEqual([]);
  });
});

describe('readSeed', () => {
  it('lê o pacote da global', () => {
    expect(readSeed({ [SEED_GLOBAL]: SEED })).toEqual(SEED);
  });

  it('devolve null quando não há pacote', () => {
    expect(readSeed({})).toBeNull();
    expect(readSeed({ [SEED_GLOBAL]: null })).toBeNull();
    expect(readSeed({ [SEED_GLOBAL]: 'texto' })).toBeNull();
  });

  // HTML velho em cache com o formato antigo não pode virar hidratação quebrada.
  it('recusa pacote incompleto', () => {
    expect(readSeed({ [SEED_GLOBAL]: { venue: VENUE } })).toBeNull();
    expect(readSeed({ [SEED_GLOBAL]: { ...SEED, themes: undefined } })).toBeNull();
    expect(readSeed({ [SEED_GLOBAL]: { ...SEED, venue: undefined } })).toBeNull();
    // Pacote de antes da vitrine de itens: a landing busca da rede em vez de quebrar.
    expect(readSeed({ [SEED_GLOBAL]: { ...SEED, items: undefined } })).toBeNull();
  });
});
