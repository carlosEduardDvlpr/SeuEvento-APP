import { EVENT_TYPES, EVENT_TYPE_LABELS, type EventType } from '@chacara/shared';
import {
  CakeIcon,
  GlassIcon,
  GraduationIcon,
  HeartIcon,
  SparkIcon,
  StrollerIcon,
  UsersIcon,
} from '@/components/icons';
import styles from './EventTypePicker.module.css';

/**
 * Tipo de evento em cartões com ícone (§13.2).
 *
 * É um grupo de rádio de verdade (`role="radiogroup"` por `fieldset` + inputs
 * `radio`), e não botões: a navegação por setas e o anúncio de "1 de 9" vêm de
 * graça, e o teclado funciona sem código nosso (§18.1).
 */

const ICONS: Record<EventType, typeof CakeIcon> = {
  BIRTHDAY_KIDS: CakeIcon,
  BIRTHDAY_ADULT: CakeIcon,
  BABY_SHOWER: StrollerIcon,
  GENDER_REVEAL: SparkIcon,
  BRIDAL_SHOWER: HeartIcon,
  WEDDING: HeartIcon,
  GRADUATION: GraduationIcon,
  GET_TOGETHER: GlassIcon,
  OTHER: UsersIcon,
};

export type EventTypePickerProps = {
  value: EventType | null;
  onChange: (eventType: EventType) => void;
  error?: string;
};

export function EventTypePicker({ value, onChange, error }: EventTypePickerProps) {
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>Que festa é?</legend>

      {error ? (
        <span className={styles.error} role="alert">
          {error}
        </span>
      ) : null}

      <div className={styles.grid}>
        {EVENT_TYPES.map((eventType) => {
          const Icon = ICONS[eventType];
          const checked = value === eventType;

          return (
            <label
              key={eventType}
              className={[styles.card, checked ? styles.cardChecked : null]
                .filter(Boolean)
                .join(' ')}
            >
              {/* O input fica visualmente oculto, mas é ele que recebe o foco. */}
              <input
                className={styles.input}
                type="radio"
                name="eventType"
                value={eventType}
                checked={checked}
                onChange={() => onChange(eventType)}
              />
              <Icon size={28} />
              <span className={styles.cardLabel}>{EVENT_TYPE_LABELS[eventType]}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
