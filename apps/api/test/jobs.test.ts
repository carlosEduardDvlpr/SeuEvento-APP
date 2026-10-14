import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

type SentEmail = { to: string; subject: string; text: string; html: string };

const { outbox } = vi.hoisted(() => ({ outbox: [] as SentEmail[] }));

vi.mock('../src/lib/mailer.js', () => ({
  sendMail: async (mail: SentEmail) => {
    outbox.push(mail);
  },
  resetMailerForTests: () => {},
}));

const { runCompleteBookings } = await import('../src/jobs/complete-bookings.js');
const { runExpireHolds } = await import('../src/jobs/expire-holds.js');
const { addDays, todayInSaoPaulo } = await import('../src/lib/dates.js');
const { prisma, truncateAll } = await import('./helpers/db.js');
const { createBooking, createUser } = await import('./helpers/factories.js');

/**
 * Jobs do ciclo de vida da reserva (§9.9).
 *
 * Os dois têm de ser **idempotentes e seguros para rodar duas vezes**: o cron da
 * plataforma pode disparar sobreposto, e um deploy pode rodar o job do ciclo
 * anterior. Cada bloco tem o caso da segunda execução.
 */
describe('jobs', () => {
  const HOLD_HOURS = 48;

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll();
    outbox.length = 0;

    await prisma.venueSettings.create({
      data: {
        id: 1,
        name: 'Chácara Seu Evento',
        baseDailyPriceCents: 150000,
        maxGuests: 120,
        holdHours: HOLD_HOURS,
      },
    });
  });

  function hoursAgo(hours: number) {
    return new Date(Date.now() - hours * 60 * 60 * 1000);
  }

  function hoursFromNow(hours: number) {
    return new Date(Date.now() + hours * 60 * 60 * 1000);
  }

  async function client(email: string | null = 'ana@exemplo.com') {
    return createUser({ name: 'Ana Beatriz', email });
  }

  describe('expire-holds', () => {
    it('cancela o pedido cujo prazo venceu, com o motivo e sem prazo', async () => {
      const user = await client();
      const booking = await createBooking({
        userId: user.id,
        startDate: '2027-09-10',
        endDate: '2027-09-11',
        holdExpiresAt: hoursAgo(1),
      });

      const summary = await runExpireHolds({ prisma });

      expect(summary).toEqual({ found: 1, cancelled: 1, notified: 1 });
      expect(await prisma.booking.findUnique({ where: { id: booking.id } })).toMatchObject({
        status: 'CANCELLED',
        cancelReason: 'HOLD_EXPIRED',
        holdExpiresAt: null,
        /*
         * Nulo de propósito: o job não é CLIENT nem ADMIN (§8). Nulo com
         * HOLD_EXPIRED é como se lê "o prazo acabou".
         */
        cancelledBy: null,
      });
    });

    it('não toca em pedido que ainda está no prazo', async () => {
      const user = await client();
      const booking = await createBooking({
        userId: user.id,
        startDate: '2027-09-10',
        endDate: '2027-09-10',
        holdExpiresAt: hoursFromNow(2),
      });

      const summary = await runExpireHolds({ prisma });

      expect(summary.found).toBe(0);
      expect(await prisma.booking.findUnique({ where: { id: booking.id } })).toMatchObject({
        status: 'PENDING',
      });
    });

    /*
     * Prazo nulo numa PENDING é bug de dado, e a disponibilidade trata como "ainda
     * segurando" (§9.1). O job precisa concordar: cancelar aqui liberaria uma data
     * que a consulta considera ocupada, e os dois lados discordariam.
     */
    it('não toca em pedido sem prazo definido', async () => {
      const user = await client();
      const booking = await createBooking({
        userId: user.id,
        startDate: '2027-09-10',
        endDate: '2027-09-10',
        holdExpiresAt: null,
      });

      const summary = await runExpireHolds({ prisma });

      expect(summary.found).toBe(0);
      expect(await prisma.booking.findUnique({ where: { id: booking.id } })).toMatchObject({
        status: 'PENDING',
      });
    });

    /* Reserva confirmada não tem prazo: confirmar é justamente tirá-lo (§9.2). */
    it('não toca em reserva confirmada, cancelada ou concluída', async () => {
      const user = await client();

      // Dias distintos para a constraint da §8.1 não recusar a CONFIRMED.
      const outros = [
        { status: 'CONFIRMED' as const, date: '2027-09-10' },
        { status: 'CANCELLED' as const, date: '2027-09-11' },
        { status: 'COMPLETED' as const, date: '2027-09-12' },
      ];

      for (const { status, date } of outros) {
        await createBooking({
          userId: user.id,
          startDate: date,
          endDate: date,
          status,
          // Prazo vencido de propósito: é o status que deve manter o job longe.
          holdExpiresAt: hoursAgo(1),
        });
      }

      const summary = await runExpireHolds({ prisma });

      expect(summary.found).toBe(0);
      expect(await prisma.booking.count({ where: { status: 'CONFIRMED' } })).toBe(1);
      expect(await prisma.booking.count({ where: { status: 'COMPLETED' } })).toBe(1);
    });

    it('avisa o cliente, dizendo que as datas voltaram', async () => {
      const user = await client();
      await createBooking({
        userId: user.id,
        startDate: '2027-09-10',
        endDate: '2027-09-11',
        holdExpiresAt: hoursAgo(1),
      });

      await runExpireHolds({ prisma });

      expect(outbox).toHaveLength(1);
      expect(outbox[0]?.to).toBe('ana@exemplo.com');
      expect(outbox[0]?.subject).toBe('Seu pedido de reserva expirou');
      expect(outbox[0]?.text).toContain('10 a 11 de setembro de 2027');
      expect(outbox[0]?.text).toContain(`${HOLD_HOURS} horas`);
    });

    it('cancela mesmo sem ter para quem avisar', async () => {
      // Cliente criado pelo admin, sem e-mail (§9.8).
      const user = await client(null);
      await createBooking({
        userId: user.id,
        startDate: '2027-09-10',
        endDate: '2027-09-10',
        holdExpiresAt: hoursAgo(1),
      });

      const summary = await runExpireHolds({ prisma });

      expect(summary).toEqual({ found: 1, cancelled: 1, notified: 0 });
      expect(outbox).toHaveLength(0);
    });

    it('trata vários pedidos vencidos numa rodada', async () => {
      const ana = await client('ana@exemplo.com');
      const bia = await client('bia@exemplo.com');
      await createBooking({
        userId: ana.id,
        startDate: '2027-09-10',
        endDate: '2027-09-10',
        holdExpiresAt: hoursAgo(1),
      });
      await createBooking({
        userId: bia.id,
        startDate: '2027-09-20',
        endDate: '2027-09-20',
        holdExpiresAt: hoursAgo(3),
      });

      const summary = await runExpireHolds({ prisma });

      expect(summary).toEqual({ found: 2, cancelled: 2, notified: 2 });
      expect(outbox.map((mail) => mail.to).sort()).toEqual(['ana@exemplo.com', 'bia@exemplo.com']);
    });

    /* O cron pode disparar sobreposto, e um deploy pode repetir o ciclo (§9.9). */
    it('rodar de novo não faz nada e não manda e-mail repetido', async () => {
      const user = await client();
      await createBooking({
        userId: user.id,
        startDate: '2027-09-10',
        endDate: '2027-09-10',
        holdExpiresAt: hoursAgo(1),
      });

      await runExpireHolds({ prisma });
      outbox.length = 0;

      const second = await runExpireHolds({ prisma });

      expect(second).toEqual({ found: 0, cancelled: 0, notified: 0 });
      expect(outbox).toHaveLength(0);
    });

    /* O `now` entra por parâmetro para o teste não mexer no relógio. */
    it('respeita o instante que recebe', async () => {
      const user = await client();
      await createBooking({
        userId: user.id,
        startDate: '2027-09-10',
        endDate: '2027-09-10',
        holdExpiresAt: hoursFromNow(2),
      });

      // Olhando daqui a 3 horas, o mesmo pedido já está vencido.
      const summary = await runExpireHolds({ prisma, now: hoursFromNow(3) });

      expect(summary.cancelled).toBe(1);
    });

    it('a data cancelada volta a ficar livre', async () => {
      const user = await client();
      await createBooking({
        userId: user.id,
        startDate: '2027-09-10',
        endDate: '2027-09-10',
        holdExpiresAt: hoursAgo(1),
      });

      await runExpireHolds({ prisma });

      const active = await prisma.booking.count({
        where: { status: { in: ['PENDING', 'CONFIRMED'] } },
      });
      expect(active).toBe(0);
    });
  });

  describe('complete-bookings', () => {
    it('conclui a reserva confirmada que já terminou', async () => {
      const user = await client();
      const booking = await createBooking({
        userId: user.id,
        startDate: addDays(todayInSaoPaulo(), -5),
        endDate: addDays(todayInSaoPaulo(), -4),
        status: 'CONFIRMED',
      });

      const summary = await runCompleteBookings({ prisma });

      expect(summary).toEqual({ completed: 1 });
      expect(await prisma.booking.findUnique({ where: { id: booking.id } })).toMatchObject({
        status: 'COMPLETED',
      });
    });

    /*
     * A comparação é `endDate < hoje`, estritamente: a festa que termina hoje
     * pode estar acontecendo agora, e a saída da chácara é às 22h.
     */
    it('não conclui reserva que termina hoje', async () => {
      const user = await client();
      const booking = await createBooking({
        userId: user.id,
        startDate: addDays(todayInSaoPaulo(), -1),
        endDate: todayInSaoPaulo(),
        status: 'CONFIRMED',
      });

      const summary = await runCompleteBookings({ prisma });

      expect(summary).toEqual({ completed: 0 });
      expect(await prisma.booking.findUnique({ where: { id: booking.id } })).toMatchObject({
        status: 'CONFIRMED',
      });
    });

    it('não conclui reserva futura', async () => {
      const user = await client();
      await createBooking({
        userId: user.id,
        startDate: '2027-09-10',
        endDate: '2027-09-10',
        status: 'CONFIRMED',
      });

      expect(await runCompleteBookings({ prisma })).toEqual({ completed: 0 });
    });

    /* Pedido nunca confirmado não "acontece": quem cuida dele é o outro job. */
    it('não conclui pedido aguardando confirmação nem reserva cancelada', async () => {
      const user = await client();
      const past = addDays(todayInSaoPaulo(), -5);
      await createBooking({ userId: user.id, startDate: past, endDate: past, status: 'PENDING' });
      await createBooking({
        userId: user.id,
        startDate: addDays(past, 1),
        endDate: addDays(past, 1),
        status: 'CANCELLED',
      });

      expect(await runCompleteBookings({ prisma })).toEqual({ completed: 0 });
      expect(await prisma.booking.count({ where: { status: 'COMPLETED' } })).toBe(0);
    });

    /* A §17 não prevê aviso de conclusão: a festa acabou, o e-mail não serve. */
    it('não manda e-mail algum', async () => {
      const user = await client();
      await createBooking({
        userId: user.id,
        startDate: addDays(todayInSaoPaulo(), -5),
        endDate: addDays(todayInSaoPaulo(), -4),
        status: 'CONFIRMED',
      });

      await runCompleteBookings({ prisma });

      expect(outbox).toHaveLength(0);
    });

    it('conclui várias numa rodada', async () => {
      const user = await client();
      for (const offset of [-10, -8, -6]) {
        await createBooking({
          userId: user.id,
          startDate: addDays(todayInSaoPaulo(), offset),
          endDate: addDays(todayInSaoPaulo(), offset),
          status: 'CONFIRMED',
        });
      }

      expect(await runCompleteBookings({ prisma })).toEqual({ completed: 3 });
    });

    it('rodar de novo não faz nada', async () => {
      const user = await client();
      await createBooking({
        userId: user.id,
        startDate: addDays(todayInSaoPaulo(), -5),
        endDate: addDays(todayInSaoPaulo(), -4),
        status: 'CONFIRMED',
      });

      await runCompleteBookings({ prisma });

      expect(await runCompleteBookings({ prisma })).toEqual({ completed: 0 });
    });

    /*
     * "Hoje" no fuso do negócio, não no do servidor: o job roda em UTC, e perto
     * da meia-noite os dois discordam de um dia (§7.3).
     */
    it('respeita o instante que recebe, no fuso do negócio', async () => {
      const user = await client();
      await createBooking({
        userId: user.id,
        startDate: '2027-09-10',
        endDate: '2027-09-10',
        status: 'CONFIRMED',
      });

      // Olhando de 12/09/2027, a reserva de 10/09 já terminou.
      const summary = await runCompleteBookings({
        prisma,
        now: new Date('2027-09-12T15:00:00.000Z'),
      });

      expect(summary).toEqual({ completed: 1 });
    });
  });

  /** Os dois juntos não disputam reserva nenhuma: os filtros não se cruzam. */
  it('os dois jobs na mesma rodada não se atrapalham', async () => {
    const user = await client();
    const past = addDays(todayInSaoPaulo(), -5);

    const toExpire = await createBooking({
      userId: user.id,
      startDate: '2027-09-10',
      endDate: '2027-09-10',
      holdExpiresAt: hoursAgo(1),
    });
    const toComplete = await createBooking({
      userId: user.id,
      startDate: past,
      endDate: past,
      status: 'CONFIRMED',
    });

    const [expired, completed] = await Promise.all([
      runExpireHolds({ prisma }),
      runCompleteBookings({ prisma }),
    ]);

    expect(expired.cancelled).toBe(1);
    expect(completed.completed).toBe(1);
    expect(await prisma.booking.findUnique({ where: { id: toExpire.id } })).toMatchObject({
      status: 'CANCELLED',
    });
    expect(await prisma.booking.findUnique({ where: { id: toComplete.id } })).toMatchObject({
      status: 'COMPLETED',
    });
  });
});
