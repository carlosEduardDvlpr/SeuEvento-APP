import { ImageIcon } from './icons';
import styles from './Thumbnail.module.css';

/**
 * Foto pequena e quadrada de uma decoração, ao lado do nome dela (§13.3, §13.4).
 *
 * É decorativa (`alt=""`): quem usa põe o nome logo ao lado, e repeti-lo na foto
 * faria o leitor de tela dizer tudo duas vezes (§18.1). Sem foto cadastrada, o
 * ícone ocupa o mesmo lugar, e as linhas de uma lista não desalinham.
 */
export type ThumbnailProps = {
  src: string | null | undefined;
  className?: string;
};

export function Thumbnail({ src, className }: ThumbnailProps) {
  return (
    <span className={className ? `${styles.thumb} ${className}` : styles.thumb}>
      {src ? <img src={src} alt="" loading="lazy" decoding="async" /> : <ImageIcon size={20} />}
    </span>
  );
}
