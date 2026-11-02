import { todayInSaoPaulo } from '@chacara/shared';
import { useState } from 'react';
import { useMarkPayment } from '@/api/admin-finance';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { Field } from '@/components/Field';
import { Money } from '@/components/Money';
import { useToast } from '@/components/Toast';
import { formErrorMessage } from '@/lib/form';
import { formatBRL, formatDateShort } from '@/lib/format';
import adminStyles from '../admin.module.css';

/**
 * Registra o dia em que o dinheiro entrou (§9.11).
 *
 * O dia vem preenchido com hoje, que é o caso comum ("o Pix caiu agora"), mas
 * pode ser outro: quem anota no sábado o que recebeu na terça precisa registrar
 * a terça. Dia no futuro não existe, e a API recusa do mesmo jeito.
 *
 * Quem usa monta o diálogo só enquanto ele está aberto, então cada recebimento
 * começa com o formulário limpo.
 */
export type ReceivePaymentDialogProps = {
  payment: { id: string; label: string; amountCents: number; dueDate: string };
  /** De quem é o pagamento, para a frase de confirmação. */
  customerName: string;
  onClose: () => void;
};

export function ReceivePaymentDialog({
  payment,
  customerName,
  onClose,
}: ReceivePaymentDialogProps) {
  const today = todayInSaoPaulo();
  const mark = useMarkPayment();
  const { showToast } = useToast();

  const [paidOn, setPaidOn] = useState(today);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (paidOn === '') {
      setError('Informe o dia em que o dinheiro entrou.');
      return;
    }

    if (paidOn > today) {
      setError('A data do recebimento não pode ser depois de hoje.');
      return;
    }

    try {
      await mark.mutateAsync({ paymentId: payment.id, paidOn });
      showToast(`Recebimento registrado: ${payment.label}, ${formatBRL(payment.amountCents)}.`);
      onClose();
    } catch (failure) {
      setError(formErrorMessage(failure) ?? 'Não conseguimos registrar o recebimento.');
    }
  }

  return (
    <Dialog
      open
      title="Registrar recebimento"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mark.isPending}>
            Voltar
          </Button>
          <Button
            variant="primary"
            loading={mark.isPending}
            loadingLabel="Salvando…"
            onClick={() => void confirm()}
          >
            Registrar recebimento
          </Button>
        </>
      }
    >
      <div className={adminStyles.form}>
        {error ? (
          <p className={adminStyles.formError} role="alert">
            {error}
          </p>
        ) : null}

        <div>
          <p className={adminStyles.confirmText}>
            <strong>{payment.label}</strong> de {customerName}:{' '}
            <Money cents={payment.amountCents} />, com vencimento em{' '}
            {formatDateShort(payment.dueDate)}.
          </p>
          <p className={adminStyles.confirmDetail}>
            O valor passa a contar como recebido no Financeiro e sai do que falta cobrar.
          </p>
        </div>

        <Field
          label="Recebido em"
          type="date"
          max={today}
          value={paidOn}
          onChange={(event) => setPaidOn(event.target.value)}
        />
      </div>
    </Dialog>
  );
}
