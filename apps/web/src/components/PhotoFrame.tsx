import type { CSSProperties, ReactNode } from 'react';
import { HexMarkIcon } from './icons';
import styles from './PhotoFrame.module.css';

/**
 * Moldura de foto, a única forma-assinatura do projeto.
 *
 * Sem `src`, renderiza o bloco de cor chapada previsto na §14.9 — nunca uma foto
 * de banco de imagens. A proporção é reservada por `aspect-ratio`, então trocar
 * o bloco por foto real depois não causa salto de layout.
 *
 * Chamava-se `ArchFrame` enquanto a forma era um arco. O CSS explica por que a
 * identidade real trocou o arco pelo passe-partout com fio dourado.
 */
export type PhotoFrameProps = {
  src?: string | null;
  /** Obrigatório quando há imagem; foto decorativa usa string vazia. */
  alt?: string;
  variant?: 'hero' | 'tall';
  /** Cor do bloco quando não há foto, normalmente vinda da paleta do estilo. */
  fillColor?: string;
  loading?: 'eager' | 'lazy';
  children?: ReactNode;
  className?: string;
};

export function PhotoFrame({
  src,
  alt = '',
  variant = 'hero',
  fillColor,
  loading = 'lazy',
  children,
  className,
}: PhotoFrameProps) {
  const classes = [styles.frame, variant === 'tall' ? styles.tall : null, className]
    .filter(Boolean)
    .join(' ');

  const style = fillColor ? ({ '--fill': fillColor } as CSSProperties) : undefined;

  return (
    <div className={classes} style={style}>
      {src ? (
        <img src={src} alt={alt} loading={loading} decoding="async" />
      ) : (
        <div className={styles.placeholder}>{children ?? <HexMarkIcon size={48} />}</div>
      )}
    </div>
  );
}
