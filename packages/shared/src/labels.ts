import type {
  BlockScope,
  BookingKind,
  BookingStatus,
  DayStatus,
  GalleryKind,
  PaymentKind,
  PaymentStatus,
} from './enums.js';

/**
 * Rótulos em pt-BR (§16). Ficam aqui para que a mesma palavra apareça na tela,
 * no e-mail e no painel: a §16.2 exige que uma ação mantenha o mesmo nome em
 * todo o fluxo.
 */

/** §16.3. Cliente e admin usam os mesmos rótulos de status. */
export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  PENDING: 'Aguardando confirmação',
  CONFIRMED: 'Confirmada',
  CANCELLED: 'Cancelada',
  COMPLETED: 'Concluída',
};

/** Legenda do calendário. §14.11: status nunca é comunicado só por cor. */
export const DAY_STATUS_LABELS: Record<DayStatus, string> = {
  free: 'Livre',
  booked: 'Reservado',
  blocked: 'Indisponível',
  past: 'Fora do prazo',
};

/** Seções da galeria, como aparecem no admin (§13.4). */
export const GALLERY_KIND_LABELS: Record<GalleryKind, string> = {
  HERO: 'Destaque',
  VENUE: 'A chácara',
  EVENTS: 'Eventos',
};

/** O que a reserva contrata, como aparece em selo e lista (T32). */
export const BOOKING_KIND_LABELS: Record<BookingKind, string> = {
  VENUE: 'Chácara',
  DECORATION: 'Só decoração',
};

/** O que o bloqueio fecha, como o dono escolhe no calendário do painel (T32). */
export const BLOCK_SCOPE_LABELS: Record<BlockScope, string> = {
  VENUE: 'Só a chácara',
  DECORATION: 'Só a decoração',
  BOTH: 'Chácara e decoração',
};

/**
 * Situação de um recebimento (§9.11), do ponto de vista do dono: o dinheiro é
 * recebido ou está a receber. "Pendente" fica de fora porque a §16.2 o reserva
 * como a palavra a evitar no lugar de "Aguardando confirmação", e a mesma tela
 * mostra o status da reserva ao lado.
 *
 * No masculino porque o sujeito é o pagamento: "Parcela 2 de 3 · Recebido".
 */
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: 'A receber',
  OVERDUE: 'Em atraso',
  PAID: 'Recebido',
  CANCELLED: 'Cancelado',
};

/**
 * Nome de um recebimento no plano (§9.11): "Sinal", "À vista", "Restante" ou
 * "Parcela 2 de 3".
 *
 * Uma parcela só tem nome próprio porque "Parcela 1 de 1" não é como ninguém
 * fala: sem sinal, é o pagamento à vista; depois de um sinal, é o restante.
 *
 * Mora aqui porque a API dá nome às linhas salvas e o editor do painel às que
 * ainda estão sendo digitadas, e as duas precisam usar a mesma palavra.
 */
export function paymentLabel(
  payment: { kind: PaymentKind; number: number },
  plan: { installments: number; hasDeposit: boolean },
): string {
  if (payment.kind === 'DEPOSIT') return 'Sinal';
  if (plan.installments === 1) return plan.hasDeposit ? 'Restante' : 'À vista';

  return `Parcela ${payment.number} de ${plan.installments}`;
}
