import { describe, expect, it } from 'vitest';
import {
  AppError,
  PG_EXCLUSION_VIOLATION,
  PG_UNIQUE_VIOLATION,
  fieldError,
  isExclusionViolation,
  isUniqueViolation,
  isWriteConflict,
  postgresErrorCode,
} from './errors.js';

/**
 * Estas funções guardam descobertas sobre como o Prisma 7 entrega erro do
 * Postgres, e cada uma foi achada depurando um 500 que devia ser 409. O teste
 * existe para uma mudança de versão não desfazer isso em silêncio.
 */

/** Como o Prisma 7 com driver adapter embrulha um erro do Postgres. */
function adapterError(sqlState: string) {
  return {
    name: 'PrismaClientKnownRequestError',
    code: 'P2039',
    meta: { driverAdapterError: { cause: { code: sqlState } } },
  };
}

describe('postgresErrorCode', () => {
  /*
   * O código de verdade fica enterrado em `meta.driverAdapterError.cause.code`:
   * o `code` de cima é o genérico `P2039`.
   */
  it('desenterra o SQLSTATE do erro do driver', () => {
    expect(postgresErrorCode(adapterError('23P01'))).toBe(PG_EXCLUSION_VIOLATION);
  });

  it('devolve undefined para o que não tem esse formato', () => {
    expect(postgresErrorCode(new Error('qualquer coisa'))).toBeUndefined();
    expect(postgresErrorCode(null)).toBeUndefined();
    expect(postgresErrorCode({ code: 'P2002' })).toBeUndefined();
  });
});

describe('isExclusionViolation', () => {
  /* É o erro da constraint da §8.1: a data já estava tomada. */
  it('reconhece a violação da exclusion constraint', () => {
    expect(isExclusionViolation(adapterError(PG_EXCLUSION_VIOLATION))).toBe(true);
  });

  it('não confunde com outro erro do banco', () => {
    expect(isExclusionViolation(adapterError(PG_UNIQUE_VIOLATION))).toBe(false);
    expect(isExclusionViolation({ code: 'P2034' })).toBe(false);
  });
});

describe('isUniqueViolation', () => {
  /*
   * Aqui o Prisma **traduz** e entrega o código próprio, sem o SQLSTATE —
   * diferente da exclusion constraint. Conferir os dois caminhos é o que evita
   * depender de qual deles o driver tomou.
   */
  it('reconhece o código próprio do Prisma', () => {
    expect(isUniqueViolation({ code: 'P2002' })).toBe(true);
  });

  it('reconhece também o SQLSTATE cru', () => {
    expect(isUniqueViolation(adapterError(PG_UNIQUE_VIOLATION))).toBe(true);
  });

  it('não confunde com a exclusion constraint', () => {
    expect(isUniqueViolation(adapterError(PG_EXCLUSION_VIOLATION))).toBe(false);
  });
});

describe('isWriteConflict', () => {
  /* Sob contenção, a perdedora às vezes vem como conflito de serialização. */
  it('reconhece o conflito de escrita', () => {
    expect(isWriteConflict({ code: 'P2034' })).toBe(true);
  });

  it('não confunde com os outros', () => {
    expect(isWriteConflict({ code: 'P2002' })).toBe(false);
    expect(isWriteConflict(adapterError(PG_EXCLUSION_VIOLATION))).toBe(false);
    expect(isWriteConflict(new Error('qualquer coisa'))).toBe(false);
  });
});

describe('fieldError', () => {
  /* Mesmo formato do erro do Zod, para o formulário marcar o campo (§11.1). */
  it('monta details no formato que o formulário consome', () => {
    const error = fieldError('phone', 'Informe seu WhatsApp.');

    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.status).toBe(400);
    expect(error.details).toEqual({
      context: 'body',
      fields: [{ field: 'phone', message: 'Informe seu WhatsApp.' }],
    });
  });
});
