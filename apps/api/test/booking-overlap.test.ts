import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PG_CHECK_VIOLATION, isExclusionViolation, postgresErrorCode } from '../src/lib/errors.js';
import { prisma, truncateAll } from './helpers/db.js';
import { createBooking, createUser } from './helpers/factories.js';

/**
 * A garantia de "zero dupla reserva" (§1.3) mora no banco, não na aplicação:
 * checar disponibilidade antes de inserir sempre deixa uma janela entre a
 * leitura e a escrita. Estes testes provam que a exclusion constraint da §8.1
 * está de pé e com o predicado certo, antes de existir qualquer service.
 */
describe('constraint de sobreposição de reservas', () => {
  let userId: string;

  beforeEach(async () => {
    await truncateAll();
    const user = await createUser();
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('recusa duas reservas PENDING com dias em comum', async () => {
    await createBooking({ userId, startDate: '2031-12-05', endDate: '2031-12-07' });

    const error = await createBooking({
      userId,
      startDate: '2031-12-06',
      endDate: '2031-12-08',
    }).catch((caught: unknown) => caught);

    expect(isExclusionViolation(error)).toBe(true);
    expect(await prisma.booking.count()).toBe(1);
  });

  it('recusa PENDING que colide com CONFIRMED', async () => {
    await createBooking({
      userId,
      startDate: '2031-12-05',
      endDate: '2031-12-06',
      status: 'CONFIRMED',
    });

    const error = await createBooking({
      userId,
      startDate: '2031-12-05',
      endDate: '2031-12-05',
    }).catch((caught: unknown) => caught);

    expect(isExclusionViolation(error)).toBe(true);
  });

  // O intervalo é inclusivo nas duas pontas (§7.3): quem sai no dia 06 ainda
  // ocupa o dia 06, então outra reserva não pode entrar nele.
  it('trata o último dia como ocupado', async () => {
    await createBooking({ userId, startDate: '2031-12-05', endDate: '2031-12-06' });

    const error = await createBooking({
      userId,
      startDate: '2031-12-06',
      endDate: '2031-12-07',
    }).catch((caught: unknown) => caught);

    expect(isExclusionViolation(error)).toBe(true);
  });

  it('aceita reservas em dias encostados, sem dia em comum', async () => {
    await createBooking({ userId, startDate: '2031-12-05', endDate: '2031-12-06' });
    await createBooking({ userId, startDate: '2031-12-07', endDate: '2031-12-08' });

    expect(await prisma.booking.count()).toBe(2);
  });

  it('recusa duas reservas de um único dia na mesma data', async () => {
    await createBooking({ userId, startDate: '2031-12-05', endDate: '2031-12-05' });

    const error = await createBooking({
      userId,
      startDate: '2031-12-05',
      endDate: '2031-12-05',
    }).catch((caught: unknown) => caught);

    expect(isExclusionViolation(error)).toBe(true);
  });

  // CANCELLED e COMPLETED ficam fora do predicado: data cancelada volta a ser
  // reservável, e reserva concluída não pode travar a mesma data no futuro.
  it('permite sobreposição quando as reservas estão CANCELLED', async () => {
    await createBooking({
      userId,
      startDate: '2031-12-05',
      endDate: '2031-12-07',
      status: 'CANCELLED',
    });
    await createBooking({
      userId,
      startDate: '2031-12-06',
      endDate: '2031-12-08',
      status: 'CANCELLED',
    });

    expect(await prisma.booking.count()).toBe(2);
  });

  it('permite reservar dias que uma reserva COMPLETED ocupou', async () => {
    await createBooking({
      userId,
      startDate: '2031-12-05',
      endDate: '2031-12-06',
      status: 'COMPLETED',
    });
    await createBooking({ userId, startDate: '2031-12-05', endDate: '2031-12-06' });

    expect(await prisma.booking.count()).toBe(2);
  });

  it('libera a data depois de cancelar a reserva que a ocupava', async () => {
    const first = await createBooking({ userId, startDate: '2031-12-05', endDate: '2031-12-06' });
    await prisma.booking.update({ where: { id: first.id }, data: { status: 'CANCELLED' } });

    await createBooking({ userId, startDate: '2031-12-05', endDate: '2031-12-06' });

    expect(await prisma.booking.count({ where: { status: 'PENDING' } })).toBe(1);
  });
});

describe('constraint de ordem das datas', () => {
  let userId: string;

  beforeEach(async () => {
    await truncateAll();
    const user = await createUser();
    userId = user.id;
  });

  // Sem este CHECK, endDate < startDate produziria um daterange vazio, que não
  // conflita com nada e furaria a exclusion constraint acima.
  it('recusa endDate anterior ao startDate', async () => {
    const error = await createBooking({
      userId,
      startDate: '2031-12-10',
      endDate: '2031-12-08',
    }).catch((caught: unknown) => caught);

    expect(postgresErrorCode(error)).toBe(PG_CHECK_VIOLATION);
    expect(await prisma.booking.count()).toBe(0);
  });
});
