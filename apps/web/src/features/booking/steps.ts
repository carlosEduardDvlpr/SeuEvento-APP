/**
 * Passos do wizard (§13.2).
 *
 * O passo vive na **URL** (`?step=datas`), e não só em estado de componente,
 * porque a §13.2 exige que o botão voltar do navegador funcione. No celular esse
 * botão é o gesto de voltar do sistema, e um wizard que ignora isso faz a pessoa
 * sair da página inteira sem querer.
 */

export const WIZARD_STEPS = ['datas', 'itens', 'revisao'] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number];

export const STEP_LABELS: Record<WizardStep, string> = {
  datas: 'Datas',
  itens: 'Itens',
  revisao: 'Revisão',
};

export function isWizardStep(value: string | null): value is WizardStep {
  return value !== null && (WIZARD_STEPS as readonly string[]).includes(value);
}

/** Passo pedido na URL, ou o primeiro quando o valor não serve. */
export function parseStep(value: string | null): WizardStep {
  return isWizardStep(value) ? value : 'datas';
}

export function stepIndex(step: WizardStep): number {
  return WIZARD_STEPS.indexOf(step);
}
