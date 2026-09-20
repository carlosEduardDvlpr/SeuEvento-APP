import { useId, type InputHTMLAttributes } from 'react';
import styles from './Field.module.css';

/**
 * Campo de formulário (§14.11 e §12.5).
 *
 * Regras que este componente garante:
 * - rótulo **sempre visível**, nunca placeholder fazendo papel de rótulo;
 * - ajuda e erro ligados ao campo por `aria-describedby`, para leitor de tela
 *   anunciar o motivo da recusa;
 * - `aria-invalid` quando há erro, e a mensagem abaixo do campo;
 * - `autocomplete` fica a cargo de quem usa, porque depende do significado do
 *   campo (`email`, `tel`, `new-password`).
 */
export type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  label: string;
  help?: string;
  error?: string;
};

export function Field({ label, help, error, className, ...props }: FieldProps) {
  const id = useId();
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;

  const describedBy = [help ? helpId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>

      {help ? (
        <span className={styles.help} id={helpId}>
          {help}
        </span>
      ) : null}

      <input
        id={id}
        className={[styles.control, error ? styles.invalid : null, className]
          .filter(Boolean)
          .join(' ')}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        {...props}
      />

      {error ? (
        <span className={styles.error} id={errorId}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
