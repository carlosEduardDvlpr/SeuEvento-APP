import { z } from 'zod';
import { optionalText } from './catalog.js';
import { centsSchema } from './schemas.js';

/**
 * Configurações da chácara (§11.2, §13.4).
 *
 * São os números que governam o resto do sistema: capacidade, duração,
 * antecedência, prazo do pedido, preço base. Errar um deles aqui muda o que o
 * site aceita, então cada campo tem faixa — e a faixa existe para impedir o
 * acidente, não para desconfiar do dono.
 *
 * **Resposta e corpo são schemas diferentes de propósito.** O corpo apara espaço
 * e troca texto vazio por nulo; a resposta só descreve a forma. Usar o schema de
 * entrada para validar a saída fez a rota responder 500 na primeira execução: o
 * `transform` do campo opcional não aceita o nulo que vem do banco.
 */

/** `HH:MM` em 24 horas. O horário é texto no banco (§8), não timestamp. */
const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: 'Informe o horário como HH:MM.' });

/** Faixas compartilhadas pela resposta e pelo corpo, para não divergirem. */
const numbers = {
  baseDailyPriceCents: centsSchema,
  maxGuests: z
    .number()
    .int()
    .min(1, { error: 'A capacidade mínima é 1 pessoa.' })
    .max(2000, { error: 'Confira a capacidade.' }),
  minDays: z.number().int().min(1, { error: 'O mínimo é 1 dia.' }).max(30),
  maxDays: z.number().int().min(1, { error: 'O mínimo é 1 dia.' }).max(30),
  minLeadDays: z.number().int().min(0, { error: 'A antecedência não pode ser negativa.' }).max(365),
  freeCancelUntilDays: z.number().int().min(0).max(365),
  holdHours: z
    .number()
    .int()
    .min(1, { error: 'O prazo mínimo é 1 hora.' })
    .max(720, { error: 'O prazo máximo é 30 dias.' }),
  maxPendingPerUser: z.number().int().min(1).max(50),
};

/** Forma da resposta: sem transformação, para descrever o que o banco guarda. */
export const venueSettingsSchema = z.object({
  name: z.string(),
  ...numbers,
  checkInTime: z.string(),
  checkOutTime: z.string(),
  whatsapp: z.string().nullable(),
  address: z.string().nullable(),
  mapsUrl: z.string().nullable(),
  houseRules: z.string().nullable(),
});

/**
 * Endereço de mapa, opcional.
 *
 * Só `https`: o link vai para a landing, e um `http` ali viraria aviso de
 * conteúdo misto no navegador de quem abre o site.
 */
const mapsUrlInputSchema = optionalText(500)
  .default(null)
  .refine((value) => value === null || /^https:\/\//.test(value), {
    error: 'O endereço do mapa precisa começar com https://.',
  });

/**
 * Corpo do `PUT`. Manda o conjunto inteiro: num `PATCH`, campo ausente ficaria
 * entre "não mexi" e "apague".
 *
 * `minDays <= maxDays` é conferido no objeto inteiro, não no campo. Um mínimo
 * acima do máximo deixaria **nenhuma** duração válida: o site recusaria toda
 * reserva, e o erro apareceria como "período inválido" para o cliente, longe da
 * causa.
 */
export const updateVenueSettingsBodySchema = z
  .object({
    name: z.string().trim().min(2, { error: 'Informe o nome da chácara.' }).max(120),
    ...numbers,
    checkInTime: timeSchema,
    checkOutTime: timeSchema,
    whatsapp: optionalText(40).default(null),
    address: optionalText(300).default(null),
    mapsUrl: mapsUrlInputSchema,
    houseRules: optionalText(2000).default(null),
  })
  .refine((body) => body.minDays <= body.maxDays, {
    error: 'O mínimo de dias não pode ser maior que o máximo.',
    path: ['minDays'],
  });

export type VenueSettings = z.infer<typeof venueSettingsSchema>;
export type UpdateVenueSettingsBody = z.infer<typeof updateVenueSettingsBodySchema>;
