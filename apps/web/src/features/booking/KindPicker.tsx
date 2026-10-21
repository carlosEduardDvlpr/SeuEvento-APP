import type { BookingKind } from '@chacara/shared';
import { BalloonIcon, HouseIcon } from '@/components/icons';
import styles from './KindPicker.module.css';

/**
 * O que reservar: a chácara ou só a decoração (T32).
 *
 * É a primeira escolha do wizard porque muda tudo o que vem depois: a agenda que
 * o calendário mostra, se o pedido tem um dia ou vários, e se há convidados.
 *
 * Mesmo padrão do `EventTypePicker`: grupo de rádio de verdade, com o input
 * visualmente oculto e o cartão inteiro clicável. A cor do cartão escolhido é a
 * do produto na identidade da dona — rosa para o Espaço, magenta para a
 * Decoração — e nunca vem sozinha: borda mais grossa e texto em negrito também
 * marcam a escolha (§14.2).
 */

const OPTIONS: { kind: BookingKind; title: string; text: string; Icon: typeof HouseIcon }[] = [
  {
    kind: 'VENUE',
    title: 'A chácara',
    text: 'Para fazer a festa no espaço, com ou sem a decoração do pegue e monte.',
    Icon: HouseIcon,
  },
  {
    kind: 'DECORATION',
    title: 'Só a decoração',
    text: 'Você leva os itens do pegue e monte e monta a festa em outro lugar.',
    Icon: BalloonIcon,
  },
];

export type KindPickerProps = {
  value: BookingKind;
  onChange: (kind: BookingKind) => void;
};

export function KindPicker({ value, onChange }: KindPickerProps) {
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>O que você quer reservar?</legend>

      <div className={styles.grid}>
        {OPTIONS.map(({ kind, title, text, Icon }) => {
          const checked = value === kind;

          return (
            <label
              key={kind}
              className={[
                styles.card,
                kind === 'VENUE' ? styles.venue : styles.decoration,
                checked ? styles.cardChecked : null,
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <input
                className={styles.input}
                type="radio"
                name="kind"
                value={kind}
                checked={checked}
                onChange={() => onChange(kind)}
              />
              <Icon size={28} />
              <span className={styles.texts}>
                <span className={styles.title}>{title}</span>
                <span className={styles.text}>{text}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
