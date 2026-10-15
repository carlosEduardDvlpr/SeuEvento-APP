import type { Booking } from '@chacara/shared';
import { EVENT_TYPE_LABELS, todayInSaoPaulo } from '@chacara/shared';
import { Link } from 'react-router';
import { useMyBookings } from '@/api/bookings';
import { EmptyState } from '@/components/EmptyState';
import { Money } from '@/components/Money';
import { Skeleton } from '@/components/Skeleton';
import { StatusBadge } from '@/components/StatusBadge';
import { formErrorMessage } from '@/lib/form';
import { formatDateRange, formatTimeUntil } from '@/lib/format';
import { groupBookings } from './groupBookings';
import styles from './MyBookingsPage.module.css';

/**
 * Minhas reservas (§13.3).
 *
 * Lista agrupada em próximas, passadas e canceladas. Sem paginação, porque um
 * cliente tem poucas reservas e paginar criaria estado de página numa tela que
 * se lê de uma vez.
 */

function BookingCard({ booking }: { booking: Booking }) {
  return (
    <li className={styles.card}>
      <Link className={styles.cardLink} to={`/reservas/${booking.id}`}>
        <span className={styles.cardHead}>
          <StatusBadge status={booking.status} />
          <span className={styles.total}>
            <Money cents={booking.totalCents} />
          </span>
        </span>

        <span className={styles.dates}>{formatDateRange(booking.startDate, booking.endDate)}</span>

        <span className={styles.meta}>
          {EVENT_TYPE_LABELS[booking.eventType]} · {booking.guestCount} pessoas ·{' '}
          {booking.items.length === 0 ? 'só a chácara' : `${booking.items.length} itens`}
        </span>

        {/*
          §13.3: pedido pendente mostra quando as datas deixam de ficar seguras.
          É a informação que decide se a pessoa espera ou liga para a chácara.
        */}
        {booking.status === 'PENDING' && booking.holdExpiresAt ? (
          <span className={styles.hold}>
            Datas seguras {formatTimeUntil(booking.holdExpiresAt)}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

function Group({ title, bookings }: { title: string; bookings: Booking[] }) {
  if (bookings.length === 0) return null;

  return (
    <section className={styles.group}>
      <h2 className={styles.groupTitle}>{title}</h2>
      <ul className={styles.list}>
        {bookings.map((booking) => (
          <BookingCard key={booking.id} booking={booking} />
        ))}
      </ul>
    </section>
  );
}

export function MyBookingsPage() {
  const bookings = useMyBookings();

  if (bookings.isPending) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Minhas reservas</h1>
        <Skeleton rows={5} />
      </div>
    );
  }

  if (bookings.isError) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Minhas reservas</h1>
        <p role="alert">{formErrorMessage(bookings.error) ?? 'Tente de novo em instantes.'}</p>
      </div>
    );
  }

  /*
   * "Hoje" é o dia na chácara, não no relógio de quem olha: quem abre a página de
   * outro fuso veria a festa de hoje já no passado.
   */
  const groups = groupBookings(bookings.data ?? [], todayInSaoPaulo());
  const total = (bookings.data ?? []).length;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Minhas reservas</h1>

      {total === 0 ? (
        <EmptyState
          title="Você ainda não tem reservas"
          description="Quando enviar um pedido, ele aparece aqui com o andamento e os valores."
          action={
            <Link className={styles.action} to="/reservar">
              Montar um pedido
            </Link>
          }
        />
      ) : (
        <>
          <Group title="Próximas" bookings={groups.upcoming} />
          <Group title="Já aconteceram" bookings={groups.past} />
          <Group title="Canceladas" bookings={groups.cancelled} />
        </>
      )}
    </div>
  );
}
