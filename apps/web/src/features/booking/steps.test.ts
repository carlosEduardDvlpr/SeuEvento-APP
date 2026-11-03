import { describe, expect, it } from 'vitest';
import { isWizardStep, parseStep, stepsFor } from './steps';

describe('isWizardStep', () => {
  it('reconhece os cinco passos', () => {
    for (const step of ['tipo', 'data', 'convidados', 'decoracao', 'revisao']) {
      expect(isWizardStep(step)).toBe(true);
    }
  });

  it('recusa valor desconhecido e nulo', () => {
    expect(isWizardStep('resumo')).toBe(false);
    expect(isWizardStep('')).toBe(false);
    expect(isWizardStep(null)).toBe(false);
  });
});

describe('parseStep', () => {
  it('devolve o passo pedido na URL', () => {
    expect(parseStep('convidados')).toBe('convidados');
  });

  /*
   * Os passos de antes de novembro de 2026 podem estar no histórico do navegador
   * ou num link salvo: caem no passo que fazia o mesmo papel.
   */
  it('traduz os passos antigos', () => {
    expect(parseStep('datas')).toBe('data');
    expect(parseStep('itens')).toBe('decoracao');
  });

  /*
   * Link antigo, URL digitada errada ou `?step=` vazio não podem mostrar uma
   * tela em branco: o wizard abre no primeiro passo do pedido, que é sempre
   * válido. `constructor` é o caso de quem procura num objeto literal.
   */
  it('não reconhece o que não é passo', () => {
    expect(parseStep(null)).toBeNull();
    expect(parseStep('')).toBeNull();
    expect(parseStep('pagamento')).toBeNull();
    expect(parseStep('constructor')).toBeNull();
  });
});

describe('stepsFor', () => {
  it('a chácara passa por todos os passos', () => {
    expect(stepsFor('VENUE', false)).toEqual([
      'tipo',
      'data',
      'convidados',
      'decoracao',
      'revisao',
    ]);
  });

  it('a decoração não tem convidados', () => {
    expect(stepsFor('DECORATION', false)).toEqual(['tipo', 'data', 'decoracao', 'revisao']);
  });

  /* Quem veio do cartão de uma decoração na landing já disse o que quer reservar. */
  it('a decoração vinda da landing pula o tipo', () => {
    expect(stepsFor('DECORATION', true)).toEqual(['data', 'decoracao', 'revisao']);
  });

  it('a chácara sempre mostra o tipo', () => {
    expect(stepsFor('VENUE', true)[0]).toBe('tipo');
  });
});
