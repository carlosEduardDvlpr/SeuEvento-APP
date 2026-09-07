import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, ReservationStatus } from '../src/generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL ?? 'postgresql://chacara:chacara_dev@localhost:5432/chacara';
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const seeds = [
  { name: 'Mariana Costa', phone: '(11) 99999-0021', checkIn: '2026-09-12', checkOut: '2026-09-14', guests: 18, total: 2800, deposit: 840, status: ReservationStatus.CONFIRMADO },
  { name: 'Família Oliveira', phone: '(11) 98888-1040', checkIn: '2026-09-19', checkOut: '2026-09-20', guests: 12, total: 1500, deposit: 0, status: ReservationStatus.AGUARDANDO_SINAL },
  { name: 'Ana Beatriz', phone: '(11) 97777-4358', checkIn: '2026-09-26', checkOut: '2026-09-28', guests: 24, total: 3400, deposit: 1020, status: ReservationStatus.CONFIRMADO }
];

async function main() {
  for (const item of seeds) {
    const client = await prisma.client.upsert({ where: { phone: item.phone }, update: { name: item.name }, create: { name: item.name, phone: item.phone } });
    const existing = await prisma.reservation.findFirst({ where: { clientId: client.id, checkIn: new Date(item.checkIn) } });
    if (!existing) await prisma.reservation.create({ data: { clientId: client.id, checkIn: new Date(item.checkIn), checkOut: new Date(item.checkOut), guests: item.guests, total: item.total, deposit: item.deposit, status: item.status } });
  }
}

main().then(() => prisma.$disconnect()).catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
