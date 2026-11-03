import { useMemo, useState } from 'react';
import { DayPicker, type DateRange } from 'react-day-picker';
import { ptBR } from 'react-day-picker/locale';
import type { PublicVenue } from '@chacara/shared';
import { Skeleton } from '@/components/Skeleton';
import { formatDateRange } from '@/lib/format';
import { dayCount, toCalendarDate, toISODate } from './calendar-dates';
import { type BookingDraft, type DraftAction, agendaItemId, rangeLengthError } from './draft';
import { useAvailableDays } from './useAvailableDays';
import styles from './DateStep.module.css';
import 'react-day-picker/style.css';

/**
 * Passo da data (§13.2).
 *
 * O calendário é `react-day-picker`, a única exceção de UI do projeto (§3):
 * calendário acessível com seleção de intervalo é caro de fazer à mão e fácil de
 * fazer mal.
 *
 * Na chácara, escolhe um ou mais dias seguidos; na decoração sozinha (T32), um
 * dia, na agenda da decoração. Com a decoração já escolhida, a agenda é a
 * **dela** (novembro de 2026): o dia em que ela saiu para outra festa não é
 * oferecido.
 */

export type DateStepProps = {
  draft: BookingDraft;
  dispatch: (action: DraftAction) => void;
  venue: PublicVenue;
  /**
   * Dias do período escolhido que não estão livres. Vem do wizard, que segura o
   * "Continuar" com a mesma lista que esta tela explica.
   */
  unavailable: readonly string[];
  /** Mostrado quando a pessoa tenta avançar sem escolher a data. */
  error?: string;
  /**
   * Recusa do envio que só tem conserto aqui (§13.2).
   *
   * É o caminho do `DATE_UNAVAILABLE`: a data foi tomada entre o orçamento e o
   * envio, e a pessoa volta para este passo com a explicação à vista.
   */
  notice?: string;
};

/** "9 de dezembro de 2026", ou a lista deles. */
function describeDays(dates: readonly string[]): string {
  return dates.map((date) => formatDateRange(date, date)).join(', ');
}

export function DateStep({ draft, dispatch, venue, unavailable, error, notice }: DateStepProps) {
  const [visibleMonth, setVisibleMonth] = useState(() =>
    draft.startDate ? toCalendarDate(draft.startDate) : new Date(),
  );

  const decoration = draft.kind === 'DECORATION';
  const itemId = agendaItemId(draft);
  const days = useAvailableDays(visibleMonth, draft.kind, itemId);

  const selected = useMemo<DateRange | undefined>(() => {
    if (!draft.startDate) return undefined;

    return {
      from: toCalendarDate(draft.startDate),
      to: draft.endDate ? toCalendarDate(draft.endDate) : undefined,
    };
  }, [draft.startDate, draft.endDate]);

  const total = draft.startDate && draft.endDate ? dayCount(draft.startDate, draft.endDate) : 0;
  const lengthError = rangeLengthError(draft, venue);
  const leadDays = `${venue.minLeadDays} ${venue.minLeadDays === 1 ? 'dia' : 'dias'}`;

  function handleSelect(range: DateRange | undefined) {
    dispatch({
      type: 'setRange',
      startDate: range?.from ? toISODate(range.from) : null,
      // Clique único no `react-day-picker` devolve `from` sem `to`. Tratar como
      // reserva de um dia é o que a §7.3 define, e é o caso mais comum.
      endDate: range?.to ? toISODate(range.to) : range?.from ? toISODate(range.from) : null,
    });
  }

  /** Decoração: o dia escolhido é as duas pontas, como numa reserva de um dia (§7.3). */
  function handleSelectDay(date: Date | undefined) {
    const day = date ? toISODate(date) : null;
    dispatch({ type: 'setRange', startDate: day, endDate: day });
  }

  /*
   * Só o que a API disse estar livre é selecionável. Mês ainda não carregado fica
   * desabilitado, em vez de parecer disponível: é melhor esperar que oferecer
   * uma data que pode estar tomada.
   */
  const isUnavailable = (date: Date) => days.statusOf(toISODate(date)) !== 'free';

  return (
    <div className={styles.step}>
      {notice ? (
        <p className={styles.problem} role="alert">
          {notice}
        </p>
      ) : null}

      <section className={styles.block} aria-labelledby="titulo-datas">
        <h2 className={styles.title} id="titulo-datas">
          {decoration ? 'Qual é o dia da festa?' : 'Quando é a festa?'}
        </h2>
        {decoration ? (
          <p className={styles.hint}>
            A decoração é reservada para um dia de uso, com pelo menos {leadDays} de antecedência.
            {itemId ? ' O calendário mostra os dias em que a decoração escolhida está livre.' : ''}
          </p>
        ) : (
          <p className={styles.hint}>
            Escolha o dia, ou arraste para mais de um. A chácara aceita de {venue.minDays} a{' '}
            {venue.maxDays} {venue.maxDays === 1 ? 'dia' : 'dias'} seguidos, com pelo menos{' '}
            {leadDays} de antecedência.
          </p>
        )}

        <div className={styles.calendarWrap}>
          {days.isLoading ? (
            <Skeleton rows={5} />
          ) : decoration ? (
            <DayPicker
              className={styles.calendar}
              mode="single"
              locale={ptBR}
              numberOfMonths={2}
              month={visibleMonth}
              onMonthChange={setVisibleMonth}
              selected={draft.startDate ? toCalendarDate(draft.startDate) : undefined}
              onSelect={handleSelectDay}
              disabled={isUnavailable}
            />
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
              disabled={isUnavailable}
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

        {error ? (
          <p className={styles.problem} role="alert">
            {error}
          </p>
        ) : null}

        {draft.startDate && draft.endDate ? (
          <p className={styles.selection}>
            {formatDateRange(draft.startDate, draft.endDate)}
            {/* "(1 dia)" na decoração seria repetir o que o título já disse. */}
            {decoration ? null : (
              <span className={styles.nights}>
                ({total} {total === 1 ? 'dia' : 'dias'})
              </span>
            )}
          </p>
        ) : null}

        {/*
          A §13.2 pede que a gente diga qual dia atrapalha, não só que recuse. É
          também o aviso de quando o dia que já estava escolhido não serve na
          agenda nova: trocar de produto, ou escolher a decoração depois da data.
        */}
        {unavailable.length > 0 ? (
          <p className={styles.problem} role="alert">
            {unavailable.length === 1
              ? `O dia ${describeDays(unavailable)} não está disponível${
                  decoration
                    ? ` para ${itemId ? 'esta decoração' : 'a decoração'}. Escolha outro dia.`
                    : '. Escolha outro período.'
                }`
              : `Estes dias não estão disponíveis: ${describeDays(unavailable)}. Escolha outro período.`}
          </p>
        ) : null}

        {lengthError ? (
          <p className={styles.problem} role="alert">
            {lengthError}
          </p>
        ) : null}
      </section>
    </div>
  );
}
