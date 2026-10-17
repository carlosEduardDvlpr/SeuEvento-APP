import type { AdminBooking, BookingStatus } from '@chacara/shared';
import { BOOKING_STATUS_LABELS, EVENT_TYPE_LABELS } from '@chacara/shared';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  useAdminBooking,
  useUpdateBookingNotes,
  useUpdateBookingStatus,
} from '@/api/admin-bookings';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { Money } from '@/components/Money';
import { Skeleton } from '@/components/Skeleton';
import { StatusBadge } from '@/components/StatusBadge';
import { Textarea } from '@/components/Textarea';
import { useToast } from '@/components/Toast';
import { ArrowLeftIcon } from '@/components/icons';
import { formErrorMessage } from '@/lib/form';
import {
  formatDateLong,
  formatDateRange,
  formatDeadline,
  formatTimeUntil,
  formatWeekdayAndDay,
} from '@/lib/format';
import { whatsappUrl } from '@/lib/whatsapp';
import adminStyles from '../admin.module.css';
import styles from './BookingDetailPage.module.css';

/**
 * Detalhe da reserva no painel (§13.4).
 *
 * É aqui que o dono decide. Quais decisões ele tem é o servidor que diz, pelo
 * `allowedTransitions`: a máquina de estados da §9.2 é regra de negócio, e uma
 * segunda cópia na tela divergiria em algum caso.
 *
 * O histórico é derivado do que a reserva guarda — criada em, prazo, quem
 * cancelou e por quê. Registrar cada transição exigiria uma tabela que a §8 não
 * prevê; o que está aqui cobre as perguntas que o dono faz.
 */

/** Rótulo do botão de cada transição. Nomeia a ação, não o estado de destino. */
const ACTION_LABEL: Record<BookingStatus, string> = {
  PENDING: 'Voltar para aguardando',
  CONFIRMED: 'Confirmar reserva',
  CANCELLED: 'Cancelar reserva',
  COMPLETED: 'Marcar como concluída',
};

/** O que acontece com o cliente em cada decisão (§13.4: explicar o resultado). */
const ACTION_EFFECT: Record<BookingStatus, string> = {
  PENDING: 'A reserva volta a aguardar confirmação.',
  CONFIRMED:
    'O cliente recebe um e-mail com as datas, os horários e o endereço, e as datas deixam de ter prazo.',
  CANCELLED:
    'As datas voltam a ficar livres no site e o cliente recebe um e-mail com o motivo que você escrever.',
  COMPLETED: 'A reserva sai das próximas e passa a contar como realizada.',
};

export function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const booking = useAdminBooking(id ?? null);
  const updateStatus = useUpdateBookingStatus();
  const updateNotes = useUpdateBookingNotes();
  const { showToast } = useToast();

  const [pendingAction, setPendingAction] = useState<BookingStatus | null>(null);
  const [reason, setReason] = useState('');

  /*
   * A anotação só existe no estado **enquanto está sendo editada**; `null` quer
   * dizer "mostre o que veio do servidor".
   *
   * Isso resolve um problema concreto sem efeito nenhum: confirmar uma reserva
   * invalida esta chave, e copiar a resposta para o estado a cada releitura
   * apagaria o que o dono estivesse digitando no meio.
   */
  const [draftNotes, setDraftNotes] = useState<string | null>(null);

  if (booking.isPending) {
    return (
      <div className={adminStyles.page}>
        <Skeleton rows={8} />
      </div>
    );
  }

  if (booking.isError || !booking.data) {
    return (
      <div className={adminStyles.page}>
        <h1 className={adminStyles.title}>Não encontramos esta reserva</h1>
        <p>{formErrorMessage(booking.error) ?? 'O endereço pode estar incompleto.'}</p>
        <Link className={styles.back} to="/admin/reservas">
          <ArrowLeftIcon size={20} />
          Voltar para as reservas
        </Link>
      </div>
    );
  }

  const data: AdminBooking = booking.data;
  const dates = formatDateRange(data.startDate, data.endDate);
  const needsReason = pendingAction === 'CANCELLED';
  const notes = draftNotes ?? data.adminNotes ?? '';

  async function applyStatus() {
    if (!pendingAction || !id) return;

    try {
      await updateStatus.mutateAsync({
        id,
        body: { status: pendingAction, reason: reason.trim() === '' ? null : reason.trim() },
      });
      showToast(`Reserva de ${dates}: ${BOOKING_STATUS_LABELS[pendingAction].toLowerCase()}.`);
      setPendingAction(null);
      setReason('');
    } catch (error) {
      showToast(formErrorMessage(error) ?? 'Não conseguimos mudar a situação.', 'error');
    }
  }

  async function saveNotes() {
    if (!id) return;

    try {
      await updateNotes.mutateAsync({
        id,
        body: { adminNotes: notes.trim() === '' ? null : notes.trim() },
      });
      // Volta a seguir o servidor: o que foi salvo agora é a fonte da verdade.
      setDraftNotes(null);
      showToast('Anotação salva.');
    } catch (error) {
      showToast(formErrorMessage(error) ?? 'Não conseguimos salvar a anotação.', 'error');
    }
  }

  return (
    <div className={adminStyles.page}>
      <Link className={styles.back} to="/admin/reservas">
        <ArrowLeftIcon size={20} />
        Reservas
      </Link>

      <header className={styles.header}>
        <div className={styles.headerMain}>
          <StatusBadge status={data.status} />
          <h1 className={adminStyles.title}>{dates}</h1>
          <p className={styles.lead}>
            {EVENT_TYPE_LABELS[data.eventType]} para {data.guestCount}{' '}
            {data.guestCount === 1 ? 'pessoa' : 'pessoas'}
          </p>
        </div>

        <span className={styles.total}>
          <Money cents={data.totalCents} />
        </span>
      </header>

      {data.status === 'PENDING' && data.holdExpiresAt ? (
        <p className={styles.hold}>
          As datas ficam seguras <strong>{formatTimeUntil(data.holdExpiresAt)}</strong>, até{' '}
          {formatDeadline(data.holdExpiresAt)}. Depois disso o pedido se encerra sozinho.
        </p>
      ) : null}

      {/* Ações primeiro: é o que o dono veio fazer aqui. */}
      {data.allowedTransitions.length > 0 ? (
        <div className={styles.actions}>
          {data.allowedTransitions.map((target) => (
            <Button
              key={target}
              variant={target === 'CANCELLED' ? 'danger' : 'primary'}
              onClick={() => {
                setPendingAction(target);
                setReason('');
              }}
            >
              {ACTION_LABEL[target]}
            </Button>
          ))}
        </div>
      ) : (
        <p className={styles.closed}>
          Esta reserva está {BOOKING_STATUS_LABELS[data.status].toLowerCase()} e não muda mais.
        </p>
      )}

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Cliente</h2>

        <p className={styles.customerName}>{data.customer.name}</p>

        <dl className={styles.facts}>
          <div>
            <dt>E-mail</dt>
            <dd>{data.customer.email ?? 'não informado'}</dd>
          </div>
          <div>
            <dt>Telefone</dt>
            <dd>{data.customer.phone ?? 'não informado'}</dd>
          </div>
        </dl>

        {data.customer.phone ? (
          <a
            className={styles.whatsapp}
            href={whatsappUrl(
              data.customer.phone,
              `Olá, ${data.customer.name}! Falo sobre a sua reserva de ${dates}.`,
            )}
            target="_blank"
            rel="noreferrer"
          >
            Falar pelo WhatsApp
          </a>
        ) : null}
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Valores</h2>

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
          <p className={styles.hint}>Sem itens de decoração: só a chácara.</p>
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

        <p className={styles.totalLine}>
          <span>Total</span>
          <strong>
            <Money cents={data.totalCents} />
          </strong>
        </p>
      </section>

      {data.customerNotes ? (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>O que o cliente escreveu</h2>
          <p className={styles.quote}>{data.customerNotes}</p>
        </section>
      ) : null}

      {/* §13.4: nota interna. Nunca sai para o cliente, e o rótulo diz isso. */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Suas anotações</h2>

        <Textarea
          label="Anotação interna"
          help="Só você vê. O cliente nunca recebe este texto."
          rows={4}
          maxLength={2000}
          value={notes}
          onChange={(event) => setDraftNotes(event.target.value)}
        />

        <div>
          <Button
            variant="secondary"
            loading={updateNotes.isPending}
            loadingLabel="Salvando…"
            disabled={notes.trim() === (data.adminNotes ?? '')}
            onClick={() => void saveNotes()}
          >
            Salvar anotação
          </Button>
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Como chegou até aqui</h2>

        <ul className={styles.timeline}>
          <li>
            <strong>Pedido recebido</strong> em {formatDeadline(data.createdAt)}
            {data.createdByAdmin ? ' — lançado por você no painel' : ' — enviado pelo site'}
          </li>

          {data.status === 'CANCELLED' ? (
            <li>
              <strong>Cancelada</strong> em {formatDeadline(data.updatedAt)}
              {data.cancelledBy === 'ADMIN'
                ? ' por você'
                : data.cancelledBy === 'CLIENT'
                  ? ' pelo cliente'
                  : ' por prazo vencido'}
              {data.cancelReason ? `: ${data.cancelReason}` : ''}
            </li>
          ) : null}

          {data.status === 'CONFIRMED' ? (
            <li>
              <strong>Confirmada</strong> em {formatDeadline(data.updatedAt)}
            </li>
          ) : null}

          {data.status === 'COMPLETED' ? (
            <li>
              <strong>Concluída</strong> — a festa foi em {formatDateLong(data.endDate)}
            </li>
          ) : null}
        </ul>
      </section>

      <Dialog
        open={pendingAction !== null}
        title={pendingAction ? ACTION_LABEL[pendingAction] : ''}
        onClose={() => setPendingAction(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingAction(null)}>
              Voltar
            </Button>
            <Button
              variant={needsReason ? 'danger' : 'primary'}
              loading={updateStatus.isPending}
              loadingLabel="Salvando…"
              disabled={needsReason && reason.trim() === ''}
              onClick={() => void applyStatus()}
            >
              {pendingAction ? ACTION_LABEL[pendingAction] : ''}
            </Button>
          </>
        }
      >
        <p className={styles.confirmText}>
          Reserva de <strong>{dates}</strong>, de {data.customer.name}.
        </p>

        {pendingAction ? (
          <p className={styles.confirmDetail}>{ACTION_EFFECT[pendingAction]}</p>
        ) : null}

        {/* §11.3: o motivo é obrigatório para cancelar — vai no e-mail do cliente. */}
        {needsReason ? (
          <Textarea
            label="Motivo do cancelamento"
            help="Obrigatório. O cliente recebe este texto por e-mail."
            rows={3}
            maxLength={300}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        ) : null}
      </Dialog>
    </div>
  );
}
