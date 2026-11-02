import { describe, expect, it } from 'vitest';
import {
  MAX_INSTALLMENTS,
  markPaymentBodySchema,
  savePaymentPlanBodySchema,
} from './admin-finance.js';
import { paymentLabel } from './labels.js';

const row = (dueDate: string, amountCents: number, paidOn: string | null = null) => ({
  dueDate,
  amountCents,
  paidOn,
});

const rows = (count: number) => Array.from({ length: count }, () => row('2026-12-05', 100));

describe('savePaymentPlanBodySchema', () => {
  it('aceita só o sinal', () => {
    expect(
      savePaymentPlanBodySchema.parse({ deposit: row('2026-11-01', 30000, '2026-11-01') }),
    ).toEqual({ deposit: row('2026-11-01', 30000, '2026-11-01'), installments: [] });
  });

  it('aceita só parcelas, com a parcela em aberto por padrão', () => {
    expect(
      savePaymentPlanBodySchema.parse({
        installments: [{ dueDate: '2026-12-05', amountCents: 50000 }],
      }),
    ).toEqual({ deposit: null, installments: [row('2026-12-05', 50000)] });
  });

  it('recusa plano vazio, apontando as parcelas', () => {
    const result = savePaymentPlanBodySchema.safeParse({ deposit: null, installments: [] });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['installments']);
  });

  it(`aceita até ${MAX_INSTALLMENTS} parcelas além do sinal`, () => {
    const deposit = row('2026-11-01', 100, '2026-11-01');

    expect(savePaymentPlanBodySchema.safeParse({ deposit, installments: rows(12) }).success).toBe(
      true,
    );
    expect(savePaymentPlanBodySchema.safeParse({ deposit, installments: rows(13) }).success).toBe(
      false,
    );
  });

  it('recusa linha sem valor, explicando o motivo', () => {
    const result = savePaymentPlanBodySchema.safeParse({ installments: [row('2026-12-05', 0)] });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('O valor precisa ser maior que zero.');
  });

  it('recusa fração de centavo e dia que não existe', () => {
    expect(
      savePaymentPlanBodySchema.safeParse({ installments: [row('2026-12-05', 100.5)] }).success,
    ).toBe(false);
    expect(
      savePaymentPlanBodySchema.safeParse({ installments: [row('2026-02-30', 100)] }).success,
    ).toBe(false);
    expect(
      savePaymentPlanBodySchema.safeParse({ deposit: row('2026-11-01', 100, '2026-11-31') })
        .success,
    ).toBe(false);
  });
});

describe('markPaymentBodySchema', () => {
  it('registra com o dia e desfaz com nulo', () => {
    expect(markPaymentBodySchema.parse({ paidOn: '2026-11-01' })).toEqual({
      paidOn: '2026-11-01',
    });
    expect(markPaymentBodySchema.parse({ paidOn: null })).toEqual({ paidOn: null });
  });

  it('exige o campo: corpo vazio não desfaz um recebimento por acidente', () => {
    expect(markPaymentBodySchema.safeParse({}).success).toBe(false);
  });
});

describe('paymentLabel', () => {
  it('chama o sinal de sinal', () => {
    expect(
      paymentLabel({ kind: 'DEPOSIT', number: 0 }, { installments: 3, hasDeposit: true }),
    ).toBe('Sinal');
  });

  it('chama a parcela única de à vista sem sinal, e de restante depois dele', () => {
    const single = { kind: 'INSTALLMENT', number: 1 } as const;

    expect(paymentLabel(single, { installments: 1, hasDeposit: false })).toBe('À vista');
    expect(paymentLabel(single, { installments: 1, hasDeposit: true })).toBe('Restante');
  });

  it('numera as parcelas sobre o total delas, sem contar o sinal', () => {
    expect(
      paymentLabel({ kind: 'INSTALLMENT', number: 2 }, { installments: 3, hasDeposit: true }),
    ).toBe('Parcela 2 de 3');
  });
});
