import { describe, expect, it } from 'vitest';
import { API_ERROR_CODES, isApiErrorCode } from './errors.js';

describe('contrato de erro da API', () => {
  it('tem exatamente os códigos da tabela da §11.1', () => {
    // Guarda contra deriva silenciosa: acrescentar código aqui exige atualizar
    // a tabela do agents.md e o mapa de mensagens da §16.4.
    expect([...API_ERROR_CODES].sort()).toEqual(
      [
        'CANCEL_WINDOW_CLOSED',
        'DATE_UNAVAILABLE',
        'EMAIL_IN_USE',
        'EMAIL_NOT_VERIFIED',
        'FORBIDDEN',
        'INTERNAL',
        'INVALID_CREDENTIALS',
        'INVALID_TOKEN',
        'INVALID_TRANSITION',
        'NOT_FOUND',
        'PRICE_CHANGED',
        'RATE_LIMITED',
        'STOCK_INSUFFICIENT',
        'TOO_MANY_PENDING',
        'UNAUTHORIZED',
        'VALIDATION_ERROR',
      ].sort(),
    );
  });

  it('não tem código repetido', () => {
    expect(new Set(API_ERROR_CODES).size).toBe(API_ERROR_CODES.length);
  });

  it('reconhece código conhecido e rejeita desconhecido', () => {
    expect(isApiErrorCode('DATE_UNAVAILABLE')).toBe(true);
    expect(isApiErrorCode('DATA_INDISPONIVEL')).toBe(false);
    expect(isApiErrorCode(undefined)).toBe(false);
  });
});
