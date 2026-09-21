import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { resetSessionForTests } from '@/features/auth/session';

/**
 * Monta um componente com o mínimo de contexto que ele precisa.
 *
 * `retry: false` nas queries porque, no teste, repetir requisição só esconde a
 * causa da falha. O estado do módulo de sessão é zerado antes de montar, senão
 * uma renovação pendurada de um teste anterior travaria este.
 */
export function renderWithProviders(
  ui: ReactNode,
  { route = '/', withAuth = true }: { route?: string; withAuth?: boolean } = {},
) {
  resetSessionForTests();

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const tree = (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        {withAuth ? <AuthProvider>{ui}</AuthProvider> : ui}
      </MemoryRouter>
    </QueryClientProvider>
  );

  return render(tree);
}

/** Resposta JSON, como o `fetch` devolveria. */
export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Erro no envelope da §11.1. */
export function errorResponse(status: number, code: string, message: string, details?: unknown) {
  return jsonResponse(
    { error: details === undefined ? { code, message } : { code, message, details } },
    status,
  );
}
