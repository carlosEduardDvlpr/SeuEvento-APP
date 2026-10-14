import { describe, expect, it } from 'vitest';
import { WIZARD_STEPS, isWizardStep, parseStep, stepIndex } from './steps';

describe('isWizardStep', () => {
  it('reconhece os três passos', () => {
    expect(isWizardStep('datas')).toBe(true);
    expect(isWizardStep('itens')).toBe(true);
    expect(isWizardStep('revisao')).toBe(true);
  });

  it('recusa valor desconhecido e nulo', () => {
    expect(isWizardStep('resumo')).toBe(false);
    expect(isWizardStep('')).toBe(false);
    expect(isWizardStep(null)).toBe(false);
  });
});

describe('parseStep', () => {
  it('devolve o passo pedido na URL', () => {
    expect(parseStep('itens')).toBe('itens');
  });

  /*
   * Link antigo, URL digitada errada ou `?step=` vazio não podem mostrar uma
   * tela em branco: o wizard volta para o começo, que é sempre válido.
   */
  it('cai no primeiro passo quando o valor não serve', () => {
    expect(parseStep(null)).toBe('datas');
    expect(parseStep('')).toBe('datas');
    expect(parseStep('pagamento')).toBe('datas');
  });
});

describe('stepIndex', () => {
  it('numera os passos na ordem em que aparecem', () => {
    expect(stepIndex('datas')).toBe(0);
    expect(stepIndex('itens')).toBe(1);
    expect(stepIndex('revisao')).toBe(2);
  });

  it('cobre todos os passos declarados', () => {
    expect(WIZARD_STEPS.map(stepIndex)).toEqual([0, 1, 2]);
  });
});
