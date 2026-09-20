/**
 * Acesso a storage do navegador (§12.4).
 *
 * `localStorage` e `sessionStorage` lançam exceção em situações reais: janela
 * privada de alguns navegadores, cota cheia, política de terceiros. Todo acesso
 * passa por aqui e devolve `null` em caso de falha, para uma preferência de
 * interface nunca derrubar a página.
 *
 * **Nunca** guarde token ou dado pessoal aqui: o access token vive só em memória
 * (§10.1). O que cabe é rascunho de reserva e preferência de UI.
 */

function getStore(kind: 'local' | 'session'): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readJSON<T>(key: string, kind: 'local' | 'session' = 'session'): T | null {
  const store = getStore(kind);
  if (!store) return null;

  try {
    const raw = store.getItem(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch {
    // Conteúdo corrompido ou de uma versão antiga do rascunho.
    return null;
  }
}

export function writeJSON(
  key: string,
  value: unknown,
  kind: 'local' | 'session' = 'session',
): void {
  const store = getStore(kind);
  if (!store) return;

  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    // Cota cheia ou escrita bloqueada: perder o rascunho é aceitável, quebrar não.
  }
}

export function removeKey(key: string, kind: 'local' | 'session' = 'session'): void {
  const store = getStore(kind);
  if (!store) return;

  try {
    store.removeItem(key);
  } catch {
    // Nada a fazer: já não há o que limpar de forma confiável.
  }
}
