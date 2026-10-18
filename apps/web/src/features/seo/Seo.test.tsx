import type { GalleryImage, PublicVenue } from '@chacara/shared';
import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderWithProviders } from '../../../test/helpers/render';
import { Seo } from './Seo';

/**
 * §18.3, camadas 1 e 4 em tempo de execução.
 *
 * O `<head>` do jsdom é compartilhado por todos os testes do arquivo, então cada
 * um começa limpando o que o anterior escreveu — senão um `noindex` esquecido
 * faria o teste seguinte passar por engano.
 */

const VENUE: PublicVenue = {
  name: 'Chácara Seu Evento',
  maxGuests: 120,
  checkInTime: '08:00',
  checkOutTime: '22:00',
  whatsapp: '(11) 98888-7777',
  address: 'Estrada do Sol, 100 — Zona Rural',
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
  url: '/uploads/hero.webp',
  alt: 'Mesa comprida montada no gramado',
  caption: null,
  sortOrder: 1,
};

function stubFetch() {
  const urls: string[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      urls.push(url);

      if (url.startsWith('/api/public/venue')) return Promise.resolve(jsonResponse(VENUE));
      if (url.startsWith('/api/gallery')) return Promise.resolve(jsonResponse([HERO]));

      return Promise.resolve(jsonResponse([]));
    }),
  );

  return urls;
}

function metaByName(name: string) {
  return document.head.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ?? null;
}

function metaByProperty(property: string) {
  return (
    document.head.querySelector(`meta[property="${property}"]`)?.getAttribute('content') ?? null
  );
}

function jsonLd() {
  const tag = document.head.querySelector('script[data-seo="local-business"]');
  return tag?.textContent ? (JSON.parse(tag.textContent) as Record<string, unknown>) : null;
}

beforeEach(() => {
  document.head.innerHTML = '';
  document.title = '';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Seo', () => {
  it('escreve título e descrição com os dados reais da chácara', async () => {
    stubFetch();
    renderWithProviders(<Seo />, { route: '/', withAuth: false });

    await waitFor(() =>
      expect(document.title).toBe(
        'Chácara Seu Evento — chácara para festas e decoração pegue e monte',
      ),
    );

    expect(metaByName('description')).toContain('até 120 pessoas');
  });

  /*
   * O domínio vem de `window.location`, não de variável de ambiente: canônica
   * apontando para o domínio errado é capaz de tirar o site do índice.
   */
  it('aponta canonical e og:url para a URL em que o site está rodando', async () => {
    stubFetch();
    renderWithProviders(<Seo />, { route: '/termos', withAuth: false });

    const expected = `${window.location.origin}/termos`;

    await waitFor(() =>
      expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
        expected,
      ),
    );

    expect(metaByProperty('og:url')).toBe(expected);
  });

  it('marca noindex nas rotas que não respondem a busca', async () => {
    stubFetch();
    renderWithProviders(<Seo />, { route: '/reservar', withAuth: false });

    await waitFor(() => expect(metaByName('robots')).toBe('noindex, nofollow'));
  });

  it.each(['/minhas-reservas', '/reservas/abc', '/admin/reservas', '/entrar'])(
    'marca noindex em %s',
    async (route) => {
      stubFetch();
      renderWithProviders(<Seo />, { route, withAuth: false });

      await waitFor(() => expect(metaByName('robots')).toBe('noindex, nofollow'));
    },
  );

  it('não deixa robots na landing', async () => {
    // Começa sujo de propósito: o componente tem de limpar, não só evitar.
    const stale = document.createElement('meta');
    stale.setAttribute('name', 'robots');
    stale.setAttribute('content', 'noindex, nofollow');
    document.head.append(stale);

    stubFetch();
    renderWithProviders(<Seo />, { route: '/', withAuth: false });

    await waitFor(() => expect(metaByName('robots')).toBeNull());
  });

  it('reescreve o JSON-LD com endereço e telefone do painel', async () => {
    stubFetch();
    renderWithProviders(<Seo />, { route: '/', withAuth: false });

    await waitFor(() => expect(jsonLd()).not.toBeNull());

    expect(jsonLd()).toMatchObject({
      '@type': 'LocalBusiness',
      name: 'Chácara Seu Evento',
      address: 'Estrada do Sol, 100 — Zona Rural',
      telephone: '(11) 98888-7777',
      maximumAttendeeCapacity: 120,
    });
  });

  it('usa a foto de destaque como og:image, em URL absoluta', async () => {
    stubFetch();
    renderWithProviders(<Seo />, { route: '/', withAuth: false });

    await waitFor(() =>
      expect(metaByProperty('og:image')).toBe(`${window.location.origin}/uploads/hero.webp`),
    );
  });

  /*
   * A galeria serve ao cartão de compartilhamento, e página com `noindex` não é
   * compartilhada. Buscá-la na tela de login seria uma requisição pelo nada.
   */
  it('não busca a galeria em rota fora do índice', async () => {
    const urls = stubFetch();
    renderWithProviders(<Seo />, { route: '/entrar', withAuth: false });

    await waitFor(() => expect(metaByName('robots')).toBe('noindex, nofollow'));

    expect(urls.some((url) => url.startsWith('/api/gallery'))).toBe(false);
    expect(urls.some((url) => url.startsWith('/api/public/venue'))).toBe(true);
  });

  // Um `LocalBusiness` só: dois blocos seriam duas respostas para a mesma pergunta.
  it('substitui o esqueleto do index.html em vez de acrescentar um bloco', async () => {
    const skeleton = document.createElement('script');
    skeleton.setAttribute('type', 'application/ld+json');
    skeleton.setAttribute('data-seo', 'local-business');
    skeleton.textContent = '{"@type":"LocalBusiness","name":"Chácara para festas"}';
    document.head.append(skeleton);

    stubFetch();
    renderWithProviders(<Seo />, { route: '/', withAuth: false });

    await waitFor(() => expect(jsonLd()).toMatchObject({ name: 'Chácara Seu Evento' }));

    expect(document.head.querySelectorAll('script[data-seo="local-business"]')).toHaveLength(1);
  });
});
