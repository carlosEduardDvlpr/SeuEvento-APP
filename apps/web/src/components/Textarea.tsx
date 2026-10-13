import { useId, type TextareaHTMLAttributes } from 'react';
import styles from './Field.module.css';

/**
 * Campo de texto longo (§14.11).
 *
 * Divide o CSS com o `Field` para rótulo, ajuda e erro ficarem idênticos no mesmo
 * formulário. A altura mínima vem de `rows`, não de CSS, para o campo crescer com
 * o tamanho do texto esperado.
 */
export type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> & {
  label: string;
  help?: string;
  error?: string;
};

export function Textarea({ label, help, error, className, rows = 3, ...props }: TextareaProps) {
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

      <textarea
        id={id}
        rows={rows}
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
