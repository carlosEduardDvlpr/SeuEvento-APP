import type {
  SessionResponse,
  forgotPasswordBodySchema,
  loginBodySchema,
  registerBodySchema,
  resetPasswordBodySchema,
} from '@chacara/shared';
import { useMutation } from '@tanstack/react-query';
import type { z } from 'zod';
import { apiFetch } from './client';

/**
 * Chamadas de autenticação (§11.2).
 *
 * Os tipos de corpo saem dos mesmos schemas que a API usa para validar, então um
 * campo que mude de nome quebra o `tsc` aqui antes de virar 400 em produção.
 */

export type LoginBody = z.infer<typeof loginBodySchema>;
export type RegisterBody = z.infer<typeof registerBodySchema>;
export type ForgotPasswordBody = z.infer<typeof forgotPasswordBodySchema>;
export type ResetPasswordBody = z.infer<typeof resetPasswordBodySchema>;

type AcceptedResponse = { message: string };

export function useLogin() {
  return useMutation({
    mutationFn: (body: LoginBody) =>
      apiFetch<SessionResponse>('/auth/login', { method: 'POST', body }),
  });
}

export function useGoogleLogin() {
  return useMutation({
    mutationFn: (idToken: string) =>
      apiFetch<SessionResponse>('/auth/google', { method: 'POST', body: { idToken } }),
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: (body: RegisterBody) =>
      apiFetch<AcceptedResponse>('/auth/register', { method: 'POST', body }),
  });
}

export function useVerifyEmail() {
  return useMutation({
    mutationFn: (token: string) =>
      apiFetch<SessionResponse>('/auth/verify-email', { method: 'POST', body: { token } }),
  });
}

export function useResendVerification() {
  return useMutation({
    mutationFn: (email: string) =>
      apiFetch<AcceptedResponse>('/auth/resend-verification', { method: 'POST', body: { email } }),
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (body: ForgotPasswordBody) =>
      apiFetch<AcceptedResponse>('/auth/forgot-password', { method: 'POST', body }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (body: ResetPasswordBody) =>
      apiFetch<void>('/auth/reset-password', { method: 'POST', body }),
  });
}
