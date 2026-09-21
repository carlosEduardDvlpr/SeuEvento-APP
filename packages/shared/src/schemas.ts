import { z } from 'zod';
import {
  BOOKING_STATUSES,
  DAY_STATUSES,
  DISCOUNT_TYPES,
  EVENT_TYPES,
  GALLERY_KINDS,
  ROLES,
} from './enums.js';

/**
 * Schemas Zod compartilhados (§4).
 *
 * São blocos de contrato: formato de data, dinheiro, e-mail, senha. A API usa
 * para validar a requisição e o SPA usa para validar o formulário antes de
 * enviar, de modo que as duas pontas nunca discordam do que é válido.
 *
 * Regra de negócio não entra aqui: se depende do banco ou de VenueSettings,
 * o lugar é o service.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Verifica se a string é um dia que existe no calendário.
 *
 * Repete a checagem de `apps/api/src/lib/dates.ts` de propósito: o pacote
 * compartilhado não pode importar da API, e são três linhas. Duplicar é melhor
 * que inverter a dependência (§2.1).
 */
function isRealCalendarDay(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Dia do calendário, 'YYYY-MM-DD' (§7.3). */
export const isoDateSchema = z
  .string()
  .regex(ISO_DATE, { error: 'Use o formato AAAA-MM-DD.' })
  .refine(isRealCalendarDay, { error: 'Esta data não existe no calendário.' });

/** Dinheiro: inteiro em centavos, nunca negativo (§7.2). */
export const centsSchema = z
  .number()
  .int({ error: 'O valor deve ser um número inteiro de centavos.' })
  .min(0, { error: 'O valor não pode ser negativo.' });

/** Percentual de desconto: inteiro de 1 a 100 (§7.2). */
export const discountPercentSchema = z
  .number()
  .int({ error: 'O desconto deve ser um número inteiro.' })
  .min(1, { error: 'O desconto mínimo é 1%.' })
  .max(100, { error: 'O desconto máximo é 100%.' });

/** E-mail normalizado antes de qualquer consulta (§10.1). */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Informe um e-mail válido.' }));

/** Senha: 8 a 128 caracteres, sem regra de composição irritante (§10.1). */
export const passwordSchema = z
  .string()
  .min(8, { error: 'A senha precisa ter pelo menos 8 caracteres.' })
  .max(128, { error: 'A senha pode ter no máximo 128 caracteres.' });

export const nameSchema = z
  .string()
  .trim()
  .min(2, { error: 'Informe o nome completo.' })
  .max(120, { error: 'O nome pode ter no máximo 120 caracteres.' });

/**
 * Telefone brasileiro para WhatsApp. Guarda só os dígitos, aceitando o que a
 * pessoa digitar com parênteses, espaço ou traço.
 */
export const phoneSchema = z
  .string()
  .transform((value) => value.replace(/\D/g, ''))
  .refine((digits) => digits.length === 10 || digits.length === 11, {
    error: 'Informe o WhatsApp com DDD, como (11) 99999-0000.',
  });

/** Cor de paleta de estilo, sempre em `#RRGGBB` (§14.3). */
export const hexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, { error: 'Use uma cor no formato #RRGGBB.' });

export const paletteColorSchema = z.object({
  name: z.string().trim().min(1, { error: 'Dê um nome à cor.' }),
  hex: hexColorSchema,
});

/**
 * Paleta de um estilo: exatamente 5 cores (§15.3).
 *
 * O número é fixo porque o cartão de estilo mapeia a paleta em `--t1` a `--t5`
 * (§14.3); uma paleta menor deixaria variável de CSS sem valor.
 */
export const paletteSchema = z.array(paletteColorSchema).length(5, {
  error: 'Um estilo tem exatamente 5 cores.',
});

export type PaletteColor = z.infer<typeof paletteColorSchema>;
export type ThemePalette = z.infer<typeof paletteSchema>;

export const roleSchema = z.enum(ROLES);
export const bookingStatusSchema = z.enum(BOOKING_STATUSES);
export const discountTypeSchema = z.enum(DISCOUNT_TYPES);
export const eventTypeSchema = z.enum(EVENT_TYPES);
export const galleryKindSchema = z.enum(GALLERY_KINDS);
export const dayStatusSchema = z.enum(DAY_STATUSES);

/** Paginação das listas do admin (§11.1). */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** Envelope das listas paginadas do admin (§11.1). */
export function paginatedSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  });
}

/**
 * Intervalo de dias da reserva. Inclusivo nas duas pontas, então
 * `startDate === endDate` é uma reserva de um dia (§7.3).
 */
export const dateRangeSchema = z
  .object({ startDate: isoDateSchema, endDate: isoDateSchema })
  .refine(({ startDate, endDate }) => startDate <= endDate, {
    error: 'A data de saída não pode ser anterior à de entrada.',
    path: ['endDate'],
  });

export type DateRange = z.infer<typeof dateRangeSchema>;
export type Pagination = z.infer<typeof paginationSchema>;
