import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ApiError } from '@/api/client';
import { AuthProvider } from '@/features/auth/AuthProvider';

/**
 * Estado do servidor vive no TanStack Query (§12.2); o resto fica em
 * `useState`/`useReducer`. Sem Redux nem Zustand (§3).
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        retry: (failureCount, error) => {
          // Erro de regra de negócio ou de permissão não melhora com nova
          // tentativa; só vale repetir falha de rede.
          if (error instanceof ApiError && error.status !== 0) return false;
          return failureCount < 2;
        },
      },
      mutations: {
        // Reserva nunca é otimista (§13.2): só confirma depois da resposta.
        retry: false,
      },
    },
  });
}

/**
 * O cliente vem de fora, não de um singleton do módulo.
 *
 * São dois chamadores e os dois precisam do seu: o `main.tsx` semeia o cache com
 * os dados que chegaram no HTML pré-renderizado, e o pré-renderizador do build
 * monta uma árvore por execução, fora do navegador. Um singleton compartilhado
 * entre renderizações de servidor vazaria dados de uma para a outra.
 */
export function AppProviders({ children, client }: { children: ReactNode; client: QueryClient }) {
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
