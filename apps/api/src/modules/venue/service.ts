import type { PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';

/**
 * Dados públicos da chácara (§11.2).
 *
 * Expõe só o que a landing e o wizard precisam mostrar: identificação, o que
 * cabe, horários, contato, regras e os limites de reserva. O preço não sai por
 * aqui — quem decide valor é o `pricing/quote`, que considera dia da semana e
 * período (§9.4).
 */
export async function getPublicVenue(prisma: PrismaClient) {
  const settings = await prisma.venueSettings.findUnique({
    where: { id: 1 },
    /*
     * O `select` repete o que o retorno já monta, e é de propósito: esta rota é
     * pública, e `baseDailyPriceCents` está na mesma linha. Deixar a intenção na
     * consulta é mais barato que confiar em ninguém acrescentar um campo no
     * objeto de retorno sem pensar (§18.2).
     */
    select: {
      name: true,
      maxGuests: true,
      checkInTime: true,
      checkOutTime: true,
      whatsapp: true,
      address: true,
      mapsUrl: true,
      houseRules: true,
      minDays: true,
      maxDays: true,
      minLeadDays: true,
      freeCancelUntilDays: true,
      holdHours: true,
    },
  });

  if (!settings) {
    // Banco sem a linha de configuração significa seed não executado.
    throw new AppError('INTERNAL', 500, 'Configuração da chácara não encontrada.');
  }

  return {
    name: settings.name,
    maxGuests: settings.maxGuests,
    checkInTime: settings.checkInTime,
    checkOutTime: settings.checkOutTime,
    whatsapp: settings.whatsapp,
    address: settings.address,
    mapsUrl: settings.mapsUrl,
    houseRules: settings.houseRules,
    minDays: settings.minDays,
    maxDays: settings.maxDays,
    minLeadDays: settings.minLeadDays,
    freeCancelUntilDays: settings.freeCancelUntilDays,
    holdHours: settings.holdHours,
  };
}
