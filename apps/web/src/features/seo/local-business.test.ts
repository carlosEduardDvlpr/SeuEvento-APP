import type { PublicVenue } from '@chacara/shared';
import { describe, expect, it } from 'vitest';
import { absoluteImageUrl, localBusinessJsonLd } from './local-business';

const FULL: PublicVenue = {
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

const EMPTY: PublicVenue = {
  ...FULL,
  whatsapp: null,
  address: null,
  mapsUrl: null,
  houseRules: null,
};

describe('localBusinessJsonLd', () => {
  it('declara o tipo e a capacidade', () => {
    const data = localBusinessJsonLd(FULL);

    expect(data['@context']).toBe('https://schema.org');
    expect(data['@type']).toBe('LocalBusiness');
    expect(data.name).toBe('Chácara Seu Evento');
    expect(data.maximumAttendeeCapacity).toBe(120);
  });

  it('leva endereço, telefone e mapa quando o painel tem', () => {
    const data = localBusinessJsonLd(FULL, {
      url: 'https://chacara.exemplo.com.br',
      imageUrl: 'https://chacara.exemplo.com.br/hero.webp',
    });

    expect(data.address).toBe('Estrada do Sol, 100 — Zona Rural');
    expect(data.telephone).toBe('(11) 98888-7777');
    expect(data.hasMap).toBe('https://maps.exemplo.com/chacara');
    expect(data.url).toBe('https://chacara.exemplo.com.br');
    expect(data.image).toBe('https://chacara.exemplo.com.br/hero.webp');
  });

  /*
   * O essencial do bloco: dado estruturado vazio é pior que ausente. Uma chave
   * com `null` ou `""` faz o Google tratar o resto como pouco confiável.
   */
  it('omite a chave quando não há dado, em vez de mandar vazio', () => {
    const data = localBusinessJsonLd(EMPTY);

    expect(data).not.toHaveProperty('address');
    expect(data).not.toHaveProperty('telephone');
    expect(data).not.toHaveProperty('hasMap');
    expect(data).not.toHaveProperty('url');
    expect(data).not.toHaveProperty('image');
  });

  it('sobrevive a JSON.stringify sem chave indefinida', () => {
    const json = JSON.stringify(localBusinessJsonLd(EMPTY));

    expect(json).not.toContain('undefined');
    expect(json).not.toContain('null');
  });
});

describe('absoluteImageUrl', () => {
  it('resolve caminho relativo sobre o domínio do site', () => {
    expect(absoluteImageUrl('/uploads/hero.webp', 'https://chacara.exemplo.com.br')).toBe(
      'https://chacara.exemplo.com.br/uploads/hero.webp',
    );
  });

  it('mantém URL que já é absoluta', () => {
    expect(absoluteImageUrl('https://cdn.exemplo.com/hero.webp', 'https://outro.com.br')).toBe(
      'https://cdn.exemplo.com/hero.webp',
    );
  });

  // O painel aceita qualquer string; `og:image` quebrado é pior que ausente.
  it('devolve undefined quando não dá para resolver', () => {
    expect(absoluteImageUrl(undefined, 'https://chacara.exemplo.com.br')).toBeUndefined();
    expect(absoluteImageUrl('', 'https://chacara.exemplo.com.br')).toBeUndefined();
    expect(absoluteImageUrl('/uploads/hero.webp', undefined)).toBeUndefined();
    expect(absoluteImageUrl('não é uma url', undefined)).toBeUndefined();
  });
});
