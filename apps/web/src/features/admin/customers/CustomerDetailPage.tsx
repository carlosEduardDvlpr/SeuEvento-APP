import { EVENT_TYPE_LABELS } from '@chacara/shared';
import { Link, useParams } from 'react-router';
import { useAdminCustomer } from '@/api/admin-customers';
import { EmptyState } from '@/components/EmptyState';
import { Money } from '@/components/Money';
import { Skeleton } from '@/components/Skeleton';
import { StatusBadge } from '@/components/StatusBadge';
import { ArrowLeftIcon } from '@/components/icons';
import { formErrorMessage } from '@/lib/form';
import { describeGuests, formatDateRange, formatDeadline } from '@/lib/format';
import { whatsappUrl } from '@/lib/whatsapp';
import adminStyles from '../admin.module.css';
import styles from './CustomerDetailPage.module.css';

/**
 * Cliente e seu histórico (§13.4).
 *
 * O histórico é a razão da tela existir: antes de confirmar mais uma reserva, o
 * dono quer saber se a pessoa já veio, quantas vezes e como terminou.
 */
export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const customer = useAdminCustomer(id ?? null);

  if (customer.isPending) {
    return (
      <div className={adminStyles.page}>
        <Skeleton rows={6} />
      </div>
    );
  }

  if (customer.isError || !customer.data) {
    return (
      <div className={adminStyles.page}>
        <h1 className={adminStyles.title}>Não encontramos este cliente</h1>
        <p>{formErrorMessage(customer.error) ?? 'O endereço pode estar incompleto.'}</p>
        <Link className={styles.back} to="/admin/clientes">
          <ArrowLeftIcon size={20} />
          Voltar para os clientes
        </Link>
      </div>
    );
  }

  const data = customer.data;

  return (
    <div className={adminStyles.page}>
      <Link className={styles.back} to="/admin/clientes">
        <ArrowLeftIcon size={20} />
        Clientes
      </Link>

      <header className={adminStyles.header}>
        <div className={adminStyles.heading}>
          <h1 className={adminStyles.title}>{data.name}</h1>
          <p className={adminStyles.subtitle}>No cadastro desde {formatDeadline(data.createdAt)}</p>
        </div>
      </header>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Contato</h2>

        <dl className={styles.facts}>
          <div>
            <dt>Telefone</dt>
            <dd>{data.phone ?? 'não informado'}</dd>
          </div>
          <div>
            <dt>E-mail</dt>
            <dd>{data.email ?? 'não informado'}</dd>
          </div>
          <div>
            <dt>Acesso ao site</dt>
            <dd>
              {data.hasAccess
                ? data.emailVerified
                  ? 'entra com senha ou Google'
                  : 'tem senha, mas o e-mail não foi confirmado'
                : 'cadastrado por você, sem senha'}
            </dd>
          </div>
        </dl>

        {data.phone ? (
          <a
            className={styles.whatsapp}
            href={whatsappUrl(data.phone, `Olá, ${data.name}!`)}
            target="_blank"
            rel="noreferrer"
          >
            Falar pelo WhatsApp
          </a>
        ) : null}
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>
          Histórico{data.bookings.length > 0 ? ` (${data.bookings.length})` : ''}
        </h2>

        {data.bookings.length === 0 ? (
          <EmptyState
            title="Nenhuma reserva ainda"
            description="Quando esta pessoa reservar, pelo site ou lançada por você, a reserva aparece aqui."
          />
        ) : (
          <ul className={styles.list}>
            {data.bookings.map((booking) => (
              <li key={booking.id} className={styles.row}>
                <Link className={styles.rowLink} to={`/admin/reservas/${booking.id}`}>
                  <span className={styles.rowHead}>
                    <StatusBadge status={booking.status} />
                    <span className={styles.rowTotal}>
                      <Money cents={booking.totalCents} />
                    </span>
                  </span>

                  <span className={styles.rowDates}>
                    {formatDateRange(booking.startDate, booking.endDate)}
                  </span>

                  <span className={styles.rowMeta}>
                    {EVENT_TYPE_LABELS[booking.eventType]} ·{' '}
                    {describeGuests(booking.kind, booking.guestCount)}
                    {booking.createdByAdmin ? ' · lançada por você' : ''}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
