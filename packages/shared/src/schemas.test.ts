import { describe, expect, it } from 'vitest';
import {
  centsSchema,
  dateRangeSchema,
  discountPercentSchema,
  emailSchema,
  isoDateSchema,
  nameSchema,
  paginationSchema,
  passwordSchema,
  phoneSchema,
} from './schemas.js';

describe('isoDateSchema', () => {
  it('aceita dia válido', () => {
    expect(isoDateSchema.parse('2026-12-24')).toBe('2026-12-24');
  });

  it('recusa formato brasileiro e data com hora', () => {
    expect(isoDateSchema.safeParse('24/12/2026').success).toBe(false);
    expect(isoDateSchema.safeParse('2026-12-24T10:00:00Z').success).toBe(false);
  });

  it('recusa dia que não existe', () => {
    expect(isoDateSchema.safeParse('2026-04-31').success).toBe(false);
    expect(isoDateSchema.safeParse('2027-02-29').success).toBe(false);
    expect(isoDateSchema.safeParse('2028-02-29').success).toBe(true);
  });
});

describe('centsSchema', () => {
  it('aceita inteiro não negativo', () => {
    expect(centsSchema.parse(0)).toBe(0);
    expect(centsSchema.parse(180000)).toBe(180000);
  });

  it('recusa negativo e fração de centavo', () => {
    expect(centsSchema.safeParse(-1).success).toBe(false);
    expect(centsSchema.safeParse(1800.5).success).toBe(false);
  });
});

describe('discountPercentSchema', () => {
  it('aceita de 1 a 100', () => {
    expect(discountPercentSchema.parse(1)).toBe(1);
    expect(discountPercentSchema.parse(100)).toBe(100);
  });

  it('recusa fora da faixa', () => {
    expect(discountPercentSchema.safeParse(0).success).toBe(false);
    expect(discountPercentSchema.safeParse(101).success).toBe(false);
  });
});

describe('emailSchema', () => {
  // §10.1: normalizar antes de qualquer consulta, senão o mesmo e-mail digitado
  // com maiúsculas criaria uma segunda conta.
  it('remove espaço e baixa a caixa', () => {
    expect(emailSchema.parse('  ANA@Exemplo.COM  ')).toBe('ana@exemplo.com');
  });

  it('recusa e-mail malformado', () => {
    expect(emailSchema.safeParse('ana@').success).toBe(false);
    expect(emailSchema.safeParse('ana exemplo.com').success).toBe(false);
  });
});

describe('passwordSchema', () => {
  it('aceita nas bordas da faixa', () => {
    expect(passwordSchema.safeParse('a'.repeat(8)).success).toBe(true);
    expect(passwordSchema.safeParse('a'.repeat(128)).success).toBe(true);
  });

  it('recusa fora da faixa', () => {
    expect(passwordSchema.safeParse('a'.repeat(7)).success).toBe(false);
    expect(passwordSchema.safeParse('a'.repeat(129)).success).toBe(false);
  });
});

describe('nameSchema', () => {
  it('remove espaço nas pontas', () => {
    expect(nameSchema.parse('  Ana Beatriz  ')).toBe('Ana Beatriz');
  });

  it('recusa nome vazio ou de uma letra', () => {
    expect(nameSchema.safeParse('   ').success).toBe(false);
    expect(nameSchema.safeParse('A').success).toBe(false);
  });
});

describe('phoneSchema', () => {
  it('guarda só os dígitos, aceitando a máscara que a pessoa digitar', () => {
    expect(phoneSchema.parse('(11) 99999-0000')).toBe('11999990000');
    expect(phoneSchema.parse('11 3333-4444')).toBe('1133334444');
  });

  it('recusa telefone sem DDD ou com dígitos demais', () => {
    expect(phoneSchema.safeParse('99999-0000').success).toBe(false);
    expect(phoneSchema.safeParse('11999990000123').success).toBe(false);
  });
});

describe('paginationSchema', () => {
  it('aplica os padrões da §11.1', () => {
    expect(paginationSchema.parse({})).toEqual({ page: 1, pageSize: 20 });
  });

  it('aceita número vindo como texto na query string', () => {
    expect(paginationSchema.parse({ page: '3', pageSize: '50' })).toEqual({
      page: 3,
      pageSize: 50,
    });
  });

  it('limita o tamanho de página', () => {
    expect(paginationSchema.safeParse({ pageSize: 101 }).success).toBe(false);
    expect(paginationSchema.safeParse({ page: 0 }).success).toBe(false);
  });
});

describe('dateRangeSchema', () => {
  it('aceita intervalo de um único dia', () => {
    expect(dateRangeSchema.parse({ startDate: '2026-12-05', endDate: '2026-12-05' })).toEqual({
      startDate: '2026-12-05',
      endDate: '2026-12-05',
    });
  });

  it('recusa saída anterior à entrada, apontando o campo', () => {
    const result = dateRangeSchema.safeParse({ startDate: '2026-12-07', endDate: '2026-12-05' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['endDate']);
  });
});
