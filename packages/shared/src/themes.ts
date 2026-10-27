/**
 * Estilos de festa do seed (§15.2).
 *
 * A lista é a referência do que o seed cria, e os testes do seed conferem as duas
 * pontas. Os temas de verdade vivem no banco: o admin pode editar, desativar e
 * criar outros, e o catálogo nunca é filtrado por esta constante.
 */
export const SEEDED_THEME_SLUGS = [
  'rustico-boho',
  'jardim-provencal',
  'tropical',
  'safari-selva',
  'circo-carrossel',
  'fundo-do-mar',
  'nuvens-e-estrelas',
  'cha-revelacao',
  'festa-junina',
  'elegante-esmeralda',
  'boteco-churrasco',
  'cores-doces',
] as const;

export type SeededThemeSlug = (typeof SEEDED_THEME_SLUGS)[number];
