import type { BookingStatus, DayStatus, EventType, GalleryKind } from './enums.js';

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

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  BIRTHDAY_KIDS: 'Aniversário infantil',
  BIRTHDAY_ADULT: 'Aniversário adulto',
  BABY_SHOWER: 'Chá de bebê',
  GENDER_REVEAL: 'Chá revelação',
  BRIDAL_SHOWER: 'Chá de panela',
  WEDDING: 'Casamento ou noivado',
  GRADUATION: 'Formatura',
  GET_TOGETHER: 'Confraternização',
  OTHER: 'Outro',
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
