import { EVENT_TYPE_LABELS } from '@chacara/shared';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useBooking, useCancelBooking } from '@/api/bookings';
import { useVenue } from '@/api/venue';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { Money } from '@/components/Money';
import { Skeleton } from '@/components/Skeleton';
import { StatusBadge } from '@/components/StatusBadge';
import { Textarea } from '@/components/Textarea';
import { ArrowLeftIcon } from '@/components/icons';
import { formErrorMessage } from '@/lib/form';
import {
  describeGuests,
  formatDateLong,
  formatDateRange,
  formatDeadline,
  formatTimeUntil,
  formatWeekdayAndDay,
} from '@/lib/format';
import { whatsappUrl } from '@/lib/whatsapp';
import styles from './BookingDetailPage.module.css';

/**
 * Detalhe da reserva do cliente (§13.3).
 *
 * Todos os valores são o **snapshot** gravado na reserva (§2.1): mudar o catálogo
 * depois não altera o que foi contratado, e a tela mostra o que vale, não o preço
 * de hoje.
 *
 * Quem decide se dá para cancelar é o servidor, pelo `canCancel`. O front não
 * recalcula o prazo: ele depende de "hoje" na chácara, e o relógio de quem olha
 * pode estar em outro fuso.
 */
export function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const booking = useBooking(id ?? null);
  const venue = useVenue();
  const cancel = useCancelBooking();

  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');

  if (booking.isPending) {
    return (
      <div className={styles.page}>
        <Skeleton rows={8} />
      </div>
    );
  }

  if (booking.isError || !booking.data) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Não encontramos esta reserva</h1>
        <p>
          {formErrorMessage(booking.error) ??
            'O endereço pode estar incompleto ou a reserva não é desta conta.'}
        </p>
        <Link className={styles.back} to="/minhas-reservas">
          <ArrowLeftIcon size={20} />
          Voltar para minhas reservas
        </Link>
      </div>
    );
  }

  const data = booking.data;
  const dates = formatDateRange(data.startDate, data.endDate);
  /** Só a decoração (T32): sem diária, sem horário de entrada, itens em vez de datas. */
  const decoration = data.kind === 'DECORATION';

  async function handleCancel() {
    try {
      await cancel.mutateAsync({
        id: data.id,
        reason: reason.trim() === '' ? null : reason.trim(),
      });
      setConfirming(false);
      setReason('');
    } catch {
      // A mensagem aparece pelo `cancel.error`, dentro do diálogo.
    }
  }

  return (
    <div className={styles.page}>
      <Link className={styles.back} to="/minhas-reservas">
        <ArrowLeftIcon size={20} />
        Minhas reservas
      </Link>

      <header className={styles.header}>
        <StatusBadge status={data.status} />
        <h1 className={styles.title}>{dates}</h1>
        <p className={styles.lead}>
          {decoration
            ? `${EVENT_TYPE_LABELS[data.eventType]} · só a decoração, sem a chácara`
            : `${EVENT_TYPE_LABELS[data.eventType]} para ${describeGuests(data.kind, data.guestCount)}`}
        </p>
      </header>

      {/* §13.3: pedido pendente mostra quando as datas deixam de ficar seguras. */}
      {data.status === 'PENDING' && data.holdExpiresAt ? (
        decoration ? (
          <p className={styles.hold}>
            Os itens estão separados para você{' '}
            <strong>{formatTimeUntil(data.holdExpiresAt)}</strong>, até{' '}
            {formatDeadline(data.holdExpiresAt)}. A gente responde por e-mail.
          </p>
        ) : (
          <p className={styles.hold}>
            Suas datas estão seguras <strong>{formatTimeUntil(data.holdExpiresAt)}</strong>, até{' '}
            {formatDeadline(data.holdExpiresAt)}. A chácara responde por e-mail.
          </p>
        )
      ) : null}

      {data.status === 'CANCELLED' ? (
        <p className={styles.cancelled}>
          Esta reserva foi cancelada
          {data.cancelReason ? `: ${data.cancelReason}` : '.'}
        </p>
      ) : null}

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>{decoration ? 'A decoração' : 'A festa'}</h2>

        <dl className={styles.facts}>
          {decoration ? (
            <>
              <div>
                <dt>Dia da festa</dt>
                <dd>{formatDateLong(data.startDate)}</dd>
              </div>
              <div>
                <dt>Retirada e devolução</dt>
                <dd>combinadas com a gente</dd>
              </div>
            </>
          ) : (
            <>
              <div>
                <dt>Entrada</dt>
                <dd>
                  {formatDateLong(data.startDate)}, {venue.data?.checkInTime ?? '—'}
                </dd>
              </div>
              <div>
                <dt>Saída</dt>
                <dd>
                  {formatDateLong(data.endDate)}, {venue.data?.checkOutTime ?? '—'}
                </dd>
              </div>
            </>
          )}
          <div>
            <dt>Pedido feito em</dt>
            <dd>{formatDeadline(data.createdAt)}</dd>
          </div>
        </dl>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Valores</h2>

        {/* Sem diária na decoração: o bloco some em vez de mostrar R$ 0,00. */}
        {data.days.length > 0 ? (
          <ul className={styles.lines}>
            {data.days.map((day) => (
              <li key={day.date} className={styles.line}>
                <span className={styles.lineName}>
                  {formatWeekdayAndDay(day.date)}
                  {day.ruleName ? <span className={styles.rule}>{day.ruleName}</span> : null}
                </span>
                <span className={styles.lineValue}>
                  <Money cents={day.priceCents} />
                </span>
              </li>
            ))}

            <li className={[styles.line, styles.subtotal].join(' ')}>
              <span className={styles.lineName}>
                {data.days.length === 1 ? 'Diária' : `Diárias (${data.days.length} dias)`}
              </span>
              <span className={styles.lineValue}>
                <Money cents={data.dailyTotalCents} />
              </span>
            </li>
          </ul>
        ) : null}

        {data.items.length > 0 ? (
          <ul className={styles.lines}>
            {data.items.map((item) => (
              <li key={item.itemId} className={styles.line}>
                <span className={styles.lineName}>
                  {item.quantity}× {item.name}
                </span>
                <span className={styles.lineValue}>
                  <Money cents={item.totalCents} />
                </span>
              </li>
            ))}

            <li className={[styles.line, styles.subtotal].join(' ')}>
              <span className={styles.lineName}>Itens do pegue e monte</span>
              <span className={styles.lineValue}>
                <Money cents={data.itemsTotalCents} />
              </span>
            </li>
          </ul>
        ) : (
          <p className={styles.hint}>Sem itens de decoração: você alugou só a chácara.</p>
        )}

        {data.combos.length > 0 ? (
          <ul className={styles.lines}>
            {data.combos.map((combo) => (
              <li key={combo.comboId} className={[styles.line, styles.discount].join(' ')}>
                <span className={styles.lineName}>
                  {combo.name}
                  {combo.times > 1 ? <span className={styles.rule}>{combo.times}×</span> : null}
                </span>
                <span className={styles.lineValue}>
                  −<Money cents={combo.discountCents} />
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <p className={styles.total}>
          <span>Total</span>
          <strong>
            <Money cents={data.totalCents} />
          </strong>
        </p>
      </section>

      {data.customerNotes ? (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Sua observação</h2>
          <p className={styles.notes}>{data.customerNotes}</p>
        </section>
      ) : null}

      <div className={styles.actions}>
        {data.canCancel ? (
          <Button variant="danger" onClick={() => setConfirming(true)}>
            Cancelar reserva
          </Button>
        ) : null}

        {/*
          §13.3: quando o botão não aparece, a tela explica o prazo. Sem isso, a
          ausência do botão pareceria defeito.
        */}
        {!data.canCancel && data.status === 'CONFIRMED' ? (
          <p className={styles.hint}>
            O prazo para cancelar pelo site terminou
            {data.cancelUntil ? ` em ${formatDateLong(data.cancelUntil)}` : ''}. Fale com a chácara
            para resolver.
          </p>
        ) : null}

        {venue.data?.whatsapp ? (
          <a
            className={styles.whatsapp}
            href={whatsappUrl(venue.data.whatsapp, `Olá! Falo sobre a minha reserva de ${dates}.`)}
            target="_blank"
            rel="noreferrer"
          >
            Falar pelo WhatsApp
          </a>
        ) : null}
      </div>

      <Dialog
        open={confirming}
        title="Cancelar esta reserva?"
        onClose={() => setConfirming(false)}
        footer={
          <>
            <Button onClick={() => setConfirming(false)}>Manter a reserva</Button>
            <Button
              variant="danger"
              loading={cancel.isPending}
              loadingLabel="Cancelando…"
              onClick={() => void handleCancel()}
            >
              Sim, cancelar
            </Button>
          </>
        }
      >
        <p>
          {decoration ? 'Os itens de ' : 'As datas de '}
          <strong>{dates}</strong> voltam a ficar livres para outras pessoas. Não dá para desfazer:
          se mudar de ideia, será preciso fazer um pedido novo.
        </p>

        {formErrorMessage(cancel.error) ? (
          <p className={styles.problem} role="alert">
            {formErrorMessage(cancel.error)}
          </p>
        ) : null}

        {/* O motivo é opcional: obrigar a justificar atrapalha quem só desistiu. */}
        <Textarea
          label="Quer contar o motivo?"
          help="Opcional. Ajuda a chácara a entender o que aconteceu."
          rows={3}
          maxLength={300}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </Dialog>
    </div>
  );
}
