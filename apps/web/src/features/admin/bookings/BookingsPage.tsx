import type { AdminBookingSummary, BookingStatus } from '@chacara/shared';
import { BOOKING_STATUS_LABELS, BOOKING_STATUSES, EVENT_TYPE_LABELS } from '@chacara/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { useAdminBookings, type BookingFilters } from '@/api/admin-bookings';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { Field } from '@/components/Field';
import { Money } from '@/components/Money';
import { Select } from '@/components/Select';
import { Skeleton } from '@/components/Skeleton';
import { StatusBadge } from '@/components/StatusBadge';
import { useDebouncedValue } from '@/features/booking/useDebouncedValue';
import { formErrorMessage } from '@/lib/form';
import { formatDateRange, formatDateShort, formatTimeUntil } from '@/lib/format';
import adminStyles from '../admin.module.css';
import styles from './BookingsPage.module.css';

/**
 * Lista de reservas do painel (§13.4).
 *
 * Busca por nome, e-mail ou telefone, filtro de status e de período — os três
 * jeitos de o dono procurar: "o pedido da Ana", "o que falta confirmar", "o que
 * tem no fim do mês".
 *
 * Cartões em vez de tabela. Uma tabela de sete colunas rola de lado no celular, e
 * a §13.4 diz que o dono vai usar o painel no celular.
 */

/** Filtros que valem uma requisição. Vazio é ausência, não string em branco. */
function toQuery(filters: {
  status: string;
  from: string;
  to: string;
  q: string;
  page: number;
}): BookingFilters {
  return {
    ...(filters.status ? { status: filters.status as BookingStatus } : {}),
    ...(filters.from ? { from: filters.from } : {}),
    ...(filters.to ? { to: filters.to } : {}),
    ...(filters.q.trim() ? { q: filters.q.trim() } : {}),
    page: filters.page,
  };
}

function BookingCard({ booking }: { booking: AdminBookingSummary }) {
  return (
    <li className={styles.card}>
      <Link className={styles.cardLink} to={`/admin/reservas/${booking.id}`}>
        <span className={styles.cardHead}>
          <StatusBadge status={booking.status} />
          <span className={styles.total}>
            <Money cents={booking.totalCents} />
          </span>
        </span>

        <span className={styles.dates}>{formatDateRange(booking.startDate, booking.endDate)}</span>

        <span className={styles.customer}>
          {booking.customer.name}
          {booking.createdByAdmin ? <span className={styles.tag}>lançada por você</span> : null}
        </span>

        <span className={styles.meta}>
          {EVENT_TYPE_LABELS[booking.eventType]} · {booking.guestCount} pessoas · pedido de{' '}
          {formatDateShort(booking.createdAt.slice(0, 10))}
        </span>

        {/* O prazo é o que decide a ordem de atenção (§13.4). */}
        {booking.status === 'PENDING' && booking.holdExpiresAt ? (
          <span className={styles.hold}>Responder {formatTimeUntil(booking.holdExpiresAt)}</span>
        ) : null}
      </Link>
    </li>
  );
}

export function BookingsPage() {
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  /*
   * A busca espera a pessoa parar de digitar. Sem isso, "Ana Beatriz" viraria
   * onze requisições e a lista piscaria resultados intermediários.
   */
  const debouncedQ = useDebouncedValue(q);

  const bookings = useAdminBookings(toQuery({ status, from, to, q: debouncedQ, page }));

  const total = bookings.data?.total ?? 0;
  const pageSize = bookings.data?.pageSize ?? 20;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const hasFilters = status !== '' || from !== '' || to !== '' || q.trim() !== '';

  /** Mexer num filtro volta para a primeira página; a atual pode não existir mais. */
  function change(apply: () => void) {
    apply();
    setPage(1);
  }

  function clearFilters() {
    setStatus('');
    setFrom('');
    setTo('');
    setQ('');
    setPage(1);
  }

  return (
    <div className={adminStyles.page}>
      <header className={adminStyles.header}>
        <div className={adminStyles.heading}>
          <h1 className={adminStyles.title}>Reservas</h1>
          <p className={adminStyles.subtitle}>
            Procure pelo nome, e-mail ou telefone do cliente, ou filtre por situação e período.
          </p>
        </div>
      </header>

      <div className={styles.filters}>
        <Field
          label="Buscar cliente"
          type="search"
          placeholder="Nome, e-mail ou telefone"
          value={q}
          onChange={(event) => change(() => setQ(event.target.value))}
        />

        <Select
          label="Situação"
          value={status}
          onChange={(event) => change(() => setStatus(event.target.value))}
        >
          <option value="">Todas</option>
          {BOOKING_STATUSES.map((value) => (
            <option key={value} value={value}>
              {BOOKING_STATUS_LABELS[value]}
            </option>
          ))}
        </Select>

        <Field
          label="De"
          type="date"
          value={from}
          onChange={(event) => change(() => setFrom(event.target.value))}
        />

        <Field
          label="Até"
          type="date"
          value={to}
          onChange={(event) => change(() => setTo(event.target.value))}
        />

        {hasFilters ? (
          <Button variant="ghost" className={styles.clear} onClick={clearFilters}>
            Limpar filtros
          </Button>
        ) : null}
      </div>

      {bookings.isError ? (
        <p role="alert">{formErrorMessage(bookings.error) ?? 'Tente de novo em instantes.'}</p>
      ) : null}

      {bookings.isPending ? <Skeleton rows={5} /> : null}

      {bookings.data ? (
        <>
          <p className={styles.count} role="status">
            {total === 0
              ? 'Nenhuma reserva encontrada'
              : `${total} ${total === 1 ? 'reserva' : 'reservas'}`}
          </p>

          {total === 0 ? (
            <EmptyState
              title={hasFilters ? 'Nada com esses filtros' : 'Nenhuma reserva ainda'}
              description={
                hasFilters
                  ? 'Tente outro período, outra situação, ou limpe os filtros para ver tudo.'
                  : 'Quando alguém enviar um pedido pelo site, ele aparece aqui para você confirmar.'
              }
              action={
                hasFilters ? <Button onClick={clearFilters}>Limpar filtros</Button> : undefined
              }
            />
          ) : (
            <ul className={styles.list}>
              {bookings.data.items.map((booking) => (
                <BookingCard key={booking.id} booking={booking} />
              ))}
            </ul>
          )}

          {lastPage > 1 ? (
            <nav className={styles.pager} aria-label="Páginas de reservas">
              <Button onClick={() => setPage((current) => current - 1)} disabled={page <= 1}>
                Anterior
              </Button>

              <span className={styles.pageInfo}>
                Página {page} de {lastPage}
              </span>

              <Button onClick={() => setPage((current) => current + 1)} disabled={page >= lastPage}>
                Próxima
              </Button>
            </nav>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
