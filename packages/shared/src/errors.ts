/**
 * Contrato de erro da API (§11.1). A resposta tem sempre uma única forma:
 *
 *   { "error": { "code": "...", "message": "...", "details"?: { ... } } }
 *
 * A lista vive aqui porque as duas pontas dependem dela: a API escolhe o código
 * e o front decide o que mostrar e para qual passo voltar.
 */
export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'INVALID_CREDENTIALS',
  'UNAUTHORIZED',
  'EMAIL_NOT_VERIFIED',
  'FORBIDDEN',
  'NOT_FOUND',
  'DATE_UNAVAILABLE',
  'STOCK_INSUFFICIENT',
  'PRICE_CHANGED',
  'EMAIL_IN_USE',
  'INVALID_TOKEN',
  'INVALID_TRANSITION',
  'CANCEL_WINDOW_CLOSED',
  'TOO_MANY_PENDING',
  'RATE_LIMITED',
  'INTERNAL',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
};

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === 'string' && (API_ERROR_CODES as readonly string[]).includes(value);
}
