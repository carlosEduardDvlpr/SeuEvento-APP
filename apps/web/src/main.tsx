import { CalendarDays, CircleDollarSign, Clock3, Users, ArrowUpRight, Plus, Bell, Menu } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type Reservation = { id: string; client: string; checkIn: string; checkOut: string; guests: number; total: number; status: string };
const fallback: Reservation[] = [
  { id: 'r1', client: 'Mariana Costa', checkIn: '2026-09-12', checkOut: '2026-09-14', guests: 18, total: 2800, status: 'CONFIRMADO' },
  { id: 'r2', client: 'Família Oliveira', checkIn: '2026-09-19', checkOut: '2026-09-20', guests: 12, total: 1500, status: 'AGUARDANDO_SINAL' },
  { id: 'r3', client: 'Ana Beatriz', checkIn: '2026-09-26', checkOut: '2026-09-28', guests: 24, total: 3400, status: 'CONFIRMADO' }
];
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

function App() {
  const [reservations, setReservations] = useState<Reservation[]>(fallback);
  const [dashboard, setDashboard] = useState({ revenue: 6200, occupancy: 64, pending: 1, upcoming: 2 });
  useEffect(() => { Promise.all([fetch('http://localhost:3333/api/reservations').then(r => r.json()), fetch('http://localhost:3333/api/dashboard').then(r => r.json())]).then(([items, metrics]) => { setReservations(items); setDashboard(metrics); }).catch(() => undefined); }, []);
  const cards = [
    ['Faturamento previsto', money.format(dashboard.revenue), CircleDollarSign, 'Neste mês'],
    ['Taxa de ocupação', `${dashboard.occupancy}%`, CalendarDays, 'Setembro de 2026'],
    ['Reservas próximas', String(dashboard.upcoming), Users, 'Confirmadas'],
    ['Aguardando sinal', String(dashboard.pending), Clock3, 'Ação necessária']
  ];
  return <div className="app">
    <aside><div className="brand"><span>◆</span> Recanto Verde</div><nav><a className="active">Visão geral</a><a>Agenda</a><a>Reservas</a><a>Clientes</a><a>Financeiro</a></nav><div className="aside-footer">Configurações<br/><small>Administrador</small></div></aside>
    <main><header><div><button className="mobile"><Menu size={20}/></button><p className="eyebrow">SEGUNDA-FEIRA, 7 DE SETEMBRO</p><h1>Bom dia, Carlos <span>☀</span></h1></div><div className="actions"><button className="icon"><Bell size={19}/></button><button className="new"><Plus size={18}/> Nova reserva</button></div></header>
      <section className="metrics">{cards.map(([label, value, Icon, caption]) => <article className="metric" key={String(label)}><div className="metric-top"><span>{label}</span><i><Icon size={19}/></i></div><strong>{value}</strong><small>{caption}</small></article>)}</section>
      <section className="grid"><article className="panel calendar"><div className="panel-head"><div><p className="eyebrow">OCUPAÇÃO</p><h2>Agenda de setembro</h2></div><button>Ver agenda <ArrowUpRight size={16}/></button></div><div className="week">{['SEG','TER','QUA','QUI','SEX','SÁB','DOM'].map(d => <span key={d}>{d}</span>)}</div><div className="days">{Array.from({length: 30}, (_, i) => <div className={[11,12,13,18,19,25,26,27].includes(i) ? 'booked' : ''} key={i}><b>{i + 1}</b>{[11,18,25].includes(i) && <em>Reserva</em>}</div>)}</div><div className="legend"><span><i className="dot available"/>Disponível</span><span><i className="dot reserved"/>Reservado</span></div></article>
        <article className="panel upcoming"><div className="panel-head"><div><p className="eyebrow">PRÓXIMAS</p><h2>Reservas</h2></div><button>Ver todas <ArrowUpRight size={16}/></button></div>{reservations.map(r => <div className="booking" key={r.id}><div className="date"><b>{new Date(`${r.checkIn}T12:00:00`).getDate()}</b><span>SET</span></div><div><strong>{r.client}</strong><p>{r.guests} pessoas · {r.checkIn.slice(8,10)}–{r.checkOut.slice(8,10)} set</p></div><span className={r.status === 'CONFIRMADO' ? 'tag confirmed' : 'tag waiting'}>{r.status === 'CONFIRMADO' ? 'Confirmada' : 'Aguardando'}</span></div>)}</article></section>
    </main></div>;
}
createRoot(document.getElementById('root')!).render(<App />);
