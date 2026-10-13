import type { ReactNode } from 'react';
import { ArchFrame } from './ArchFrame';
import styles from './EmptyState.module.css';

/**
 * Lista sem nada ainda (§16.5).
 *
 * Estado vazio explica **o que aquilo serve** e dá o próximo passo, em vez de
 * mostrar "Nenhum resultado". Para quem abre o painel pela primeira vez, é esta
 * tela que ensina o sistema.
 *
 * Usa o arco (§14.6), que a §14.9 lista como um dos lugares da forma-assinatura.
 */
export type EmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <ArchFrame className={styles.frame} />

      <h3 className={styles.title}>{title}</h3>
      <p className={styles.description}>{description}</p>

      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
