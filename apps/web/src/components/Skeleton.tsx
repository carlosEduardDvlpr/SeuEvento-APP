import styles from './Skeleton.module.css';

/**
 * Espaço reservado enquanto a lista carrega (§12.6, §18.2).
 *
 * Ocupa a altura aproximada do conteúdo real para a página não pular quando os
 * dados chegam. A animação respeita `prefers-reduced-motion` pelo token
 * `--transition`.
 *
 * Invisível para leitor de tela: quem anuncia o carregamento é o texto da região
 * ao redor, não um punhado de retângulos.
 */
export type SkeletonProps = {
  /** Quantas linhas reservar. */
  rows?: number;
  className?: string;
};

export function Skeleton({ rows = 3, className }: SkeletonProps) {
  return (
    <div className={[styles.stack, className].filter(Boolean).join(' ')} aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className={styles.row} />
      ))}
    </div>
  );
}
