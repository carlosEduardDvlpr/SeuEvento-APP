import type { AdminBookingSummary, AdminCalendarDay, BlockScope, DayStatus } from '@chacara/shared';
import {
  BLOCK_SCOPES,
  BLOCK_SCOPE_LABELS,
  DAY_STATUS_LABELS,
  EVENT_TYPE_LABELS,
  blocksKind,
  todayInSaoPaulo,
} from '@chacara/shared';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useAdminCalendar, useBlockDate, useUnblockDate } from '@/api/overview';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { Money } from '@/components/Money';
import { Skeleton } from '@/components/Skeleton';
import { StatusBadge } from '@/components/StatusBadge';
import { Textarea } from '@/components/Textarea';
import { ArrowLeftIcon, ArrowRightIcon, BalloonIcon } from '@/components/icons';
import { useToast } from '@/components/Toast';
import { formErrorMessage } from '@/lib/form';
import {
  capitalizeFirst,
  describeGuests,
  formatDateLong,
  formatDateRange,
  formatTimeUntil,
} from '@/lib/format';
import { whatsappUrl } from '@/lib/whatsapp';
import adminStyles from '../admin.module.css';
import { WEEKDAY_LABELS, formatMonth, monthGrid, monthOf, shiftMonth } from './monthGrid';
import styles from './CalendarPage.module.css';

/**
 * Calendário do painel (§13.4).
 *
 * Grade mensal com o estado de cada dia; clicar num dia abre a gaveta com as
 * reservas daquele dia e as ações de bloquear e desbloquear.
 *
 * A gaveta é o `Dialog` em vez de um componente novo: no celular ele já ocupa
 * quase a tela toda, e a §12.6 pede para não criar componente antes de duas telas
 * precisarem dele. O que importa aqui é o `<dialog>` nativo entregar foco preso e
 * Escape de graça (§18.1).
 *
 * **Duas agendas na mesma grade (T32).** O estado do dia é o da chácara, que é o
 * que o site vende. A decoração aparece por cima, sem mudar esse estado: os kits
 * que saem no dia (com o balão, na cor da Decoração) e a borda tracejada quando a
 * dona fechou a decoração naquele dia.
 */

/**
 * Classe de cor do dia. O texto do status vem junto, nunca só a cor (§14.2).
 *
 * O valor é opcional porque `noUncheckedIndexedAccess` trata o acesso ao CSS
 * Module como possivelmente ausente; quem monta a classe já filtra vazio.
 */
const STATUS_CLASS: Record<DayStatus, string | undefined> = {
  free: styles.free,
  booked: styles.booked,
  blocked: styles.blocked,
  past: styles.past,
};

/** O que o bloqueio de um dia faz, dito para a dona (§16.4). */
const BLOCK_NOTE: Record<BlockScope, { lead: string; effect: string }> = {
  VENUE: {
    lead: 'A chácara está fechada neste dia',
    effect: 'A data não aparece como livre no site. A decoração continua podendo sair.',
  },
  DECORATION: {
    lead: 'A decoração está fechada neste dia',
    effect: 'Nenhum item sai, nem junto com a chácara. A chácara continua reservável.',
  },
  BOTH: {
    lead: 'Chácara e decoração estão fechadas neste dia',
    effect: 'Nada é reservável no site para esta data.',
  },
};

/** O que o aviso diz depois de bloquear, para o resultado ficar explícito. */
const BLOCKED_TOAST: Record<BlockScope, string> = {
  VENUE: 'ficou indisponível para a chácara',
  DECORATION: 'ficou sem saída de decoração',
  BOTH: 'ficou indisponível para a chácara e para a decoração',
};

function BookingCard({ booking }: { booking: AdminBookingSummary }) {
  return (
    <li className={styles.bookingCard}>
      <div className={styles.bookingHead}>
        <StatusBadge status={booking.status} />
        <span className={styles.bookingTotal}>
          <Money cents={booking.totalCents} />
        </span>
      </div>

      <p className={styles.customerName}>
        {booking.customer.name}
        {booking.createdByAdmin ? <span className={styles.tag}>lançada por você</span> : null}
      </p>

      <p className={styles.bookingMeta}>
        {formatDateRange(booking.startDate, booking.endDate)} ·{' '}
        {EVENT_TYPE_LABELS[booking.eventType]} · {describeGuests(booking.kind, booking.guestCount)}
      </p>

      {/* O prazo é o que decide a ordem de atenção do dono (§13.4). */}
      {booking.status === 'PENDING' && booking.holdExpiresAt ? (
        <p className={styles.hold}>Prazo para responder {formatTimeUntil(booking.holdExpiresAt)}</p>
      ) : null}

      <div className={styles.bookingActions}>
        <Link className={styles.bookingLink} to={`/admin/reservas/${booking.id}`}>
          Abrir reserva
        </Link>

        {booking.customer.phone ? (
          <a
            className={styles.bookingLink}
            href={whatsappUrl(
              booking.customer.phone,
              `Olá, ${booking.customer.name}! Falo sobre a reserva de ${formatDateRange(booking.startDate, booking.endDate)}.`,
            )}
            target="_blank"
            rel="noreferrer"
          >
            WhatsApp
          </a>
        ) : null}
      </div>
    </li>
  );
}

export function CalendarPage() {
  const today = todayInSaoPaulo();
  const [month, setMonth] = useState(() => monthOf(today));
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [scope, setScope] = useState<BlockScope>('VENUE');

  const calendar = useAdminCalendar(month);
  const block = useBlockDate();
  const unblock = useUnblockDate();
  const { showToast } = useToast();

  const weeks = useMemo(() => monthGrid(month), [month]);

  const byDate = useMemo(() => {
    const map = new Map<string, AdminCalendarDay>();
    for (const day of calendar.data?.days ?? []) map.set(day.date, day);
    return map;
  }, [calendar.data]);

  const bookingsById = useMemo(() => {
    const map = new Map<string, AdminBookingSummary>();
    for (const booking of calendar.data?.bookings ?? []) map.set(booking.id, booking);
    return map;
  }, [calendar.data]);

  /** Reservas do dia, separadas por produto: a contagem da célula mostra as duas. */
  function bookingsOf(day: AdminCalendarDay | undefined) {
    const list = (day?.bookingIds ?? [])
      .map((id) => bookingsById.get(id))
      .filter((booking): booking is AdminBookingSummary => booking !== undefined);

    return {
      all: list,
      venue: list.filter((booking) => booking.kind === 'VENUE').length,
      kits: list.filter((booking) => booking.kind === 'DECORATION').length,
    };
  }

  const selected = openDate ? byDate.get(openDate) : undefined;
  const selectedBookings = bookingsOf(selected).all;
  const selectedScope = selected?.blockScope ?? null;

  const monthBookings = calendar.data?.bookings ?? [];
  const monthVenue = monthBookings.filter((booking) => booking.kind === 'VENUE').length;
  const monthKits = monthBookings.length - monthVenue;

  function openDay(date: string) {
    const day = byDate.get(date);

    setOpenDate(date);
    // O motivo e o escopo começam com o que já estava gravado: bloquear de novo é
    // como a dona corrige o texto, e o campo vazio faria parecer que não havia.
    setReason(day?.blockReason ?? '');
    setScope(day?.blockScope ?? 'VENUE');
  }

  function closeDay() {
    setOpenDate(null);
    setReason('');
    setScope('VENUE');
  }

  async function handleBlock() {
    if (!openDate) return;

    try {
      await block.mutateAsync({
        date: openDate,
        reason: reason.trim() === '' ? null : reason.trim(),
        scope,
      });
      showToast(`${formatDateLong(openDate)} ${BLOCKED_TOAST[scope]}.`);
      closeDay();
    } catch (error) {
      showToast(formErrorMessage(error) ?? 'Não conseguimos bloquear o dia.', 'error');
    }
  }

  async function handleUnblock() {
    if (!openDate) return;

    try {
      await unblock.mutateAsync(openDate);
      showToast(`${formatDateLong(openDate)} voltou a ficar disponível.`);
      closeDay();
    } catch (error) {
      showToast(formErrorMessage(error) ?? 'Não conseguimos desbloquear o dia.', 'error');
    }
  }

  return (
    <div className={adminStyles.page}>
      <header className={adminStyles.header}>
        <div className={adminStyles.heading}>
          <h1 className={adminStyles.title}>Calendário</h1>
          <p className={adminStyles.subtitle}>
            Toque num dia para ver as reservas e para bloquear ou liberar a data.
          </p>
        </div>
      </header>

      <div className={styles.monthBar}>
        <Button
          variant="ghost"
          onClick={() => setMonth(shiftMonth(month, -1))}
          aria-label="Mês anterior"
        >
          <ArrowLeftIcon size={20} />
        </Button>

        <h2 className={styles.monthName}>{capitalizeFirst(formatMonth(month))}</h2>

        <Button
          variant="ghost"
          onClick={() => setMonth(shiftMonth(month, 1))}
          aria-label="Mês seguinte"
        >
          <ArrowRightIcon size={20} />
        </Button>

        {monthOf(today) === month ? null : (
          <Button onClick={() => setMonth(monthOf(today))}>Voltar para hoje</Button>
        )}
      </div>

      {calendar.isError ? (
        <p role="alert">{formErrorMessage(calendar.error) ?? 'Tente de novo em instantes.'}</p>
      ) : null}

      {calendar.isPending ? (
        <Skeleton rows={6} />
      ) : (
        <>
          <table className={styles.grid}>
            <caption className={styles.caption}>
              {capitalizeFirst(formatMonth(month))}: {monthVenue}{' '}
              {monthVenue === 1 ? 'reserva ativa' : 'reservas ativas'}
              {monthKits > 0
                ? ` e ${monthKits} ${monthKits === 1 ? 'decoração saindo' : 'decorações saindo'}`
                : ''}
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
                    const status = day?.status ?? 'free';
                    const { venue, kits } = bookingsOf(day);
                    const decorClosed =
                      day?.blockScope != null && blocksKind(day.blockScope, 'DECORATION');

                    return (
                      <td key={date} className={styles.cell}>
                        <button
                          type="button"
                          className={[
                            styles.day,
                            STATUS_CLASS[status],
                            decorClosed ? styles.dayDecorClosed : null,
                            date === today ? styles.today : null,
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() => openDay(date)}
                        >
                          <span className={styles.dayNumber}>{Number(date.slice(-2))}</span>

                          {/* Texto, não só cor: a §14.2 vale também para a grade. */}
                          <span className={styles.dayStatus}>{DAY_STATUS_LABELS[status]}</span>

                          {venue > 0 ? (
                            <span className={styles.dayCount}>
                              {venue}{' '}
                              {/*
                                A palavra se esconde no celular (ver o CSS): ela
                                não cabe numa célula de 45 px e saía cortada. O
                                número fica, e o leitor de tela continua ouvindo
                                a frase inteira.
                              */}
                              <span className={styles.countWord}>
                                {venue === 1 ? 'reserva' : 'reservas'}
                              </span>
                            </span>
                          ) : null}

                          {/*
                            Kit saindo não muda o estado do dia — a chácara
                            continua livre —, mas a dona precisa saber. O balão
                            distingue este número do de reservas quando, no
                            celular, a palavra some.
                          */}
                          {kits > 0 ? (
                            <span className={styles.kitCount}>
                              <BalloonIcon size={12} />
                              {kits}{' '}
                              <span className={styles.countWord}>
                                {kits === 1 ? 'decoração' : 'decorações'}
                              </span>
                            </span>
                          ) : null}

                          {decorClosed ? (
                            <span className={styles.decorClosedText}>sem decoração</span>
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
            {(['free', 'booked', 'blocked', 'past'] as const).map((status) => (
              <li key={status} className={styles.legendItem}>
                <span className={[styles.swatch, STATUS_CLASS[status]].filter(Boolean).join(' ')} />
                {DAY_STATUS_LABELS[status]}
              </li>
            ))}
            <li className={styles.legendItem}>
              <span className={styles.kitCount}>
                <BalloonIcon size={12} />
              </span>
              Decoração saindo
            </li>
            <li className={styles.legendItem}>
              <span className={[styles.swatch, styles.dayDecorClosed].join(' ')} />
              Decoração fechada
            </li>
          </ul>
        </>
      )}

      <Dialog
        open={openDate !== null}
        title={openDate ? formatDateLong(openDate) : ''}
        onClose={closeDay}
        footer={
          selectedScope ? (
            <Button
              variant="primary"
              loading={unblock.isPending}
              loadingLabel="Liberando…"
              onClick={() => void handleUnblock()}
            >
              Liberar este dia
            </Button>
          ) : (
            <Button
              variant="danger"
              loading={block.isPending}
              loadingLabel="Bloqueando…"
              onClick={() => void handleBlock()}
            >
              Bloquear este dia
            </Button>
          )
        }
      >
        {selectedScope ? (
          <p className={styles.blockedNote}>
            {BLOCK_NOTE[selectedScope].lead}
            {selected?.blockReason ? `: ${selected.blockReason}.` : '.'}{' '}
            {BLOCK_NOTE[selectedScope].effect}
          </p>
        ) : null}

        {selectedBookings.length > 0 ? (
          <>
            <h3 className={styles.drawerTitle}>
              {selectedBookings.length === 1 ? 'Reserva deste dia' : 'Reservas deste dia'}
            </h3>
            <ul className={styles.bookingList}>
              {selectedBookings.map((booking) => (
                <BookingCard key={booking.id} booking={booking} />
              ))}
            </ul>
          </>
        ) : (
          <p className={styles.drawerEmpty}>Nenhuma reserva neste dia.</p>
        )}

        {/*
          Bloquear um dia com reserva é permitido de propósito: é o que se faz
          quando a chácara fica indisponível de verdade, e as reservas ainda
          precisam ser canceladas uma a uma. O aviso diz isso.
        */}
        {!selectedScope && selectedBookings.length > 0 ? (
          <p className={styles.warning}>
            Bloquear não cancela as reservas acima: elas continuam valendo até você cancelar cada
            uma.
          </p>
        ) : null}

        {selectedScope ? null : (
          <>
            {/*
              O que fechar (T32). Um grupo de rádio de verdade, para o teclado e o
              leitor de tela funcionarem sem código nosso (§18.1).
            */}
            <fieldset className={styles.scopes}>
              <legend className={styles.scopesLegend}>O que fechar neste dia</legend>

              {BLOCK_SCOPES.map((option) => (
                <label key={option} className={styles.scopeOption}>
                  <input
                    type="radio"
                    name="block-scope"
                    value={option}
                    checked={scope === option}
                    onChange={() => setScope(option)}
                  />
                  {BLOCK_SCOPE_LABELS[option]}
                </label>
              ))}
            </fieldset>

            <Textarea
              label="Motivo do bloqueio"
              help="Opcional, e só você vê. Serve para lembrar por que o dia está fechado."
              rows={2}
              maxLength={200}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </>
        )}
      </Dialog>
    </div>
  );
}
