import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

/**
 * Botão (§14.11).
 *
 * Altura mínima de 44 px para o toque. Estado de carregamento troca o **rótulo**
 * em vez de mostrar spinner isolado, porque o rótulo diz o que está acontecendo
 * e é lido por leitor de tela.
 *
 * Só há um `variant="primary"` visível por tela (§14.2).
 */
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  /** Rótulo durante o carregamento, ex.: "Enviando pedido…". */
  loadingLabel?: string;
  children: ReactNode;
};

export function Button({
  variant = 'secondary',
  loading = false,
  loadingLabel,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  const classes = [styles.button, styles[variant], className].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  );
}
