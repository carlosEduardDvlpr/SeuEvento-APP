import type { AdminBookingSummary } from '@chacara/shared';
import { Link } from 'react-router';
import { useAdminDashboard } from '@/api/overview';
import { useVenue } from '@/api/venue';
import { EmptyState } from '@/components/EmptyState';
import { Money } from '@/components/Money';
import { Skeleton } from '@/components/Skeleton';
import { StatusBadge } from '@/components/StatusBadge';
import { formErrorMessage } from '@/lib/form';
import { describeGuests, formatDateRange, formatTimeUntil } from '@/lib/format';
import { whatsappUrl } from '@/lib/whatsapp';
import styles from './admin.module.css';
import dashboardStyles from './DashboardPage.module.css';

/**
 * Visão geral (§13.4).
 *
 * Três perguntas, nessa ordem: o que precisa de resposta hoje, o que vai
 * acontecer logo, e como o mês está indo. A ordem não é estética — é a ordem em
 * que as coisas custam dinheiro se forem ignoradas.
 *
 * Os pedidos vêm ordenados pelo **prazo**, não pela data da festa: o que vence
 * primeiro é o que se perde se ninguém responder.
 */

/** "1 dia" e não "1 dias", que é o que a tela mostrava antes da revisão da T30. */
function inDays(count: number): string {
  return `${count} ${count === 1 ? 'dia' : 'dias'}`;
}

function BookingRow({ booking }: { booking: AdminBookingSummary }) {
  const dates = formatDateRange(booking.startDate, booking.endDate);

  return (
    <li className={dashboardStyles.row}>
      <div className={dashboardStyles.rowMain}>
        <span className={dashboardStyles.rowDates}>{dates}</span>
        <span className={dashboardStyles.rowMeta}>
          {booking.customer.name} · {describeGuests(booking.kind, booking.guestCount)}
        </span>

        {booking.status === 'PENDING' && booking.holdExpiresAt ? (
          <span className={dashboardStyles.hold}>
            Responder {formatTimeUntil(booking.holdExpiresAt)}
          </span>
        ) : null}
      </div>

      <div className={dashboardStyles.rowSide}>
        <StatusBadge status={booking.status} />
        <span className={dashboardStyles.rowTotal}>
          <Money cents={booking.totalCents} />
        </span>

        <div className={dashboardStyles.rowActions}>
          <Link className={dashboardStyles.rowLink} to={`/admin/reservas/${booking.id}`}>
            Abrir
          </Link>

          {booking.customer.phone ? (
            <a
              className={dashboardStyles.rowLink}
              href={whatsappUrl(
                booking.customer.phone,
                `Olá, ${booking.customer.name}! Falo sobre a reserva de ${dates}.`,
              )}
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp
            </a>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function DashboardPage() {
  const venue = useVenue();
  const dashboard = useAdminDashboard();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>{venue.data?.name ?? 'Painel da chácara'}</h1>
          <p className={styles.subtitle}>
            O que precisa de você agora, o que vem pela frente e como o mês está indo.
          </p>
        </div>
      </header>

      {dashboard.isError ? (
        <p role="alert">{formErrorMessage(dashboard.error) ?? 'Tente de novo em instantes.'}</p>
      ) : null}

      {dashboard.isPending ? <Skeleton rows={6} /> : null}

      {dashboard.data ? (
        <>
          <ul className={dashboardStyles.numbers}>
            <li className={dashboardStyles.number}>
              <span className={dashboardStyles.numberValue}>{dashboard.data.counts.pending}</span>
              <span className={dashboardStyles.numberLabel}>
                {dashboard.data.counts.pending === 1
                  ? 'pedido aguardando resposta'
                  : 'pedidos aguardando resposta'}
              </span>
            </li>
            <li className={dashboardStyles.number}>
              <span className={dashboardStyles.numberValue}>{dashboard.data.counts.next7}</span>
              <span className={dashboardStyles.numberLabel}>nos próximos 7 dias</span>
            </li>
            <li className={dashboardStyles.number}>
              <span className={dashboardStyles.numberValue}>{dashboard.data.counts.next30}</span>
              <span className={dashboardStyles.numberLabel}>nos próximos 30 dias</span>
            </li>
            <li className={dashboardStyles.number}>
              <span className={dashboardStyles.numberValue}>
                {dashboard.data.occupancy.bookedPercent}%
              </span>
              <span className={dashboardStyles.numberLabel}>
                do mês reservado ({dashboard.data.occupancy.bookedDays} de{' '}
                {dashboard.data.occupancy.totalDays} dias)
              </span>
            </li>
          </ul>

          <section className={dashboardStyles.section}>
            <div className={dashboardStyles.sectionHead}>
              <h2 className={dashboardStyles.sectionTitle}>Aguardando sua resposta</h2>
              <Link className={dashboardStyles.sectionLink} to="/admin/reservas">
                Ver todas as reservas
              </Link>
            </div>

            {dashboard.data.pending.length === 0 ? (
              <EmptyState
                title="Nenhum pedido esperando"
                description="Quando alguém enviar um pedido pelo site, ele aparece aqui com o prazo para você responder."
              />
            ) : (
              <ul className={dashboardStyles.list}>
                {dashboard.data.pending.map((booking) => (
                  <BookingRow key={booking.id} booking={booking} />
                ))}
              </ul>
            )}
          </section>

          <section className={dashboardStyles.section}>
            <div className={dashboardStyles.sectionHead}>
              <h2 className={dashboardStyles.sectionTitle}>Próximos 30 dias</h2>
              <Link className={dashboardStyles.sectionLink} to="/admin/calendario">
                Abrir o calendário
              </Link>
            </div>

            {dashboard.data.upcoming.length === 0 ? (
              <EmptyState
                title="Nenhuma festa marcada por enquanto"
                description="As reservas confirmadas e os pedidos em aberto dos próximos 30 dias aparecem aqui."
              />
            ) : (
              <ul className={dashboardStyles.list}>
                {dashboard.data.upcoming.map((booking) => (
                  <BookingRow key={booking.id} booking={booking} />
                ))}
              </ul>
            )}
          </section>

          {/* Ocupação em dias, não em reservas: é a pergunta que o dono faz. */}
          <section className={dashboardStyles.section}>
            <h2 className={dashboardStyles.sectionTitle}>Ocupação deste mês</h2>
            <dl className={dashboardStyles.occupancy}>
              <div>
                <dt>Reservados</dt>
                <dd>{inDays(dashboard.data.occupancy.bookedDays)}</dd>
              </div>
              <div>
                <dt>Bloqueados por você</dt>
                <dd>{inDays(dashboard.data.occupancy.blockedDays)}</dd>
              </div>
              <div>
                <dt>Ainda livres</dt>
                <dd>{inDays(dashboard.data.occupancy.freeDays)}</dd>
              </div>
            </dl>
          </section>
        </>
      ) : null}
    </div>
  );
}
