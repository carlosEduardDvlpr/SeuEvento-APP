import type { ApiErrorCode } from '@chacara/shared';

/**
 * Erro de domínio (§7.1). Um único error handler no Fastify converte isto na
 * resposta padrão da §11.1, então nenhuma rota monta corpo de erro à mão.
 */
export class AppError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * `VALIDATION_ERROR` apontando um campo específico.
 *
 * Usa o mesmo formato de `details` que o handler produz para erro do Zod (§11.1),
 * então o formulário do SPA marca o campo sem precisar saber se a recusa veio do
 * schema ou de uma regra do banco (nome duplicado, por exemplo).
 */
export function fieldError(field: string, message: string): AppError {
  return new AppError('VALIDATION_ERROR', 400, message, {
    context: 'body',
    fields: [{ field, message }],
  });
}

/** SQLSTATE dos erros do Postgres que o domínio precisa distinguir. */
export const PG_UNIQUE_VIOLATION = '23505';
export const PG_CHECK_VIOLATION = '23514';
export const PG_EXCLUSION_VIOLATION = '23P01';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Extrai o SQLSTATE original de um erro vindo do Prisma.
 *
 * O Prisma 7 com driver adapter não repassa o código do Postgres: a exceção
 * chega como `PrismaClientKnownRequestError` com `code: 'P2039'` (genérico) e o
 * código de verdade fica enterrado em `meta.driverAdapterError.cause.code`.
 * Sem ler daí não há como separar "data já reservada" (23P01) de qualquer outra
 * falha de escrita, e a constraint da §8.1 viraria um 500.
 */
export function postgresErrorCode(error: unknown): string | undefined {
  const adapterError = asRecord(asRecord(error)?.['meta'])?.['driverAdapterError'];
  const code = asRecord(asRecord(adapterError)?.['cause'])?.['code'];
  return typeof code === 'string' ? code : undefined;
}

/** A reserva colidiu com outra reserva ativa nos mesmos dias (§8.1). */
export function isExclusionViolation(error: unknown): boolean {
  return postgresErrorCode(error) === PG_EXCLUSION_VIOLATION;
}

/** Código próprio do Prisma para violação de unicidade. */
const PRISMA_UNIQUE_VIOLATION = 'P2002';

/**
 * Valor duplicado em coluna única.
 *
 * Aqui o Prisma **traduz** o erro e entrega o código próprio `P2002`, ao contrário
 * do que faz com a exclusion constraint da §8.1, que chega como `P2039` com o
 * SQLSTATE escondido. Conferir os dois caminhos evita que a detecção dependa de
 * qual deles o driver tomou.
 */
export function isUniqueViolation(error: unknown): boolean {
  const code = asRecord(error)?.['code'];
  return code === PRISMA_UNIQUE_VIOLATION || postgresErrorCode(error) === PG_UNIQUE_VIOLATION;
}
