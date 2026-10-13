import { useId, type ReactNode, type SelectHTMLAttributes } from 'react';
import styles from './Field.module.css';

/**
 * Campo de seleção (§14.11).
 *
 * Mesmo contrato visual e de acessibilidade do `Field`, e compartilha o CSS com
 * ele de propósito: rótulo e erro precisam ficar idênticos num formulário que
 * mistura texto e seleção.
 *
 * `select` nativo, sem substituto estilizado: o do sistema operacional já é
 * acessível, funciona com teclado e abre como roda no celular.
 */
export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & {
  label: string;
  help?: string;
  error?: string;
  children: ReactNode;
};

export function Select({ label, help, error, className, children, ...props }: SelectProps) {
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

      <select
        id={id}
        className={[styles.control, error ? styles.invalid : null, className]
          .filter(Boolean)
          .join(' ')}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        {...props}
      >
        {children}
      </select>

      {error ? (
        <span className={styles.error} id={errorId}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
