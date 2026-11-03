import type {
  ChangePasswordBody,
  SessionResponse,
  SessionUser,
  updateMeBodySchema,
} from '@chacara/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { z } from 'zod';
import { apiFetch } from './client';

/**
 * Perfil do próprio cliente (§11.2).
 *
 * Nome, telefone e endereço de entrega; e-mail e papel não são editáveis por
 * aqui. O telefone é o que o wizard precisa antes de enviar um pedido (§11.3), e
 * pedi-lo no meio da reserva é melhor que recusar o envio por um campo que a
 * pessoa nem sabia que faltava. O endereço é o da entrega da decoração (§9.12).
 */
export type UpdateMeBody = z.infer<typeof updateMeBodySchema>;

export function useUpdateMe() {
  return useMutation({
    mutationFn: (body: UpdateMeBody) =>
      apiFetch<SessionUser>('/me', { method: 'PATCH', body, auth: true }),
  });
}

/**
 * Troca de senha por quem está logado (§10.5, novembro de 2026).
 *
 * A resposta é uma sessão nova: a API encerra as outras sessões da conta, e
 * quem trocou continua entrando sem digitar a senha de novo.
 */
export function useChangePassword() {
  return useMutation({
    mutationFn: (body: ChangePasswordBody) =>
      apiFetch<SessionResponse>('/auth/change-password', { method: 'POST', body, auth: true }),
  });
}

/**
 * Remoção da conta (§10.8).
 *
 * Anonimiza os dados pessoais e mantém as reservas. A API recusa enquanto
 * houver reserva em andamento, e a mensagem dessa recusa é o que a tela mostra —
 * ela diz o que fazer (cancelar pelo site ou falar com a chácara), e repetir essa
 * regra aqui criaria uma segunda versão dela.
 */
export function useDeleteMe() {
  return useMutation({
    mutationFn: () => apiFetch<null>('/me', { method: 'DELETE', auth: true }),
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
