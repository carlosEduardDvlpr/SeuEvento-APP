import type { ReactNode } from 'react';
import styles from './AuthCard.module.css';

/**
 * Moldura das telas de autenticação.
 *
 * Sem o arco da §14.6: aquela forma é reservada ao hero, aos cartões de estilo, ao
 * combo em destaque e à ilustração de estado vazio. Formulário usa cartão comum.
 */
export function AuthCard({
  title,
  lead,
  children,
  footer,
}: {
  title: string;
  lead?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className={styles.wrapper}>
      <section className={styles.card}>
        <h1>{title}</h1>
        {lead ? <p className={styles.lead}>{lead}</p> : null}

        {children}

        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </section>
    </div>
  );
}

/**
 * Resumo do erro que não pertence a um campo (§18.1).
 *
 * `role="alert"` faz o leitor de tela anunciar na hora: sem isso, quem não vê a
 * tela não descobre por que o envio não passou.
 */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <p className={styles.formError} role="alert">
      {message}
    </p>
  );
}

export function FormNotice({ children }: { children: ReactNode }) {
  return (
    <p className={styles.notice} role="status">
      {children}
    </p>
  );
}

export { styles as authStyles };
