import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import styles from './admin.module.css';

/**
 * Confirmação de ação destrutiva (§13).
 *
 * A §13 é explícita: o diálogo **explica o resultado**, não pergunta "tem
 * certeza?". "Isso cancela a reserva e avisa o cliente por e-mail" permite
 * decidir; "tem certeza?" só transfere a dúvida.
 *
 * O botão de confirmar nomeia a ação ("Excluir item"), porque quem lê só os
 * botões ainda entende o que vai acontecer.
 */
export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  /** Consequência menos óbvia, quando houver. */
  detail?: string;
  confirmLabel: string;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  detail,
  confirmLabel,
  loading = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Voltar
          </Button>
          <Button variant="primary" onClick={onConfirm} loading={loading} loadingLabel="Excluindo…">
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className={styles.confirmText}>{message}</p>
      {detail ? <p className={styles.confirmDetail}>{detail}</p> : null}
    </Dialog>
  );
}
