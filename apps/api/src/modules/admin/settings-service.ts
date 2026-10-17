import type { UpdateVenueSettingsBody, VenueSettings } from '@chacara/shared';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';

/**
 * Configurações da chácara (§11.2, §13.4).
 *
 * `VenueSettings` é linha única (`id = 1`, §8), então não há CRUD: existe ler e
 * existe substituir. `PUT` e não `PATCH` de propósito — o formulário manda o
 * conjunto inteiro, e campo ausente num `PATCH` seria ambíguo entre "não mexi" e
 * "apague".
 */

const settingsSelect = {
  name: true,
  baseDailyPriceCents: true,
  maxGuests: true,
  minDays: true,
  maxDays: true,
  minLeadDays: true,
  freeCancelUntilDays: true,
  holdHours: true,
  maxPendingPerUser: true,
  checkInTime: true,
  checkOutTime: true,
  whatsapp: true,
  address: true,
  mapsUrl: true,
  houseRules: true,
} as const;

export async function getVenueSettings(prisma: PrismaClient): Promise<VenueSettings> {
  const settings = await prisma.venueSettings.findUnique({
    where: { id: 1 },
    select: settingsSelect,
  });

  // Sem a linha, o seed não rodou. Criar aqui esconderia o problema de instalação.
  if (!settings) {
    throw new AppError('INTERNAL', 500, 'Configuração da chácara não encontrada.');
  }

  return settings;
}

export async function updateVenueSettings(
  prisma: PrismaClient,
  body: UpdateVenueSettingsBody,
): Promise<VenueSettings> {
  const existing = await prisma.venueSettings.findUnique({
    where: { id: 1 },
    select: { id: true },
  });

  if (!existing) {
    throw new AppError('INTERNAL', 500, 'Configuração da chácara não encontrada.');
  }

  return prisma.venueSettings.update({
    where: { id: 1 },
    data: body,
    select: settingsSelect,
  });
}
