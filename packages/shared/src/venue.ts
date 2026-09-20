import { z } from 'zod';

/**
 * Contrato de `GET /public/venue` (§11.2).
 *
 * Vive aqui para a API validar a resposta e o SPA tipar o consumo a partir da
 * mesma fonte: se um campo sair, o `tsc` acusa no front antes de virar `undefined`
 * em produção.
 *
 * Preço não faz parte: quem decide valor é o `pricing/quote`, que considera dia
 * da semana e período (§9.4).
 */
export const publicVenueSchema = z.object({
  name: z.string(),
  maxGuests: z.number().int(),
  checkInTime: z.string(),
  checkOutTime: z.string(),

  // Nulos são esperados: o seed não inventa contato nem regra da casa (§16.6),
  // então a interface precisa saber lidar com ausência.
  whatsapp: z.string().nullable(),
  address: z.string().nullable(),
  mapsUrl: z.string().nullable(),
  houseRules: z.string().nullable(),

  minDays: z.number().int(),
  maxDays: z.number().int(),
  minLeadDays: z.number().int(),
  freeCancelUntilDays: z.number().int(),
  holdHours: z.number().int(),
});

export type PublicVenue = z.infer<typeof publicVenueSchema>;
