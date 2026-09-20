import { type ApiErrorCode, isApiErrorCode } from '@chacara/shared';

/**
 * Cliente HTTP (§12.3).
 *
 * Um wrapper de `fetch` que traduz o envelope de erro da §11.1 numa exceção
 * tipada. Os hooks por módulo só chamam daqui, então o tratamento de erro é
 * igual em toda a aplicação.
 */

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Ganchos preenchidos pelo contexto de autenticação.
 *
 * Ficam aqui, e não num import direto, para o cliente HTTP não depender do React:
 * assim ele é testável sem montar componente, e o contexto de auth continua sendo
 * o único dono do access token (que vive só em memória, §10.1).
 */
type AuthHooks = {
  getAccessToken: () => string | null;
  /** Chamado quando a sessão não pode mais ser renovada. */
  onSessionExpired: () => void;
};

const authHooks: AuthHooks = {
  getAccessToken: () => null,
  onSessionExpired: () => {},
};

export function setAuthHooks(hooks: Partial<AuthHooks>): void {
  Object.assign(authHooks, hooks);
}

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  /** Requisição autenticada envia o access token no cabeçalho. */
  auth?: boolean;
};

function toApiError(status: number, payload: unknown): ApiError {
  const error =
    typeof payload === 'object' && payload !== null
      ? (payload as { error?: { code?: unknown; message?: unknown; details?: unknown } }).error
      : undefined;

  const code: ApiErrorCode = isApiErrorCode(error?.code) ? error.code : 'INTERNAL';
  const message =
    typeof error?.message === 'string' && error.message.length > 0
      ? error.message
      : 'Algo deu errado do nosso lado. Tente de novo em instantes.';

  return new ApiError(code, status, message, error?.details);
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, auth = false } = options;

  const headers = new Headers();
  if (body !== undefined) headers.set('Content-Type', 'application/json');

  if (auth) {
    const token = authHooks.getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      // O cookie de refresh é `httpOnly` e restrito a /api/auth; enviá-lo sempre
      // é inofensivo e necessário nas rotas de sessão.
      credentials: 'include',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal ? { signal } : {}),
    });
  } catch (cause) {
    // Falha de rede não tem envelope: o servidor nunca respondeu.
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError('INTERNAL', 0, 'Não conseguimos falar com o servidor. Confira sua conexão.');
  }

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => undefined);

  if (!response.ok) {
    const apiError = toApiError(response.status, payload);
    if (apiError.status === 401 && auth) authHooks.onSessionExpired();
    throw apiError;
  }

  return payload as T;
}
