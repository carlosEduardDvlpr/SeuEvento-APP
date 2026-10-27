import { useMemo, useState } from 'react';
import { DayPicker, type DateRange } from 'react-day-picker';
import { ptBR } from 'react-day-picker/locale';
import type { PublicVenue } from '@chacara/shared';
import { Field } from '@/components/Field';
import { Skeleton } from '@/components/Skeleton';
import { formatDateRange } from '@/lib/format';
import { dayCount, toCalendarDate, toISODate } from './calendar-dates';
import type { BookingDraft, DraftAction } from './draft';
import { KindPicker } from './KindPicker';
import { useAvailableDays } from './useAvailableDays';
import styles from './DateStep.module.css';
import 'react-day-picker/style.css';

/**
 * Passo 1: o que reservar, datas e convidados (§13.2).
 *
 * O calendário é `react-day-picker`, a única exceção de UI do projeto (§3):
 * calendário acessível com seleção de intervalo é caro de fazer à mão e fácil de
 * fazer mal.
 *
 * Na decoração sozinha (T32) o passo muda em três pontos, e só neles: a agenda é
 * a da decoração, o calendário escolhe **um** dia, e não há convidados.
 */

export type DateStepProps = {
  draft: BookingDraft;
  dispatch: (action: DraftAction) => void;
  venue: PublicVenue;
  /** Mostrado quando a pessoa tenta avançar com o passo incompleto. */
  errors: { range?: string; guestCount?: string };
  /**
   * Recusa do envio que só tem conserto aqui (§13.2).
   *
   * É o caminho do `DATE_UNAVAILABLE`: a data foi tomada entre o orçamento e o
   * envio, e a pessoa volta para este passo com a explicação à vista.
   */
  notice?: string;
};

export function DateStep({ draft, dispatch, venue, errors, notice }: DateStepProps) {
  const [visibleMonth, setVisibleMonth] = useState(() =>
    draft.startDate ? toCalendarDate(draft.startDate) : new Date(),
  );

  const decoration = draft.kind === 'DECORATION';
  const days = useAvailableDays(visibleMonth, draft.kind);

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
  // Faixa de dias é regra da chácara; a decoração é sempre um dia.
  const tooLong = !decoration && total > venue.maxDays;
  const tooShort = !decoration && total > 0 && total < venue.minDays;
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
   * desabilitado, em vez de parecer disponível — é melhor esperar que oferecer
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

      <section className={styles.block}>
        <KindPicker value={draft.kind} onChange={(kind) => dispatch({ type: 'setKind', kind })} />
      </section>

      <section className={styles.block} aria-labelledby="titulo-datas">
        <h2 className={styles.title} id="titulo-datas">
          {decoration ? 'Qual é o dia da festa?' : 'Quando é a festa?'}
        </h2>
        {decoration ? (
          <p className={styles.hint}>
            A decoração é reservada para um dia de uso, com pelo menos {leadDays} de antecedência. A
            retirada e a devolução dos itens são combinadas direto com a gente.
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

        {errors.range ? (
          <p className={styles.problem} role="alert">
            {errors.range}
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
          A §13.2 pede que a gente diga qual dia atrapalha, não só que recuse. Na
          troca de chácara para decoração (ou o contrário), o dia que já estava
          escolhido pode não servir na outra agenda — e é esta mensagem que avisa.
        */}
        {blockedInRange.length > 0 ? (
          <p className={styles.problem} role="alert">
            {blockedInRange.length === 1
              ? `O dia ${formatDateRange(blockedInRange[0]!, blockedInRange[0]!)} não está disponível${decoration ? ' para a decoração. Escolha outro dia.' : '. Escolha outro período.'}`
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

      {/* Sem a chácara, não há convidados a receber (T32). */}
      {decoration ? null : (
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
      )}
    </div>
  );
}
