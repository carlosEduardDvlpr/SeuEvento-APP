import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import cors from 'cors';
import express from 'express';
import { PrismaClient, ReservationStatus } from './generated/prisma/client.js';

type ReservationInput = { client: string; phone: string; checkIn: string; checkOut: string; guests: number; total: number; deposit?: number; status?: ReservationStatus; notes?: string };
const connectionString = process.env.DATABASE_URL ?? 'postgresql://chacara:chacara_dev@localhost:5432/chacara';
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const app = express();
app.use(cors());
app.use(express.json());

function serialize(reservation: { id: string; checkIn: Date; checkOut: Date; guests: number; total: { toNumber(): number }; deposit: { toNumber(): number }; status: ReservationStatus; client: { name: string; phone: string } }) {
  return { id: reservation.id, client: reservation.client.name, phone: reservation.client.phone, checkIn: reservation.checkIn.toISOString().slice(0, 10), checkOut: reservation.checkOut.toISOString().slice(0, 10), guests: reservation.guests, total: reservation.total.toNumber(), deposit: reservation.deposit.toNumber(), status: reservation.status };
}
function valid(input: Partial<ReservationInput>) {
  return Boolean(input.client && input.phone && input.checkIn && input.checkOut && input.checkIn < input.checkOut && input.guests && input.guests > 0 && input.total !== undefined && input.total >= 0);
}
function datesOverlap(checkIn: string, checkOut: string, excludedId?: string) {
  return prisma.reservation.findFirst({ where: { id: excludedId ? { not: excludedId } : undefined, status: { not: ReservationStatus.CANCELADO }, checkIn: { lt: new Date(checkOut) }, checkOut: { gt: new Date(checkIn) } } });
}

app.get('/health', async (_req, res) => {
  try { await prisma.$queryRaw`SELECT 1`; res.json({ status: 'ok' }); }
  catch { res.status(503).json({ status: 'unavailable', message: 'Banco de dados indisponível.' }); }
});
app.get('/api/reservations', async (_req, res, next) => {
  try { res.json((await prisma.reservation.findMany({ include: { client: true }, orderBy: { checkIn: 'asc' } })).map(serialize)); }
  catch (error) { next(error); }
});
app.post('/api/reservations', async (req, res, next) => {
  const input = req.body as ReservationInput;
  if (!valid(input)) return res.status(400).json({ message: 'Dados da reserva inválidos.' });
  try {
    if (await datesOverlap(input.checkIn, input.checkOut)) return res.status(409).json({ message: 'Já existe uma reserva neste período.' });
    const client = await prisma.client.upsert({ where: { phone: input.phone }, update: { name: input.client }, create: { name: input.client, phone: input.phone } });
    const reservation = await prisma.reservation.create({ data: { clientId: client.id, checkIn: new Date(input.checkIn), checkOut: new Date(input.checkOut), guests: input.guests, total: input.total, deposit: input.deposit ?? 0, status: input.status ?? ReservationStatus.ORCAMENTO, notes: input.notes }, include: { client: true } });
    return res.status(201).json(serialize(reservation));
  } catch (error) { return next(error); }
});
app.patch('/api/reservations/:id', async (req, res, next) => {
  const input = req.body as Partial<Omit<ReservationInput, 'client' | 'phone'>>;
  try {
    const current = await prisma.reservation.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ message: 'Reserva não encontrada.' });
    const checkIn = input.checkIn ?? current.checkIn.toISOString().slice(0, 10);
    const checkOut = input.checkOut ?? current.checkOut.toISOString().slice(0, 10);
    if (checkIn >= checkOut) return res.status(400).json({ message: 'Período inválido.' });
    if (await datesOverlap(checkIn, checkOut, current.id)) return res.status(409).json({ message: 'Já existe uma reserva neste período.' });
    const reservation = await prisma.reservation.update({ where: { id: current.id }, data: { checkIn: input.checkIn ? new Date(input.checkIn) : undefined, checkOut: input.checkOut ? new Date(input.checkOut) : undefined, guests: input.guests, total: input.total, deposit: input.deposit, status: input.status, notes: input.notes }, include: { client: true } });
    return res.json(serialize(reservation));
  } catch (error) { return next(error); }
});
app.get('/api/dashboard', async (_req, res, next) => {
  try {
    const [revenue, pending, upcoming] = await prisma.$transaction([
      prisma.reservation.aggregate({ _sum: { total: true }, where: { status: { in: [ReservationStatus.CONFIRMADO, ReservationStatus.CONCLUIDO] } } }),
      prisma.reservation.count({ where: { status: ReservationStatus.AGUARDANDO_SINAL } }),
      prisma.reservation.count({ where: { status: ReservationStatus.CONFIRMADO, checkOut: { gte: new Date() } } })
    ]);
    res.json({ revenue: revenue._sum.total?.toNumber() ?? 0, occupancy: 0, pending, upcoming });
  } catch (error) { next(error); }
});
app.use((error: { code?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error.code === 'P2002' || error.code === 'P2010') return res.status(409).json({ message: 'Já existe uma reserva neste período.' });
  console.error(error); return res.status(500).json({ message: 'Não foi possível concluir a operação.' });
});
const port = Number(process.env.PORT ?? 3333);
app.listen(port, () => console.log(`API em http://localhost:${port}`));
