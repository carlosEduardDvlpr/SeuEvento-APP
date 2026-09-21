import type { SessionResponse, SessionUser } from '@chacara/shared';
import { apiFetch, setAuthHooks } from '@/api/client';

/**
 * Mecânica da sessão, fora do React (§10.1 e §10.4).
 *
 * Separado do provider de propósito: o access token precisa ser legível pelo
 * cliente HTTP, que não é um componente, e não pode morar em estado do React
 * (nem ser serializado para lugar nenhum). Este módulo é o dono único do token.
 *
 * **Nunca** gravar o token em `localStorage` ou `sessionStorage` (§2.3): memória
 * significa que fechar a aba encerra o acesso, e que XSS não encontra o token
 * guardado em lugar previsível.
 */

let accessToken: string | null = null;
let refreshInFlight: Promise<SessionUser | null> | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function storeSession(session: SessionResponse): SessionUser {
  accessToken = session.accessToken;
  return session.user;
}

export function clearAccessToken(): void {
  accessToken = null;
}

/**
 * Renova a sessão pelo cookie de refresh.
 *
 * Chamadas concorrentes compartilham a mesma requisição. Isso não é otimização:
 * o servidor **rotaciona** o refresh token e trata um token já gasto como reuso,
 * revogando a sessão inteira (§10.1). Duas renovações em paralelo derrubariam o
 * usuário.
 */
export function refreshSession(): Promise<SessionUser | null> {
  refreshInFlight ??= apiFetch<SessionResponse>('/auth/refresh', { method: 'POST' })
    .then((session) => storeSession(session))
    .catch(() => {
      clearAccessToken();
      return null;
    })
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

/**
 * Zera o estado do módulo entre testes.
 *
 * Existe porque o token e a renovação em voo são estado de módulo: um teste que
 * deixe a renovação pendurada bloquearia todos os seguintes, já que eles
 * receberiam a mesma promessa que nunca resolve.
 */
export function resetSessionForTests(): void {
  accessToken = null;
  refreshInFlight = null;
}

export async function endSession(): Promise<void> {
  try {
    await apiFetch('/auth/logout', { method: 'POST' });
  } finally {
    // Mesmo se a chamada falhar, localmente a sessão acabou.
    clearAccessToken();
  }
}

let sessionExpiredHandler: () => void = () => {};

/**
 * Registra quem reage ao fim da sessão.
 *
 * É a única parte que depende do React: atualizar a interface e levar a pessoa
 * para a tela de entrada é trabalho do provider.
 */
export function setSessionExpiredHandler(handler: () => void): void {
  sessionExpiredHandler = handler;
}

/*
 * Liga o cliente HTTP no carregamento do módulo, e não num efeito.
 *
 * Leitura do token e renovação não dependem de React, e precisam estar prontas
 * antes da primeira requisição autenticada — que pode partir de um componente
 * montado antes do provider terminar seus efeitos.
 */
setAuthHooks({
  getAccessToken,
  refreshSession: () => refreshSession().then((user) => user !== null),
  onSessionExpired: () => sessionExpiredHandler(),
});
