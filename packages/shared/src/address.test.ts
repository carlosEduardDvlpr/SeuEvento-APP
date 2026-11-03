import { describe, expect, it } from 'vitest';
import { addressInputSchema } from './address.js';
import { changePasswordBodySchema, updateMeBodySchema } from './auth.js';
import { createBookingBodySchema } from './booking.js';
import { formatAddress, formatCep } from './format.js';

const ENDERECO = {
  cep: '12954000',
  street: 'Rua das Orquídeas',
  number: '265',
  complement: '',
  district: 'Chácaras Fernão Dias',
  city: 'Atibaia',
  state: 'SP',
};

describe('addressInputSchema', () => {
  it('aceita o endereço e transforma complemento vazio em nulo', () => {
    expect(addressInputSchema.parse(ENDERECO)).toEqual({ ...ENDERECO, complement: null });
  });

  /* O CEP do formulário é o que vai ao ViaCEP: só número, oito dígitos. */
  it('recusa CEP com traço, curto ou com letra', () => {
    for (const cep of ['12954-000', '1295400', '12954a00']) {
      const result = addressInputSchema.safeParse({ ...ENDERECO, cep });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe('Informe o CEP com 8 números.');
    }
  });

  it('recusa estado que não é uma das 27 siglas', () => {
    expect(addressInputSchema.safeParse({ ...ENDERECO, state: 'XX' }).success).toBe(false);
  });

  it('exige rua, número, bairro e cidade', () => {
    const result = addressInputSchema.safeParse({
      ...ENDERECO,
      street: ' ',
      number: '',
      district: '',
      city: '',
    });

    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual([
      'street',
      'number',
      'district',
      'city',
    ]);
  });
});

describe('formatAddress', () => {
  it('escreve o endereço numa linha, com o CEP formatado', () => {
    expect(formatAddress({ ...ENDERECO, complement: 'casa 2', state: 'SP' })).toBe(
      'Rua das Orquídeas, 265, casa 2 – Chácaras Fernão Dias, Atibaia/SP – CEP 12954-000',
    );
    expect(formatAddress({ ...ENDERECO, complement: null, state: 'SP' })).toBe(
      'Rua das Orquídeas, 265 – Chácaras Fernão Dias, Atibaia/SP – CEP 12954-000',
    );
  });

  it('formata só CEP válido', () => {
    expect(formatCep('12954000')).toBe('12954-000');
    expect(formatCep('123')).toBe('123');
  });
});

describe('updateMeBodySchema', () => {
  it('aceita só o endereço, e nulo para apagar', () => {
    expect(updateMeBodySchema.safeParse({ address: ENDERECO }).success).toBe(true);
    expect(updateMeBodySchema.parse({ address: null })).toEqual({ address: null });
  });

  it('recusa corpo sem nada a mudar', () => {
    expect(updateMeBodySchema.safeParse({}).success).toBe(false);
  });
});

describe('changePasswordBodySchema', () => {
  it('exige a senha atual e uma nova dentro da faixa do cadastro', () => {
    expect(
      changePasswordBodySchema.safeParse({ currentPassword: 'antiga123', newPassword: 'nova12345' })
        .success,
    ).toBe(true);
    expect(
      changePasswordBodySchema.safeParse({ currentPassword: '', newPassword: 'nova12345' }).success,
    ).toBe(false);
    expect(
      changePasswordBodySchema.safeParse({ currentPassword: 'antiga123', newPassword: 'curta' })
        .success,
    ).toBe(false);
  });

  it('recusa a mesma senha, apontando a nova', () => {
    const result = changePasswordBodySchema.safeParse({
      currentPassword: 'mesma1234',
      newPassword: 'mesma1234',
    });

    expect(result.error?.issues[0]?.path).toEqual(['newPassword']);
  });
});

describe('createBookingBodySchema, decoração e entrega', () => {
  const ITEM = '00000000-0000-4000-8000-000000000001';
  const OUTRO = '00000000-0000-4000-8000-000000000002';
  const decoracao = {
    kind: 'DECORATION',
    startDate: '2026-12-05',
    endDate: '2026-12-05',
    items: [{ itemId: ITEM, quantity: 1 }],
    fulfillment: 'PICKUP',
    expectedTotalCents: 40000,
  };

  it('aceita uma decoração com retirada ou entrega', () => {
    expect(createBookingBodySchema.safeParse(decoracao).success).toBe(true);
    expect(
      createBookingBodySchema.safeParse({ ...decoracao, fulfillment: 'DELIVERY' }).success,
    ).toBe(true);
  });

  it('exige retirada ou entrega na decoração, e não na chácara', () => {
    const semModalidade = createBookingBodySchema.safeParse({ ...decoracao, fulfillment: null });
    expect(semModalidade.error?.issues[0]?.path).toEqual(['fulfillment']);

    expect(
      createBookingBodySchema.safeParse({
        ...decoracao,
        kind: 'VENUE',
        guestCount: 40,
        fulfillment: null,
      }).success,
    ).toBe(true);
  });

  it('recusa duas decorações, ou a mesma duas vezes', () => {
    const duas = createBookingBodySchema.safeParse({
      ...decoracao,
      items: [
        { itemId: ITEM, quantity: 1 },
        { itemId: OUTRO, quantity: 1 },
      ],
    });
    const dobrada = createBookingBodySchema.safeParse({
      ...decoracao,
      items: [{ itemId: ITEM, quantity: 2 }],
    });

    for (const result of [duas, dobrada]) {
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe('Escolha uma decoração só por reserva.');
    }
  });
});
