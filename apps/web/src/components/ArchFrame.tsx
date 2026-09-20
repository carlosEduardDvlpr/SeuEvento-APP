import type { CSSProperties, ReactNode } from 'react';
import { ArchMarkIcon } from './icons';
import styles from './ArchFrame.module.css';

/**
 * Moldura em arco (§14.6), a única forma-assinatura do projeto.
 *
 * Sem `src`, renderiza o bloco de cor chapada previsto na §14.9 — nunca uma foto
 * de banco de imagens. A proporção é reservada por `aspect-ratio`, então trocar
 * o bloco por foto real depois não causa salto de layout.
 */
export type ArchFrameProps = {
  src?: string | null;
  /** Obrigatório quando há imagem; foto decorativa usa string vazia. */
  alt?: string;
  variant?: 'hero' | 'tall';
  /** Cor do bloco quando não há foto, normalmente vinda da paleta do estilo. */
  fillColor?: string;
  children?: ReactNode;
  className?: string;
};

export function ArchFrame({
  src,
  alt = '',
  variant = 'hero',
  fillColor,
  children,
  className,
}: ArchFrameProps) {
  const classes = [styles.arch, variant === 'tall' ? styles.tall : null, className]
    .filter(Boolean)
    .join(' ');

  const style = fillColor ? ({ '--fill': fillColor } as CSSProperties) : undefined;

  return (
    <div className={classes} style={style}>
      {src ? (
        <img src={src} alt={alt} loading="eager" decoding="async" />
      ) : (
        <div className={styles.placeholder}>{children ?? <ArchMarkIcon size={48} />}</div>
      )}
    </div>
  );
}
