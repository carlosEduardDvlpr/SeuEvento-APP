import { describe, expect, it } from 'vitest';
import { API_ERROR_CODES, isApiErrorCode } from '@chacara/shared';

// packages/shared publica TypeScript direto (sem passo de build). Este teste
// garante que a API consegue consumir o pacote; se a resolução quebrar, o
// contrato de erro e os schemas Zod compartilhados param de valer nas duas pontas.
describe('resolução de @chacara/shared na API', () => {
  it('importa o contrato de erro compartilhado', () => {
    expect(API_ERROR_CODES).toContain('DATE_UNAVAILABLE');
    expect(isApiErrorCode('STOCK_INSUFFICIENT')).toBe(true);
  });
});
