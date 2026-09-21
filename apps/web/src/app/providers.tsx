import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ApiError } from '@/api/client';
import { AuthProvider } from '@/features/auth/AuthProvider';

/**
 * Estado do servidor vive no TanStack Query (§12.2); o resto fica em
 * `useState`/`useReducer`. Sem Redux nem Zustand (§3).
 */
const queryClient = new QueryClient({
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

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
