import type { AdminBooking, AdminPayment } from '@chacara/shared';
import { useState } from 'react';
import { useDeletePaymentPlan, useMarkPayment, usePaymentPlan } from '@/api/admin-finance';
import { Button } from '@/components/Button';
import { Money } from '@/components/Money';
import { Skeleton } from '@/components/Skeleton';
import { PaymentStatusBadge } from '@/components/StatusBadge';
import { useToast } from '@/components/Toast';
import { formErrorMessage } from '@/lib/form';
import { formatDateShort } from '@/lib/format';
import { ConfirmDialog } from '../ConfirmDialog';
import detailStyles from '../bookings/BookingDetailPage.module.css';
import { PaymentPlanDialog } from './PaymentPlanDialog';
import { ReceivePaymentDialog } from './ReceivePaymentDialog';
import styles from './payments.module.css';

/**
 * Pagamento da reserva, no detalhe do painel (§9.11, §13.4).
 *
 * Mostra o plano (o sinal e as parcelas, com a situação de cada um) e é onde o
 * dono anota o que recebeu. Fica logo depois dos valores porque responde à
 * pergunta seguinte: do total, quanto já entrou e quanto falta.
 *
 * O plano tem consulta própria, em vez de vir dentro da reserva: o resto do
 * detalhe não depende dele, e uma falha aqui não esconde a reserva.
 *
 * Usa as classes de cartão do detalhe para ficar igual às outras seções.
 */
export type PaymentCardProps = {
  booking: Pick<AdminBooking, 'id' | 'startDate' | 'totalCents' | 'customer'>;
};

export function PaymentCard({ booking }: PaymentCardProps) {
  const plan = usePaymentPlan(booking.id);
  const mark = useMarkPayment();
  const removePlan = useDeletePaymentPlan();
  const { showToast } = useToast();

  const [editing, setEditing] = useState(false);
  const [receiving, setReceiving] = useState<AdminPayment | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function undo(payment: AdminPayment) {
    try {
      await mark.mutateAsync({ paymentId: payment.id, paidOn: null });
      showToast(`Recebimento desfeito: ${payment.label}.`);
    } catch (error) {
      showToast(formErrorMessage(error) ?? 'Não conseguimos desfazer o recebimento.', 'error');
    }
  }

  async function confirmDelete() {
    try {
      await removePlan.mutateAsync(booking.id);
      showToast('Plano de pagamento excluído.');
      setDeleting(false);
    } catch (error) {
      showToast(formErrorMessage(error) ?? 'Não conseguimos excluir o plano.', 'error');
    }
  }

  const data = plan.data;
  const hasPlan = (data?.payments.length ?? 0) > 0;
  // Reserva de valor zero não tem o que dividir: a soma nunca bateria.
  const canEdit = data?.canEdit === true && booking.totalCents > 0;

  function emptyText(): string {
    if (booking.totalCents === 0) return 'Esta reserva não tem valor a receber.';
    if (canEdit) {
      return 'Nenhum pagamento registrado. Anote o sinal e as parcelas para acompanhar no Financeiro o que falta receber.';
    }
    return 'Nenhum pagamento registrado.';
  }

  return (
    <section className={detailStyles.card}>
      <div className={styles.cardHead}>
        <h2 className={detailStyles.cardTitle}>Pagamento</h2>

        {canEdit ? (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            {hasPlan ? 'Editar pagamento' : 'Registrar pagamento'}
          </Button>
        ) : null}
      </div>

      {plan.isPending ? <Skeleton rows={3} /> : null}

      {plan.isError ? (
        <p className={detailStyles.hint}>
          {formErrorMessage(plan.error) ?? 'Não conseguimos carregar o pagamento desta reserva.'}
        </p>
      ) : null}

      {data && !hasPlan ? <p className={detailStyles.hint}>{emptyText()}</p> : null}

      {data && hasPlan ? (
        <>
          <ul className={styles.payments}>
            {data.payments.map((payment) => (
              <li key={payment.id} className={styles.payment}>
                <span className={styles.paymentName}>
                  <strong>{payment.label}</strong>
                  <PaymentStatusBadge status={payment.status} />
                </span>

                <span className={styles.paymentValue}>
                  <Money cents={payment.amountCents} />
                </span>

                <span className={styles.paymentWhen}>
                  {payment.paidOn
                    ? `Recebido em ${formatDateShort(payment.paidOn)}`
                    : `Vence em ${formatDateShort(payment.dueDate)}`}
                </span>

                <span className={styles.paymentAction}>
                  {payment.paidOn ? (
                    <Button
                      variant="ghost"
                      aria-label={`Desfazer recebimento: ${payment.label}`}
                      loading={mark.isPending && mark.variables?.paymentId === payment.id}
                      loadingLabel="Desfazendo…"
                      onClick={() => void undo(payment)}
                    >
                      Desfazer
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      aria-label={`Registrar recebimento: ${payment.label}`}
                      onClick={() => setReceiving(payment)}
                    >
                      Registrar recebimento
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>

          <dl className={styles.totals}>
            <div>
              <dt>Recebido</dt>
              <dd>
                <Money cents={data.paidCents} />
              </dd>
            </div>
            <div>
              <dt>A receber</dt>
              <dd>
                <Money cents={data.pendingCents} />
              </dd>
            </div>
            {data.overdueCents > 0 ? (
              <div className={styles.overdue}>
                <dt>Em atraso</dt>
                <dd>
                  <Money cents={data.overdueCents} />
                </dd>
              </div>
            ) : null}
          </dl>

          {data.canEdit ? null : (
            <p className={detailStyles.hint}>
              Reserva cancelada: o que estava em aberto deixou de ser cobrado. O que já entrou
              continua registrado.
            </p>
          )}

          {data.canDelete ? (
            <div>
              <Button variant="ghost" onClick={() => setDeleting(true)}>
                Excluir plano
              </Button>
            </div>
          ) : null}
        </>
      ) : null}

      {editing && data ? (
        <PaymentPlanDialog booking={booking} plan={data} onClose={() => setEditing(false)} />
      ) : null}

      {receiving ? (
        <ReceivePaymentDialog
          payment={receiving}
          customerName={booking.customer.name}
          onClose={() => setReceiving(null)}
        />
      ) : null}

      {/* Os diálogos só existem enquanto abertos: o detalhe já tem o seu, sempre montado. */}
      {deleting ? (
        <ConfirmDialog
          open
          title="Excluir plano de pagamento"
          message="O sinal e as parcelas desta reserva deixam de existir."
          detail="A reserva e o total contratado não mudam. Use quando o plano foi lançado por engano."
          confirmLabel="Excluir plano"
          loading={removePlan.isPending}
          onConfirm={() => void confirmDelete()}
          onClose={() => setDeleting(false)}
        />
      ) : null}
    </section>
  );
}
