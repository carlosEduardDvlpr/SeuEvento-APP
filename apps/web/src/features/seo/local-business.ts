import type { PublicVenue } from '@chacara/shared';

/**
 * JSON-LD `LocalBusiness` da §18.3.
 *
 * É a camada que mais ajuda numa busca local ("chácara para festa em tal
 * cidade"), porque entrega endereço e telefone já estruturados em vez de
 * esperar que o Google os adivinhe no meio do texto.
 *
 * Regra que vale para tudo aqui: **campo sem dado não aparece**. Emitir
 * `"telephone": ""` ou um endereço pela metade é pior que omitir — dado
 * estruturado errado derruba a confiança no resto do bloco.
 */
export type LocalBusinessOptions = {
  /** Endereço público do site, sem barra no fim. Omitido quando não se sabe. */
  url?: string | undefined;
  /** Foto de destaque já resolvida para URL absoluta. */
  imageUrl?: string | undefined;
};

export function localBusinessJsonLd(
  venue: PublicVenue,
  { url, imageUrl }: LocalBusinessOptions = {},
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: venue.name,
    description:
      'Aluguel de chácara por dia para festas, com decoração pegue e monte: o cliente retira os itens e monta a decoração.',

    /*
     * `maximumAttendeeCapacity` é propriedade de `Place`, que `LocalBusiness`
     * herda — e é o único número do catálogo que não muda por data, então pode
     * sair daqui sem virar promessa de preço.
     */
    maximumAttendeeCapacity: venue.maxGuests,

    ...(url ? { url } : {}),
    ...(imageUrl ? { image: imageUrl } : {}),

    /*
     * O endereço é texto livre no painel (uma linha só), então vai como `Text`.
     * `PostalAddress` exigiria rua, cidade, estado e CEP separados; preenchê-lo
     * com a linha inteira em `streetAddress` seria inventar uma estrutura que o
     * dado não tem.
     */
    ...(venue.address ? { address: venue.address } : {}),
    ...(venue.whatsapp ? { telephone: venue.whatsapp } : {}),
    ...(venue.mapsUrl ? { hasMap: venue.mapsUrl } : {}),
  };
}

/**
 * Transforma a URL da imagem cadastrada em absoluta.
 *
 * O painel aceita qualquer string, e caminho relativo é comum. `og:image`
 * relativo é ignorado pelos leitores de cartão, então ou resolve ou não entra.
 */
export function absoluteImageUrl(
  url: string | undefined,
  base: string | undefined,
): string | undefined {
  if (!url) return undefined;

  try {
    return new URL(url, base || undefined).href;
  } catch {
    return undefined;
  }
}
