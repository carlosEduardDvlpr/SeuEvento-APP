import { useEffect, useId, useRef, type ReactNode } from 'react';
import styles from './Dialog.module.css';
import { CloseIcon } from './icons';

/**
 * Diálogo modal (§12.6, §18.1).
 *
 * Usa o `<dialog>` nativo com `showModal()`, e isso é a decisão central: o
 * navegador já entrega prisão de foco, fechamento por Escape, `aria-modal` e
 * backdrop inerte. Reimplementar isso em React custaria dezenas de linhas de
 * gerenciamento de foco para ficar pior.
 *
 * O rodapé é passado por `footer` em vez de ficar no corpo, para as ações
 * continuarem visíveis quando o formulário for longo e o corpo rolar.
 */
export type DialogProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

export function Dialog({ open, title, onClose, children, footer }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    // `open` como atributo não ativa o modo modal; só `showModal()` ativa.
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    /*
     * Escape e o backdrop fecham o `<dialog>` sem passar pelo React, então o
     * estado de quem nos usa precisa ser avisado pelo evento `close` — senão
     * reabrir não funcionaria, porque o estado continuaria "aberto".
     */
    const handleClose = () => onClose();
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  return (
    <dialog ref={ref} className={styles.dialog} aria-labelledby={titleId}>
      <div className={styles.header}>
        <h2 className={styles.title} id={titleId}>
          {title}
        </h2>

        <button type="button" className={styles.close} onClick={onClose} aria-label="Fechar">
          <CloseIcon />
        </button>
      </div>

      <div className={styles.body}>{children}</div>

      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </dialog>
  );
}
