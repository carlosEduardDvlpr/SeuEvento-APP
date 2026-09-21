import { describe, expect, it } from 'vitest';
import {
  createItemBodySchema,
  createThemeBodySchema,
  imageUrlSchema,
  updateItemBodySchema,
} from './catalog.js';

const PALETTE = [
  { name: 'Sálvia', hex: '#A7B8A1' },
  { name: 'Palha', hex: '#D8C7A3' },
  { name: 'Madeira', hex: '#8C6A4F' },
  { name: 'Areia', hex: '#E8DCC8' },
  { name: 'Branco', hex: '#FFFFFF' },
];

describe('contratos do catálogo', () => {
  /**
   * A semântica de PATCH do painel depende disto: campo ausente tem de sair
   * **ausente** do resultado, e não como `undefined` explícito. É o que faz o
   * Prisma entender "não mexer" em vez de tentar gravar nulo.
   */
  it('não inventa chave para campo que não veio no corpo', () => {
    const parsed = updateItemBodySchema.parse({ name: 'Painel novo' });

    expect(Object.keys(parsed)).toEqual(['name']);
  });

  it('campo esvaziado no formulário vira nulo', () => {
    const parsed = updateItemBodySchema.parse({ description: '   ' });

    expect(parsed.description).toBeNull();
  });

  it('nulo explícito também limpa o campo', () => {
    const parsed = updateItemBodySchema.parse({ assemblyNotes: null });

    expect(parsed.assemblyNotes).toBeNull();
  });

  it('aplica os padrões na criação', () => {
    const parsed = createItemBodySchema.parse({
      categoryId: '00000000-0000-4000-8000-000000000000',
      name: 'Painel de balões',
      priceCents: 12000,
      stock: 3,
    });

    expect(parsed).toMatchObject({
      description: null,
      imageUrl: null,
      assemblyNotes: null,
      themeIds: [],
      sortOrder: 0,
      active: true,
    });
  });

  /*
   * O endereço da imagem termina em `src` de `<img>`. Aceitar qualquer string
   * deixaria um `javascript:` entrar no HTML por um campo de formulário.
   */
  it('aceita http, https e caminho do próprio site', () => {
    expect(imageUrlSchema.parse('https://exemplo.com/a.webp')).toBe('https://exemplo.com/a.webp');
    expect(imageUrlSchema.parse('/imagens/a.webp')).toBe('/imagens/a.webp');
  });

  it('recusa endereço com outro esquema', () => {
    expect(imageUrlSchema.safeParse('javascript:alert(1)').success).toBe(false);
    expect(imageUrlSchema.safeParse('data:image/png;base64,AAAA').success).toBe(false);
    expect(imageUrlSchema.safeParse('imagens/a.webp').success).toBe(false);
  });

  it('exige exatamente cinco cores na paleta do estilo', () => {
    const base = { name: 'Rústico Boho', palette: PALETTE };

    expect(createThemeBodySchema.safeParse(base).success).toBe(true);
    expect(
      createThemeBodySchema.safeParse({ ...base, palette: [...PALETTE, PALETTE[0]] }).success,
    ).toBe(false);
  });
});
