import { z } from 'zod';
import { optionalText } from './catalog.js';

/**
 * Endereço do cliente (§9.12, novembro de 2026).
 *
 * Existe para a entrega da decoração: na reserva só de decoração, quem escolhe
 * receber em casa precisa ter um endereço cadastrado, e a reserva guarda uma
 * cópia dele (o cliente pode mudar de endereço depois, e a entrega já combinada
 * continua indo para o lugar certo).
 *
 * Um endereço por conta, no formato dos Correios. O CEP é só número, oito
 * dígitos: é com ele que o formulário busca o resto no ViaCEP, e o mesmo formato
 * na tela e na API evita um CEP com traço passar num lado e não no outro.
 */

/** As 27 unidades da federação, pela sigla. */
export const BRAZIL_STATES = [
  'AC',
  'AL',
  'AM',
  'AP',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MG',
  'MS',
  'MT',
  'PA',
  'PB',
  'PE',
  'PI',
  'PR',
  'RJ',
  'RN',
  'RO',
  'RR',
  'RS',
  'SC',
  'SE',
  'SP',
  'TO',
] as const;
export type BrazilState = (typeof BRAZIL_STATES)[number];

/** CEP: exatamente oito números, sem traço. */
export const cepSchema = z
  .string()
  .trim()
  .regex(/^\d{8}$/, { error: 'Informe o CEP com 8 números.' });

/** Endereço como a API guarda e devolve: já normalizado. */
export const addressSchema = z.object({
  cep: z.string(),
  street: z.string(),
  number: z.string(),
  complement: z.string().nullable(),
  district: z.string(),
  city: z.string(),
  state: z.enum(BRAZIL_STATES),
});

/** Endereço como o formulário envia: as mesmas regras na tela e na API (§12.5). */
export const addressInputSchema = z.object({
  cep: cepSchema,
  street: z
    .string()
    .trim()
    .min(2, { error: 'Informe a rua.' })
    .max(120, { error: 'A rua pode ter no máximo 120 caracteres.' }),
  number: z
    .string()
    .trim()
    .min(1, { error: 'Informe o número. Sem número, escreva s/n.' })
    .max(10, { error: 'O número pode ter no máximo 10 caracteres.' }),
  complement: optionalText(60).default(null),
  district: z
    .string()
    .trim()
    .min(2, { error: 'Informe o bairro.' })
    .max(80, { error: 'O bairro pode ter no máximo 80 caracteres.' }),
  city: z
    .string()
    .trim()
    .min(2, { error: 'Informe a cidade.' })
    .max(80, { error: 'A cidade pode ter no máximo 80 caracteres.' }),
  state: z.enum(BRAZIL_STATES, { error: 'Escolha o estado.' }),
});

export type Address = z.infer<typeof addressSchema>;
export type AddressInput = z.input<typeof addressInputSchema>;
