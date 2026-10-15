import type { SessionUser, updateMeBodySchema } from '@chacara/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { z } from 'zod';
import { apiFetch } from './client';

/**
 * Perfil do próprio cliente (§11.2).
 *
 * Nome e telefone, nada além: e-mail e papel não são editáveis por aqui. O
 * telefone é o que o wizard precisa antes de enviar um pedido (§11.3), e pedi-lo
 * no meio da reserva é melhor que recusar o envio por um campo que a pessoa nem
 * sabia que faltava.
 */
export type UpdateMeBody = z.infer<typeof updateMeBodySchema>;

export function useUpdateMe() {
  return useMutation({
    mutationFn: (body: UpdateMeBody) =>
      apiFetch<SessionUser>('/me', { method: 'PATCH', body, auth: true }),
  });
}

/**
 * Relê o perfil quando a pessoa pede.
 *
 * Existe por um caminho concreto: o link de confirmação do e-mail costuma abrir
 * numa aba nova, e a aba onde o pedido está montado continua achando que a conta
 * não foi confirmada. Em vez de mandar recarregar — o que arriscaria o rascunho —
 * a tela oferece reconsultar.
 *
 * Fica desligada por padrão: quem conhece o momento de perguntar é a tela.
 */
export function useMe({ enabled = false }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => apiFetch<SessionUser>('/me', { auth: true }),
    enabled,
  });
}
