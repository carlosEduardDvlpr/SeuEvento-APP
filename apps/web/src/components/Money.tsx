import { formatBRL } from '@/lib/format';
import styles from './Money.module.css';

/**
 * Dinheiro na tela (§14.11).
 *
 * Recebe **centavos inteiros**, porque é isso que trafega na API (§7.2). Usa
 * `tabular-nums` para os valores alinharem em coluna de tabela.
 */
export function Money({ cents, className }: { cents: number; className?: string }) {
  return (
    <span className={className ? `${styles.money} ${className}` : styles.money}>
      {formatBRL(cents)}
    </span>
  );
}
