import type { PublicVenue } from '@chacara/shared';
import { Field } from '@/components/Field';
import { type BookingDraft, type DraftAction, guestCountError } from './draft';
import styles from './GuestsStep.module.css';

/**
 * Passo dos convidados, só na chácara (§13.2).
 *
 * O teto é o `maxGuests` das configurações: passar dele aparece na hora, e o
 * "Continuar" não anda. O campo vazio só reclama quando a pessoa tenta avançar,
 * porque enquanto ela digita ele fica vazio de passagem.
 */

export type GuestsStepProps = {
  draft: BookingDraft;
  dispatch: (action: DraftAction) => void;
  venue: PublicVenue;
  /** A pessoa tentou avançar: o que falta também aparece. */
  showErrors: boolean;
  /** O envio voltou para cá porque faltava o número (§13.2). */
  notice?: string;
};

export function GuestsStep({ draft, dispatch, venue, showErrors, notice }: GuestsStepProps) {
  const problem = guestCountError(draft.guestCount, venue.maxGuests);
  // Acima do teto é limite da chácara, não esquecimento: o aviso não espera o clique.
  const overLimit = draft.guestCount !== null && draft.guestCount > venue.maxGuests;
  const error = problem && (showErrors || overLimit) ? problem : undefined;

  return (
    <div className={styles.step}>
      {notice ? (
        <p className={styles.problem} role="alert">
          {notice}
        </p>
      ) : null}

      <section className={styles.block} aria-labelledby="titulo-convidados">
        <h2 className={styles.title} id="titulo-convidados">
          Quantas pessoas?
        </h2>

        <Field
          className={styles.guests}
          label="Número de convidados"
          type="number"
          min={1}
          max={venue.maxGuests}
          step={1}
          inputMode="numeric"
          value={draft.guestCount === null ? '' : String(draft.guestCount)}
          onChange={(event) =>
            dispatch({
              type: 'setGuestCount',
              guestCount: event.target.value === '' ? null : Number(event.target.value),
            })
          }
          error={error}
          help={`A chácara recebe até ${venue.maxGuests} pessoas.`}
        />
      </section>
    </div>
  );
}
