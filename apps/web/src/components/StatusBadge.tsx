import { BOOKING_STATUS_LABELS, type BookingStatus } from '@chacara/shared';
import { CheckIcon, ClockIcon, CloseIcon, FlagIcon } from './icons';
import styles from './StatusBadge.module.css';

/**
 * Status de reserva (§14.11).
 *
 * Sempre texto **mais** ícone: a §14.2 proíbe usar cor sozinha para informar
 * status, tanto por acessibilidade quanto porque quem imprime perde a cor.
 */
const ICONS = {
  PENDING: ClockIcon,
  CONFIRMED: CheckIcon,
  CANCELLED: CloseIcon,
  COMPLETED: FlagIcon,
} as const;

export function StatusBadge({ status }: { status: BookingStatus }) {
  const StatusIcon = ICONS[status];

  return (
    <span className={`${styles.badge} ${styles[status]}`}>
      <StatusIcon size={16} />
      {BOOKING_STATUS_LABELS[status]}
    </span>
  );
}
