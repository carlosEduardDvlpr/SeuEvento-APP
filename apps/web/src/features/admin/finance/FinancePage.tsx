import type { AdminBookingSummary, FinanceDay, FinancePayment } from '@chacara/shared';
import { BOOKING_KIND_LABELS, PAYMENT_STATUS_LABELS, todayInSaoPaulo } from '@chacara/shared';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useAdminFinance, useMarkPayment } from '@/api/admin-finance';
import { Button } from '@/components/Button';
import { Money } from '@/components/Money';
import { Skeleton } from '@/components/Skeleton';
import { PaymentStatusBadge, StatusBadge } from '@/components/StatusBadge';
import { useToast } from '@/components/Toast';
import { AlertIcon, ArrowLeftIcon, ArrowRightIcon, CheckIcon, ClockIcon } from '@/components/icons';
import { formErrorMessage } from '@/lib/form';
import {
  capitalizeFirst,
  formatBRL,
  formatDateLong,
  formatDateRange,
  formatDateShort,
} from '@/lib/format';
import { whatsappUrl } from '@/lib/whatsapp';
import adminStyles from '../admin.module.css';
import { WEEKDAY_LABELS, formatMonth, monthGrid, monthOf, shiftMonth } from '../calendar/monthGrid';
import { ReceivePaymentDialog } from './ReceivePaymentDialog';
import styles from './FinancePage.module.css';

/**
 * Financeiro do painel (§9.11, §13.4).
 *
 * Responde a duas perguntas do dono: quanto entra no mês e quem precisa ser
 * cobrado. Os números do topo são do mês aberto, contados pelo vencimento; a
 * grade marca os dias com sinal ou parcela; e as listas embaixo são o que pede
 * ação: os vencimentos, o que atrasou (de qualquer mês) e as reservas fechadas
 * que ainda não têm pagamento anotado.
 *
 * Tocar num dia filtra a lista de vencimentos logo abaixo da grade, em vez de
 * abrir um diálogo como no calendário: registrar um recebimento já abre o dele,
 * e diálogo sobre diálogo é ruim de usar no celular.
 */

type DayTone = 'overdue' | 'due' | 'paid';

/** Um dia com vencimento: atrasado pesa mais que a receber, que pesa mais que recebido. */
function toneOf(day: FinanceDay): DayTone {
  if (day.overdue) return 'overdue';

  return day.pendingCents > 0 ? 'due' : 'paid';
}

/** Opcional pelo mesmo motivo do calendário: `noUncheckedIndexedAccess` no CSS Module. */
const TONE_CLASS: Record<DayTone, string | undefined> = {
  overdue: styles.overdue,
  due: styles.due,
  paid: styles.paid,
};

/** As mesmas palavras do selo de cada recebimento, para a grade e a lista concordarem. */
const TONE_LABEL: Record<DayTone, string> = {
  overdue: PAYMENT_STATUS_LABELS.OVERDUE,
  due: PAYMENT_STATUS_LABELS.PENDING,
  paid: PAYMENT_STATUS_LABELS.PAID,
};

/** Ícone além da cor (§14.2): no celular, o texto da célula não cabe. */
const TONE_ICON = { overdue: AlertIcon, due: ClockIcon, paid: CheckIcon } as const;

const TONES: DayTone[] = ['due', 'overdue', 'paid'];

function chargeMessage(payment: FinancePayment): string {
  const { booking } = payment;
  const when = payment.status === 'OVERDUE' ? 'que venceu em' : 'com vencimento em';

  return `Olá, ${booking.customer.name}! Passando para lembrar do pagamento da sua reserva de ${formatDateRange(booking.startDate, booking.endDate)} (${payment.label}): ${formatBRL(payment.amountCents)}, ${when} ${formatDateShort(payment.dueDate)}.`;
}

type PaymentEntryProps = {
  payment: FinancePayment;
  undoing: boolean;
  onReceive: (payment: FinancePayment) => void;
  onUndo: (payment: FinancePayment) => void;
};

function PaymentEntry({ payment, undoing, onReceive, onUndo }: PaymentEntryProps) {
  const { booking } = payment;
  const who = `${payment.label} de ${booking.customer.name}`;

  return (
    <li className={styles.entry}>
      <div className={styles.entryHead}>
        <PaymentStatusBadge status={payment.status} />
        <span className={styles.entryValue}>
          <Money cents={payment.amountCents} />
        </span>
      </div>

      <p className={styles.entryName}>
        {payment.label} · {booking.customer.name}
      </p>

      <p className={styles.entryMeta}>
        {payment.paidOn
          ? `Recebido em ${formatDateShort(payment.paidOn)}`
          : `Vence em ${formatDateShort(payment.dueDate)}`}{' '}
        · {BOOKING_KIND_LABELS[booking.kind]}, {formatDateRange(booking.startDate, booking.endDate)}
        {booking.status === 'CANCELLED' ? ' · reserva cancelada' : ''}
      </p>

      <div className={styles.entryActions}>
        {payment.paidOn ? (
          <Button
            variant="ghost"
            aria-label={`Desfazer recebimento: ${who}`}
            loading={undoing}
            loadingLabel="Desfazendo…"
            onClick={() => onUndo(payment)}
          >
            Desfazer
          </Button>
        ) : (
          <Button aria-label={`Registrar recebimento: ${who}`} onClick={() => onReceive(payment)}>
            Registrar recebimento
          </Button>
        )}

        <Link className={styles.entryLink} to={`/admin/reservas/${booking.id}`}>
          Abrir reserva
        </Link>

        {payment.paidOn === null && booking.customer.phone ? (
          <a
            className={styles.entryLink}
            href={whatsappUrl(booking.customer.phone, chargeMessage(payment))}
            target="_blank"
            rel="noreferrer"
          >
            Cobrar pelo WhatsApp
          </a>
        ) : null}
      </div>
    </li>
  );
}

function UnplannedEntry({ booking }: { booking: AdminBookingSummary }) {
  return (
    <li className={styles.entry}>
      <div className={styles.entryHead}>
        <StatusBadge status={booking.status} />
        <span className={styles.entryValue}>
          <Money cents={booking.totalCents} />
        </span>
      </div>

      <p className={styles.entryName}>{booking.customer.name}</p>

      <p className={styles.entryMeta}>
        {BOOKING_KIND_LABELS[booking.kind]}, {formatDateRange(booking.startDate, booking.endDate)}
      </p>

      <div className={styles.entryActions}>
        <Link
          className={styles.entryLink}
          to={`/admin/reservas/${booking.id}`}
          aria-label={`Registrar pagamento da reserva de ${booking.customer.name}`}
        >
          Registrar pagamento
        </Link>
      </div>
    </li>
  );
}

export function FinancePage() {
  const today = todayInSaoPaulo();
  const [month, setMonth] = useState(() => monthOf(today));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [receiving, setReceiving] = useState<FinancePayment | null>(null);

  const finance = useAdminFinance(month);
  const mark = useMarkPayment();
  const { showToast } = useToast();

  const weeks = useMemo(() => monthGrid(month), [month]);

  const byDate = useMemo(() => {
    const map = new Map<string, FinanceDay>();
    for (const day of finance.data?.days ?? []) map.set(day.date, day);
    return map;
  }, [finance.data]);

  /** Trocar de mês limpa o dia escolhido: ele não existe na grade nova. */
  function goTo(next: string) {
    setMonth(next);
    setSelectedDate(null);
  }

  async function undo(payment: FinancePayment) {
    try {
      await mark.mutateAsync({ paymentId: payment.id, paidOn: null });
      showToast(`Recebimento desfeito: ${payment.label} de ${payment.booking.customer.name}.`);
    } catch (error) {
      showToast(formErrorMessage(error) ?? 'Não conseguimos desfazer o recebimento.', 'error');
    }
  }

  const data = finance.data;
  const monthTitle = capitalizeFirst(formatMonth(month));
  const listed = data
    ? data.payments.filter((payment) => selectedDate === null || payment.dueDate === selectedDate)
    : [];
  const undoingId = mark.isPending ? mark.variables?.paymentId : undefined;

  const entry = (payment: FinancePayment) => (
    <PaymentEntry
      key={payment.id}
      payment={payment}
      undoing={undoingId === payment.id}
      onReceive={setReceiving}
      onUndo={(target) => void undo(target)}
    />
  );

  return (
    <div className={adminStyles.page}>
      <header className={adminStyles.header}>
        <div className={adminStyles.heading}>
          <h1 className={adminStyles.title}>Financeiro</h1>
          <p className={adminStyles.subtitle}>
            Sinal e parcelas das reservas, pelo dia do vencimento. Toque num dia para ver quem paga.
          </p>
        </div>
      </header>

      <div className={styles.monthBar}>
        <Button
          variant="ghost"
          onClick={() => goTo(shiftMonth(month, -1))}
          aria-label="Mês anterior"
        >
          <ArrowLeftIcon size={20} />
        </Button>

        <h2 className={styles.monthName}>{monthTitle}</h2>

        <Button
          variant="ghost"
          onClick={() => goTo(shiftMonth(month, 1))}
          aria-label="Mês seguinte"
        >
          <ArrowRightIcon size={20} />
        </Button>

        {monthOf(today) === month ? null : (
          <Button onClick={() => goTo(monthOf(today))}>Voltar para hoje</Button>
        )}
      </div>

      {finance.isError ? (
        <p role="alert">{formErrorMessage(finance.error) ?? 'Tente de novo em instantes.'}</p>
      ) : null}

      {finance.isPending ? <Skeleton rows={6} /> : null}

      {data ? (
        <>
          <ul className={styles.numbers}>
            <li className={styles.number}>
              <span className={styles.numberValue}>
                <Money cents={data.summary.dueCents} />
              </span>
              <span className={styles.numberLabel}>previsto para o mês</span>
            </li>
            <li className={styles.number}>
              <span className={styles.numberValue}>
                <Money cents={data.summary.paidCents} />
              </span>
              <span className={styles.numberLabel}>recebido</span>
            </li>
            <li className={styles.number}>
              <span className={styles.numberValue}>
                <Money cents={data.summary.pendingCents} />
              </span>
              <span className={styles.numberLabel}>a receber</span>
            </li>
            <li className={[styles.number, styles.numberOverdue].join(' ')}>
              <span className={styles.numberValue}>
                <Money cents={data.overdue.totalCents} />
              </span>
              <span className={styles.numberLabel}>em atraso, de todos os meses</span>
            </li>
          </ul>

          <table className={styles.grid}>
            <caption className={styles.caption}>
              {monthTitle}: {data.payments.length}{' '}
              {data.payments.length === 1 ? 'vencimento' : 'vencimentos'}
            </caption>

            <thead>
              <tr>
                {WEEKDAY_LABELS.map((label) => (
                  <th key={label} scope="col" className={styles.weekday}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {weeks.map((week, index) => (
                <tr key={index}>
                  {week.map((date, column) => {
                    if (!date) return <td key={column} className={styles.filler} />;

                    const day = byDate.get(date);
                    const tone = day ? toneOf(day) : null;
                    const ToneIcon = tone ? TONE_ICON[tone] : null;

                    return (
                      <td key={date} className={styles.cell}>
                        <button
                          type="button"
                          className={[
                            styles.day,
                            tone ? TONE_CLASS[tone] : null,
                            date === today ? styles.today : null,
                            date === selectedDate ? styles.selected : null,
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          aria-pressed={date === selectedDate}
                          onClick={() => setSelectedDate(date === selectedDate ? null : date)}
                        >
                          <span className={styles.dayNumber}>{Number(date.slice(-2))}</span>

                          {day && tone && ToneIcon ? (
                            <>
                              <span className={styles.dayMark}>
                                <ToneIcon size={12} />
                                {/* Texto, não só cor e ícone (§14.2). */}
                                <span className={styles.dayStatus}>{TONE_LABEL[tone]}</span>
                              </span>
                              <span className={styles.dayAmount}>
                                {formatBRL(tone === 'paid' ? day.paidCents : day.pendingCents)}
                              </span>
                            </>
                          ) : null}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          <ul className={styles.legend}>
            {TONES.map((tone) => {
              const ToneIcon = TONE_ICON[tone];

              return (
                <li key={tone} className={styles.legendItem}>
                  <span className={[styles.swatch, TONE_CLASS[tone]].filter(Boolean).join(' ')}>
                    <ToneIcon size={12} />
                  </span>
                  {TONE_LABEL[tone]}
                </li>
              );
            })}
          </ul>

          <section className={styles.section} aria-labelledby="titulo-vencimentos">
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle} id="titulo-vencimentos">
                {selectedDate
                  ? `Vencimentos de ${formatDateLong(selectedDate)}`
                  : `Vencimentos de ${formatMonth(month)}`}
              </h2>

              {selectedDate ? (
                <Button variant="ghost" onClick={() => setSelectedDate(null)}>
                  Ver o mês inteiro
                </Button>
              ) : null}
            </div>

            {listed.length > 0 ? (
              <ul className={styles.list}>{listed.map(entry)}</ul>
            ) : (
              <p className={styles.empty}>
                {selectedDate
                  ? 'Nenhum vencimento neste dia.'
                  : `Nenhum vencimento em ${formatMonth(month)}.`}
              </p>
            )}
          </section>

          <section className={styles.section} aria-labelledby="titulo-atrasados">
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle} id="titulo-atrasados">
                Em atraso
              </h2>
              {data.overdue.payments.length > 0 ? (
                <span className={styles.sectionTotal}>
                  <Money cents={data.overdue.totalCents} />
                </span>
              ) : null}
            </div>

            {data.overdue.payments.length > 0 ? (
              <ul className={styles.list}>{data.overdue.payments.map(entry)}</ul>
            ) : (
              <p className={styles.empty}>Nada em atraso.</p>
            )}
          </section>

          {/* Só aparece quando há o que fazer: a lista vazia seria ruído todo mês. */}
          {data.unplanned.length > 0 ? (
            <section className={styles.section} aria-labelledby="titulo-sem-pagamento">
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle} id="titulo-sem-pagamento">
                  Sem pagamento registrado
                </h2>
              </div>
              <p className={styles.empty}>
                Reservas fechadas de {formatMonth(month)} que ainda não têm sinal nem parcela
                anotados.
              </p>
              <ul className={styles.list}>
                {data.unplanned.map((booking) => (
                  <UnplannedEntry key={booking.id} booking={booking} />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}

      {receiving ? (
        <ReceivePaymentDialog
          payment={receiving}
          customerName={receiving.booking.customer.name}
          onClose={() => setReceiving(null)}
        />
      ) : null}
    </div>
  );
}
