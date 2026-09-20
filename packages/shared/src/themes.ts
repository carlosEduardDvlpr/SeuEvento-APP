import type { EventType } from './enums.js';

/**
 * Estilos de festa do seed (§15.2).
 *
 * A lista existe aqui só para dar nome aos slugs sugeridos abaixo. Os temas de
 * verdade vivem no banco: o admin pode editar, desativar e criar outros, e o
 * catálogo nunca é filtrado por esta constante.
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

/**
 * Sugestão de estilo por tipo de evento (§15.1), em ordem de relevância.
 *
 * Depois que o cliente escolhe o tipo de evento no passo 1, o passo 2 mostra
 * estes estilos primeiro. Os demais continuam acessíveis: isto ordena, não
 * restringe. `OTHER` fica vazio de propósito, para cair na ordem do admin.
 */
export const SUGGESTED_THEMES_BY_EVENT: Record<EventType, readonly string[]> = {
  BIRTHDAY_KIDS: ['circo-carrossel', 'safari-selva', 'fundo-do-mar', 'cores-doces', 'tropical'],
  BIRTHDAY_ADULT: ['elegante-esmeralda', 'boteco-churrasco', 'tropical', 'rustico-boho'],
  BABY_SHOWER: ['nuvens-e-estrelas', 'rustico-boho', 'safari-selva', 'cores-doces'],
  GENDER_REVEAL: ['cha-revelacao', 'nuvens-e-estrelas'],
  BRIDAL_SHOWER: ['jardim-provencal', 'rustico-boho', 'cores-doces'],
  WEDDING: ['jardim-provencal', 'rustico-boho', 'elegante-esmeralda'],
  GRADUATION: ['elegante-esmeralda', 'tropical'],
  GET_TOGETHER: ['boteco-churrasco', 'festa-junina', 'tropical'],
  OTHER: [],
};
