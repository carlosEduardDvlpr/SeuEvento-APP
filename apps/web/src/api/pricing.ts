import type {
  AdminCombo,
  ComboPreview,
  ComboPreviewBody,
  CreateComboBody,
  CreatePriceRuleBody,
  DeleteResult,
  PriceRule,
  PriceSimulation,
  UpdateComboBody,
  UpdatePriceRuleBody,
} from '@chacara/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';

/**
 * Combos e regras de preço pelo painel (§12.2, §12.3).
 *
 * Mesma convenção do `catalog.ts`: chave hierárquica por recurso, e cada mutation
 * invalida só o que mexeu.
 */

/**
 * A prévia e o simulador têm chave **irmã**, não filha, da lista do recurso.
 *
 * `['admin', 'combos', 'preview']` seria filha de `['admin', 'combos']`, então
 * salvar um combo invalidaria a prévia junto — e a §12.2 é explícita: mutation
 * invalida a chave do recurso e nada além.
 */
const adminKeys = {
  combos: ['admin', 'combos'] as const,
  comboPreview: ['admin', 'combo-preview'] as const,
  priceRules: ['admin', 'price-rules'] as const,
  priceSimulation: ['admin', 'price-simulation'] as const,
};

// ---------------------------------------------------------------------------
// Combos
// ---------------------------------------------------------------------------

export function useAdminCombos() {
  return useQuery({
    queryKey: adminKeys.combos,
    queryFn: () => apiFetch<AdminCombo[]>('/admin/combos', { auth: true }),
  });
}

export function useCreateCombo() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateComboBody) =>
      apiFetch<AdminCombo>('/admin/combos', { method: 'POST', body, auth: true }),
    onSuccess: () => client.invalidateQueries({ queryKey: adminKeys.combos }),
  });
}

export function useUpdateCombo() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateComboBody }) =>
      apiFetch<AdminCombo>(`/admin/combos/${id}`, { method: 'PATCH', body, auth: true }),
    onSuccess: () => client.invalidateQueries({ queryKey: adminKeys.combos }),
  });
}

export function useDeleteCombo() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<DeleteResult>(`/admin/combos/${id}`, { method: 'DELETE', auth: true }),
    onSuccess: () => client.invalidateQueries({ queryKey: adminKeys.combos }),
  });
}

/**
 * Prévia da economia enquanto o combo é montado (§13).
 *
 * É `useQuery` e não `useMutation` porque a rota não tem efeito: assim o resultado
 * entra em cache por composição, e voltar de 15% para 10% reaproveita o valor já
 * calculado em vez de pedir de novo.
 *
 * `enabled` guarda o caso sem item: a API exige ao menos um, e pedir a prévia de
 * um combo vazio só geraria um 400 a cada tecla.
 */
export function useComboPreview(body: ComboPreviewBody | null) {
  return useQuery({
    queryKey: [...adminKeys.comboPreview, body],
    queryFn: () =>
      apiFetch<ComboPreview>('/admin/combos/preview', {
        method: 'POST',
        body: body ?? undefined,
        auth: true,
      }),
    enabled: body !== null && body.items.length > 0,
    staleTime: Infinity,
  });
}

// ---------------------------------------------------------------------------
// Regras de preço
// ---------------------------------------------------------------------------

export function useAdminPriceRules() {
  return useQuery({
    queryKey: adminKeys.priceRules,
    queryFn: () => apiFetch<PriceRule[]>('/admin/price-rules', { auth: true }),
  });
}

export function useCreatePriceRule() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: CreatePriceRuleBody) =>
      apiFetch<PriceRule>('/admin/price-rules', { method: 'POST', body, auth: true }),
    onSuccess: () => client.invalidateQueries({ queryKey: adminKeys.priceRules }),
  });
}

export function useUpdatePriceRule() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdatePriceRuleBody }) =>
      apiFetch<PriceRule>(`/admin/price-rules/${id}`, { method: 'PATCH', body, auth: true }),
    onSuccess: () => client.invalidateQueries({ queryKey: adminKeys.priceRules }),
  });
}

export function useDeletePriceRule() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/admin/price-rules/${id}`, { method: 'DELETE', auth: true }),
    onSuccess: () => client.invalidateQueries({ queryKey: adminKeys.priceRules }),
  });
}

/**
 * Simulador de período (§13).
 *
 * Fica desligado até o dono pedir: sem `enabled`, abrir a tela de preços já
 * dispararia uma simulação de um período que ninguém escolheu.
 */
export function usePriceSimulation(range: { from: string; to: string } | null) {
  return useQuery({
    queryKey: [...adminKeys.priceSimulation, range],
    queryFn: () =>
      apiFetch<PriceSimulation>(`/admin/price-rules/simulate?from=${range?.from}&to=${range?.to}`, {
        auth: true,
      }),
    enabled: range !== null,
  });
}
