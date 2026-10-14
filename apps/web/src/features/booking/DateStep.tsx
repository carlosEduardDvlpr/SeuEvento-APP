import { useMemo, useState } from 'react';
import { DayPicker, type DateRange } from 'react-day-picker';
import { ptBR } from 'react-day-picker/locale';
import type { PublicVenue } from '@chacara/shared';
import { Field } from '@/components/Field';
import { Skeleton } from '@/components/Skeleton';
import { formatDateRange } from '@/lib/format';
import { dayCount, toCalendarDate, toISODate } from './calendar-dates';
import type { BookingDraft, DraftAction } from './draft';
import { EventTypePicker } from './EventTypePicker';
import { useAvailableDays } from './useAvailableDays';
import styles from './DateStep.module.css';
import 'react-day-picker/style.css';

/**
 * Passo 1: datas, tipo de evento e convidados (§13.2).
 *
 * O calendário é `react-day-picker`, a única exceção de UI do projeto (§3):
 * calendário acessível com seleção de intervalo é caro de fazer à mão e fácil de
 * fazer mal.
 */

export type DateStepProps = {
  draft: BookingDraft;
  dispatch: (action: DraftAction) => void;
  venue: PublicVenue;
  /** Mostrado quando a pessoa tenta avançar com o passo incompleto. */
  errors: { range?: string; eventType?: string; guestCount?: string };
};

export function DateStep({ draft, dispatch, venue, errors }: DateStepProps) {
  const [visibleMonth, setVisibleMonth] = useState(() =>
    draft.startDate ? toCalendarDate(draft.startDate) : new Date(),
  );

  const days = useAvailableDays(visibleMonth);

  const selected = useMemo<DateRange | undefined>(() => {
    if (!draft.startDate) return undefined;

    return {
      from: toCalendarDate(draft.startDate),
      to: draft.endDate ? toCalendarDate(draft.endDate) : undefined,
    };
  }, [draft.startDate, draft.endDate]);

  /*
   * Dias indisponíveis **dentro** do intervalo escolhido.
   *
   * O `react-day-picker` desabilita dia a dia, mas não impede a seleção de um
   * intervalo que pule por cima de um dia ocupado. A §13.2 pede que a gente
   * explique **qual** dia atrapalha, em vez de só recusar.
   */
  const blockedInRange = useMemo(() => {
    if (!draft.startDate || !draft.endDate) return [];
    return days.unavailableWithin(draft.startDate, draft.endDate);
  }, [draft.startDate, draft.endDate, days]);

  const total = draft.startDate && draft.endDate ? dayCount(draft.startDate, draft.endDate) : 0;
  const tooLong = total > venue.maxDays;
  const tooShort = total > 0 && total < venue.minDays;

  function handleSelect(range: DateRange | undefined) {
    dispatch({
      type: 'setRange',
      startDate: range?.from ? toISODate(range.from) : null,
      // Clique único no `react-day-picker` devolve `from` sem `to`. Tratar como
      // reserva de um dia é o que a §7.3 define, e é o caso mais comum.
      endDate: range?.to ? toISODate(range.to) : range?.from ? toISODate(range.from) : null,
    });
  }

  return (
    <div className={styles.step}>
      <section className={styles.block} aria-labelledby="titulo-datas">
        <h2 className={styles.title} id="titulo-datas">
          Quando é a festa?
        </h2>
        <p className={styles.hint}>
          Escolha o dia, ou arraste para mais de um. A chácara aceita de {venue.minDays} a{' '}
          {venue.maxDays} {venue.maxDays === 1 ? 'dia' : 'dias'} seguidos, com pelo menos{' '}
          {venue.minLeadDays} {venue.minLeadDays === 1 ? 'dia' : 'dias'} de antecedência.
        </p>

        <div className={styles.calendarWrap}>
          {days.isLoading ? (
            <Skeleton rows={5} />
          ) : (
            <DayPicker
              className={styles.calendar}
              mode="range"
              locale={ptBR}
              numberOfMonths={2}
              month={visibleMonth}
              onMonthChange={setVisibleMonth}
              selected={selected}
              onSelect={handleSelect}
              /*
               * Só o que a API disse estar livre é selecionável. Mês ainda não
               * carregado fica desabilitado, em vez de parecer disponível — é
               * melhor esperar que oferecer uma data que pode estar tomada.
               */
              disabled={(date) => days.statusOf(toISODate(date)) !== 'free'}
              max={venue.maxDays}
            />
          )}

          <ul className={styles.legend}>
            <li className={styles.legendItem}>
              <span className={[styles.swatch, styles.swatchFree].join(' ')} />
              Livre
            </li>
            <li className={styles.legendItem}>
              <span className={[styles.swatch, styles.swatchSelected].join(' ')} />
              Escolhido
            </li>
            <li className={styles.legendItem}>
              <span className={[styles.swatch, styles.swatchTaken].join(' ')} />
              Indisponível
            </li>
          </ul>
        </div>

        {errors.range ? (
          <p className={styles.problem} role="alert">
            {errors.range}
          </p>
        ) : null}

        {draft.startDate && draft.endDate ? (
          <p className={styles.selection}>
            {formatDateRange(draft.startDate, draft.endDate)}
            <span className={styles.nights}>
              ({total} {total === 1 ? 'dia' : 'dias'})
            </span>
          </p>
        ) : null}

        {/* A §13.2 pede que a gente diga qual dia atrapalha, não só que recuse. */}
        {blockedInRange.length > 0 ? (
          <p className={styles.problem} role="alert">
            {blockedInRange.length === 1
              ? `O dia ${formatDateRange(blockedInRange[0]!, blockedInRange[0]!)} não está disponível. Escolha outro período.`
              : `Estes dias não estão disponíveis: ${blockedInRange
                  .map((date) => formatDateRange(date, date))
                  .join(', ')}. Escolha outro período.`}
          </p>
        ) : null}

        {tooLong ? (
          <p className={styles.problem} role="alert">
            A chácara aceita no máximo {venue.maxDays} {venue.maxDays === 1 ? 'dia' : 'dias'}{' '}
            seguidos.
          </p>
        ) : null}

        {tooShort ? (
          <p className={styles.problem} role="alert">
            A reserva é de no mínimo {venue.minDays} dias seguidos.
          </p>
        ) : null}
      </section>

      <section className={styles.block}>
        <EventTypePicker
          value={draft.eventType}
          onChange={(eventType) => dispatch({ type: 'setEventType', eventType })}
          error={errors.eventType}
        />
      </section>

      <section className={styles.block}>
        <h2 className={styles.title}>Quantas pessoas?</h2>

        <Field
          className={styles.guests}
          label="Número de convidados"
          type="number"
          min={1}
          max={venue.maxGuests}
          inputMode="numeric"
          value={draft.guestCount === null ? '' : String(draft.guestCount)}
          onChange={(event) =>
            dispatch({
              type: 'setGuestCount',
              guestCount: event.target.value === '' ? null : Number(event.target.value),
            })
          }
          error={errors.guestCount}
          help={`A chácara recebe até ${venue.maxGuests} pessoas.`}
        />
      </section>
    </div>
  );
}
