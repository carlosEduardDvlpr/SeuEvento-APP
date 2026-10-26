import type { Combo, GalleryImage, PublicVenue, Theme } from '@chacara/shared';
import { StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, createQueryClient } from './app/providers';
import { applySeed } from './app/query-seed';
import { AppRouter } from './app/router';
import { renderLanding } from './entry-server';
import { jsonResponse } from '../test/helpers/render';

/**
 * Pré-renderização da landing (§18.3, camada 3).
 *
 * O teste do meio é o que justifica o arquivo: ele **hidrata** o HTML gerado
 * pelo build e cobra que o React não reclame de divergência. Sem isso, a
 * pré-renderização seria uma aposta — bastaria um componente ler a hora ou o
 * `localStorage` no corpo para o React jogar fora o HTML inteiro e desenhar
 * tudo de novo, e o único sinal seria um aviso no console de quem visita.
 */

const VENUE: PublicVenue = {
  name: 'Chácara Seu Evento',
  maxGuests: 120,
  checkInTime: '08:00',
  checkOutTime: '22:00',
  whatsapp: '(11) 98888-7777',
  address: 'Estrada do Sol, 100 — Zona Rural',
  mapsUrl: 'https://maps.google.com/?q=-23.5,-46.6',
  houseRules: 'Som até as 22h.',
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
    url: '/uploads/hero.webp',
    alt: 'Mesa comprida montada no gramado',
    caption: null,
    sortOrder: 1,
  },
  {
    id: 'g-2',
    kind: 'VENUE',
    url: '/uploads/area.webp',
    alt: 'Área coberta',
    caption: 'Mesas para 60 pessoas.',
    sortOrder: 1,
  },
  {
    id: 'g-3',
    kind: 'EVENTS',
    url: '/uploads/festa.webp',
    alt: 'Chá de bebê com painel de nuvens',
    caption: 'Chá de bebê da Lia',
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
    description: 'Painel, mesa e luzes.',
    imageUrl: null,
    themeId: 't-1',
    discountType: 'PERCENT',
    discountValue: 10,
    items: [],
    itemsTotalCents: 50000,
    discountCents: 5000,
    priceCents: 45000,
  },
];

const ITEMS = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Decoração casamento 1',
    description: null,
    imageUrl: '/catalogo/casamento/1.jpg',
    priceCents: 40000,
    stock: 1,
    assemblyNotes: null,
    sortOrder: 1,
    category: { id: 'cat-1', name: 'Casamento', sortOrder: 0 },
    themeIds: [],
  },
];

const SEED = { venue: VENUE, gallery: GALLERY, themes: THEMES, combos: COMBOS, items: ITEMS };
const SITE_URL = 'https://chacara.exemplo.com.br';

beforeEach(() => {
  // A disponibilidade é buscada depois da hidratação; sem o stub, o fetch do
  // jsdom tentaria a rede de verdade.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(jsonResponse({ days: [] }))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('renderLanding', () => {
  it('entrega a landing com o conteúdo real no HTML', () => {
    const page = renderLanding({ ...SEED, siteUrl: SITE_URL });

    // É isto que o rastreador e o leitor de cartão veem sem executar nada.
    expect(page.html).toContain('<h1');
    expect(page.html).toContain('Chácara Seu Evento');
    expect(page.html).toContain('Rústico Boho');
    expect(page.html).toContain('Combo Nuvens');
    expect(page.html).toContain('Decoração casamento 1');

    expect(page.title).toBe('Chácara Seu Evento — chácara para festas e decoração pegue e monte');
    expect(page.canonical).toBe('https://chacara.exemplo.com.br/');
    expect(page.ogImage).toBe('https://chacara.exemplo.com.br/uploads/hero.webp');
    expect(JSON.parse(page.jsonLd)).toMatchObject({
      '@type': 'LocalBusiness',
      address: 'Estrada do Sol, 100 — Zona Rural',
      telephone: '(11) 98888-7777',
    });
  });

  it('hidrata sem divergência', async () => {
    const page = renderLanding({ ...SEED, siteUrl: SITE_URL });

    const container = document.createElement('div');
    container.id = 'root';
    container.innerHTML = page.html;
    document.body.append(container);

    const errors: unknown[][] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args);
    });

    const client = createQueryClient();
    applySeed(client, JSON.parse(page.seed));

    await act(async () => {
      hydrateRoot(
        container,
        <StrictMode>
          <AppProviders client={client}>
            <AppRouter />
          </AppProviders>
        </StrictMode>,
      );
    });

    const complaints = errors
      .map((args) => args.map(String).join(' '))
      .filter((message) => /hydrat|did not match|server render/i.test(message));

    expect(complaints).toEqual([]);

    container.remove();
  });

  /*
   * A disponibilidade fica fora do pacote de dados de propósito (§18.3): vinda
   * do build, mostraria data livre que já pode ter dono. O hero leva ao
   * calendário do wizard em vez de mostrar datas, então nada no HTML depende da
   * agenda.
   */
  it('não congela a agenda no HTML', () => {
    const page = renderLanding({ ...SEED, siteUrl: SITE_URL });

    expect(page.html).toContain('Reservar uma data');
    expect(page.html).not.toContain('Consultando a agenda');
    expect(JSON.parse(page.seed)).not.toHaveProperty('availability');
  });
});
