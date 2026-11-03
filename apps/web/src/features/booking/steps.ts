import type { BookingKind } from '@chacara/shared';

/**
 * Passos do wizard (§13.2).
 *
 * O passo vive na **URL** (`?step=data`), e não só em estado de componente,
 * porque a §13.2 exige que o botão voltar do navegador funcione. No celular esse
 * botão é o gesto de voltar do sistema, e um wizard que ignora isso faz a pessoa
 * sair da página inteira sem querer.
 *
 * Desde novembro de 2026, a pedido do dono, cada pergunta é um passo: o que
 * reservar, a data, os convidados, a decoração e, no fim, a revisão. Quais passos
 * existem depende do pedido: a decoração sozinha não recebe convidados, e quem
 * chegou pelo cartão de uma decoração na landing já disse o que quer reservar.
 */

export const WIZARD_STEPS = ['tipo', 'data', 'convidados', 'decoracao', 'revisao'] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number];

export const STEP_LABELS: Record<WizardStep, string> = {
  tipo: 'Tipo',
  data: 'Data',
  convidados: 'Convidados',
  decoracao: 'Decoração',
  revisao: 'Revisão',
};

const VENUE_STEPS: readonly WizardStep[] = WIZARD_STEPS;
const DECORATION_STEPS: readonly WizardStep[] = ['tipo', 'data', 'decoracao', 'revisao'];
const DECORATION_FROM_LANDING_STEPS: readonly WizardStep[] = ['data', 'decoracao', 'revisao'];

/**
 * Os passos de antes de novembro de 2026, que ainda podem estar no histórico do
 * navegador ou num link salvo. Um `Map`, e não um objeto: `?step=constructor`
 * acharia o construtor de `Object` num objeto literal.
 */
const LEGACY_STEPS = new Map<string, WizardStep>([
  ['datas', 'data'],
  ['itens', 'decoracao'],
]);

export function isWizardStep(value: string | null): value is WizardStep {
  return value !== null && (WIZARD_STEPS as readonly string[]).includes(value);
}

/** Passo pedido na URL, ou `null` quando o valor não serve. */
export function parseStep(value: string | null): WizardStep | null {
  if (isWizardStep(value)) return value;
  return value === null ? null : (LEGACY_STEPS.get(value) ?? null);
}

/**
 * Os passos do pedido, na ordem.
 *
 * `kindLocked` é o pedido que nasceu no cartão de uma decoração da landing: a
 * pessoa está alugando a decoração, e perguntar de novo o que ela quer reservar
 * seria um passo à toa.
 */
export function stepsFor(kind: BookingKind, kindLocked: boolean): readonly WizardStep[] {
  if (kind === 'VENUE') return VENUE_STEPS;
  return kindLocked ? DECORATION_FROM_LANDING_STEPS : DECORATION_STEPS;
}
