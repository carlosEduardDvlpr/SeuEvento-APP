import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import { Pool } from 'pg';

type Status = 'ORCAMENTO' | 'AGUARDANDO_SINAL' | 'CONFIRMADO' | 'CONCLUIDO' | 'CANCELADO';
type ReservationInput = { client: string; phone: string; checkIn: string; checkOut: string; guests: number; total: number; deposit: number; status: Status; notes?: string };
type ReservationRow = { id: string; client: string; phone: string; check_in: string; check_out: string; guests: number; total: string; deposit: string; status: Status };

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://chacara:chacara_dev@localhost:5432/chacara';
const pool = new Pool({ connectionString: databaseUrl });
const app = express();
app.use(cors());
app.use(express.json());

function toReservation(row: ReservationRow) {
  return { id: row.id, client: row.client, phone: row.phone, checkIn: row.check_in, checkOut: row.check_out, guests: row.guests, total: Number(row.total), deposit: Number(row.deposit), status: row.status };
}
async function findOrCreateClient(input: ReservationInput) {
  const existing = await pool.query<{ id: string }>('SELECT id FROM clients WHERE phone = $1 LIMIT 1', [input.phone]);
  if (existing.rowCount) return existing.rows[0].id;
  const created = await pool.query<{ id: string }>('INSERT INTO clients (name, phone) VALUES ($1, $2) RETURNING id', [input.client, input.phone]);
  return created.rows[0].id;
}
function valid(input: Partial<ReservationInput>) {
  return Boolean(input.client && input.phone && input.checkIn && input.checkOut && input.checkIn < input.checkOut && input.guests && input.guests > 0 && input.total !== undefined && input.total >= 0);
}

app.get('/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok' }); }
  catch { res.status(503).json({ status: 'unavailable', message: 'Banco de dados indisponível.' }); }
});
app.get('/api/reservations', async (_req, res, next) => {
  try {
    const result = await pool.query<ReservationRow>(`SELECT r.id, c.name AS client, c.phone, r.check_in, r.check_out, r.guests, r.total, r.deposit, r.status FROM reservations r JOIN clients c ON c.id = r.client_id ORDER BY r.check_in`);
    res.json(result.rows.map(toReservation));
  } catch (error) { next(error); }
});
app.post('/api/reservations', async (req, res, next) => {
  const input = req.body as ReservationInput;
  if (!valid(input)) return res.status(400).json({ message: 'Dados da reserva inválidos.' });
  try {
    const clientId = await findOrCreateClient(input);
    const result = await pool.query<ReservationRow>(`INSERT INTO reservations (client_id, check_in, check_out, guests, total, deposit, status, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, $9::varchar AS client, $10::varchar AS phone, check_in, check_out, guests, total, deposit, status`, [clientId, input.checkIn, input.checkOut, input.guests, input.total, input.deposit ?? 0, input.status ?? 'ORCAMENTO', input.notes ?? null, input.client, input.phone]);
    return res.status(201).json(toReservation(result.rows[0]));
  } catch (error) { return next(error); }
});
app.patch('/api/reservations/:id', async (req, res, next) => {
  const input = req.body as Partial<Pick<ReservationInput, 'checkIn' | 'checkOut' | 'guests' | 'total' | 'deposit' | 'status' | 'notes'>>;
  try {
    const result = await pool.query<ReservationRow>(`UPDATE reservations SET check_in=COALESCE($2,check_in), check_out=COALESCE($3,check_out), guests=COALESCE($4,guests), total=COALESCE($5,total), deposit=COALESCE($6,deposit), status=COALESCE($7,status), notes=COALESCE($8,notes), updated_at=now() WHERE id=$1 RETURNING id, (SELECT name FROM clients WHERE id=client_id) AS client, (SELECT phone FROM clients WHERE id=client_id) AS phone, check_in, check_out, guests, total, deposit, status`, [req.params.id, input.checkIn ?? null, input.checkOut ?? null, input.guests ?? null, input.total ?? null, input.deposit ?? null, input.status ?? null, input.notes ?? null]);
    if (!result.rowCount) return res.status(404).json({ message: 'Reserva não encontrada.' });
    return res.json(toReservation(result.rows[0]));
  } catch (error) { return next(error); }
});
app.get('/api/dashboard', async (_req, res, next) => {
  try {
    const result = await pool.query<{ revenue: string; pending: string; upcoming: string }>(`SELECT COALESCE(SUM(total) FILTER (WHERE status IN ('CONFIRMADO','CONCLUIDO')),0) AS revenue, COUNT(*) FILTER (WHERE status='AGUARDANDO_SINAL') AS pending, COUNT(*) FILTER (WHERE status='CONFIRMADO' AND check_out >= CURRENT_DATE) AS upcoming FROM reservations`);
    res.json({ revenue: Number(result.rows[0].revenue), occupancy: 0, pending: Number(result.rows[0].pending), upcoming: Number(result.rows[0].upcoming) });
  } catch (error) { next(error); }
});
app.use((error: { code?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error.code === '23P01') return res.status(409).json({ message: 'Já existe uma reserva neste período.' });
  console.error(error); return res.status(500).json({ message: 'Não foi possível concluir a operação.' });
});
const port = Number(process.env.PORT ?? 3333);
app.listen(port, () => console.log(`API em http://localhost:${port}`));
