import type { Booking, PublicVenue } from '@chacara/shared';
import { EVENT_TYPE_LABELS } from '@chacara/shared';
import { Link } from 'react-router';
import { Money } from '@/components/Money';
import { Skeleton } from '@/components/Skeleton';
import { StatusBadge } from '@/components/StatusBadge';
import { CheckIcon } from '@/components/icons';
import { formatDateRange, formatDeadline } from '@/lib/format';
import { formErrorMessage } from '@/lib/form';
import { whatsappUrl } from '@/lib/whatsapp';
import styles from './ConfirmationStep.module.css';

/**
 * Pedido enviado (§13.2).
 *
 * A reserva vem do servidor, não do que o front mandou: é ela que traz o
 * `holdExpiresAt` e o snapshot financeiro já gravado. Ler da API também faz a
 * tela sobreviver a uma recarga, que é o que acontece quando a pessoa manda o
 * link para alguém.
 *
 * O prazo aparece em **data e hora**, não em "48 horas": quem abre a página no dia
 * seguinte precisa saber quanto ainda resta, e a contagem em horas vira mentira
 * assim que a página é fechada.
 */

export type ConfirmationStepProps = {
  booking: Booking | undefined;
  venue: PublicVenue;
  isLoading: boolean;
  error: unknown;
};

export function ConfirmationStep({ booking, venue, isLoading, error }: ConfirmationStepProps) {
  if (isLoading) {
    return (
      <div className={styles.step}>
        <Skeleton rows={6} />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className={styles.step}>
        <h1 className={styles.title}>Não encontramos este pedido</h1>
        <p className={styles.lead}>
          {formErrorMessage(error) ??
            'O endereço pode estar incompleto. Veja seus pedidos para encontrar o certo.'}
        </p>
        <Link className={styles.primaryLink} to="/minhas-reservas">
          Ver meus pedidos
        </Link>
      </div>
    );
  }

  const dates = formatDateRange(booking.startDate, booking.endDate);

  const message = `Olá! Acabei de enviar um pedido de reserva para ${dates} (${EVENT_TYPE_LABELS[booking.eventType]}, ${booking.guestCount} pessoas). Pode confirmar?`;

  return (
    <div className={styles.step}>
      <p className={styles.seal} aria-hidden="true">
        <CheckIcon size={28} />
      </p>

      <h1 className={styles.title}>Pedido enviado</h1>

      <p className={styles.lead}>
        Recebemos seu pedido para <strong>{dates}</strong>. A chácara responde por e-mail, e você
        também pode acompanhar aqui pelo site.
      </p>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <StatusBadge status={booking.status} />
          <span className={styles.total}>
            <Money cents={booking.totalCents} />
          </span>
        </div>

        <dl className={styles.facts}>
          <div>
            <dt>Datas</dt>
            <dd>{dates}</dd>
          </div>
          <div>
            <dt>Tipo</dt>
            <dd>{EVENT_TYPE_LABELS[booking.eventType]}</dd>
          </div>
          <div>
            <dt>Convidados</dt>
            <dd>{booking.guestCount}</dd>
          </div>
          <div>
            <dt>Itens</dt>
            <dd>{booking.items.length === 0 ? 'só a chácara' : `${booking.items.length} itens`}</dd>
          </div>
        </dl>

        {booking.holdExpiresAt ? (
          <p className={styles.hold}>
            Suas datas estão <strong>seguras até {formatDeadline(booking.holdExpiresAt)}</strong>.
            Se a chácara não responder até lá, o pedido se encerra e as datas voltam a ficar livres
            — e aí basta pedir de novo.
          </p>
        ) : null}
      </section>

      <section className={styles.next}>
        <h2 className={styles.nextTitle}>O que acontece agora</h2>
        <ol className={styles.steps}>
          <li>A chácara confere a agenda e responde ao seu pedido.</li>
          <li>Você recebe um e-mail assim que a reserva for confirmada.</li>
          <li>Aí vocês combinam o pagamento e a retirada dos itens.</li>
        </ol>
      </section>

      <div className={styles.actions}>
        {venue.whatsapp ? (
          <a
            className={styles.primaryLink}
            href={whatsappUrl(venue.whatsapp, message)}
            target="_blank"
            rel="noreferrer"
          >
            Agilizar pelo WhatsApp
          </a>
        ) : null}

        <Link className={styles.secondaryLink} to="/minhas-reservas">
          Ver meus pedidos
        </Link>
      </div>
    </div>
  );
}
