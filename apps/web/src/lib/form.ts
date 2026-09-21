import type { ZodType } from 'zod';
import { ApiError } from '@/api/client';

/**
 * Erro por campo em formulário (§12.5).
 *
 * As duas fontes produzem o mesmo formato: a validação local (mesmo schema Zod do
 * servidor) e o `VALIDATION_ERROR` que a API devolve. Assim a tela não precisa
 * saber de onde veio a recusa.
 */
export type FieldErrors = Record<string, string>;

/** Primeiro erro de cada campo: mostrar vários na mesma linha só confunde. */
export function validateForm<T>(
  schema: ZodType<T>,
  values: unknown,
): { data: T; errors: null } | { data: null; errors: FieldErrors } {
  const result = schema.safeParse(values);
  if (result.success) return { data: result.data, errors: null };

  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path.join('.');
    if (field && !errors[field]) errors[field] = issue.message;
  }

  return { data: null, errors };
}

/**
 * Traduz o `details.fields` da §11.1 em erro por campo.
 *
 * Só faz sentido para `VALIDATION_ERROR`: os outros códigos são sobre a
 * requisição inteira e aparecem no resumo do formulário.
 */
export function apiFieldErrors(error: unknown): FieldErrors {
  if (!(error instanceof ApiError) || error.code !== 'VALIDATION_ERROR') return {};

  const details = error.details;
  if (typeof details !== 'object' || details === null) return {};

  const fields = (details as { fields?: unknown }).fields;
  if (!Array.isArray(fields)) return {};

  const errors: FieldErrors = {};
  for (const entry of fields) {
    if (typeof entry !== 'object' || entry === null) continue;

    const { field, message } = entry as { field?: unknown; message?: unknown };
    if (typeof field === 'string' && typeof message === 'string' && field && !errors[field]) {
      errors[field] = message;
    }
  }

  return errors;
}

/**
 * Mensagem para o resumo do formulário.
 *
 * `VALIDATION_ERROR` não entra: os campos já estão marcados, e repetir "confira
 * os campos" acima deles é ruído.
 */
export function formErrorMessage(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  if (error.code === 'VALIDATION_ERROR' && Object.keys(apiFieldErrors(error)).length > 0) {
    return null;
  }
  return error.message;
}
