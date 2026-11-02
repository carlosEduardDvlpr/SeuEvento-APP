import {
  BOOKING_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  type BookingStatus,
  type PaymentStatus,
} from '@chacara/shared';
import { AlertIcon, CheckIcon, ClockIcon, CloseIcon, FlagIcon } from './icons';
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

/**
 * Situação de um recebimento do plano de pagamento (§9.11), no mesmo selo.
 *
 * As cores são as da família de status que já existe, para o painel não ganhar
 * uma segunda paleta: a receber usa o amarelo de "aguardando", recebido o verde
 * de "confirmada", em atraso o vermelho de "cancelada", e o que deixou de ser
 * cobrado o cinza de "concluída". O ícone e o texto continuam dizendo qual é.
 */
const PAYMENT_TONES: Record<PaymentStatus, BookingStatus> = {
  PENDING: 'PENDING',
  OVERDUE: 'CANCELLED',
  PAID: 'CONFIRMED',
  CANCELLED: 'COMPLETED',
};

const PAYMENT_ICONS = {
  PENDING: ClockIcon,
  OVERDUE: AlertIcon,
  PAID: CheckIcon,
  CANCELLED: CloseIcon,
} as const;

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const StatusIcon = PAYMENT_ICONS[status];

  return (
    <span className={`${styles.badge} ${styles[PAYMENT_TONES[status]]}`}>
      <StatusIcon size={16} />
      {PAYMENT_STATUS_LABELS[status]}
    </span>
  );
}
