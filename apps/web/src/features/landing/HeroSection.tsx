import type { GalleryImage } from '@chacara/shared';
import { Link } from 'react-router';
import { ArrowRightIcon } from '@/components/icons';
import styles from './HeroSection.module.css';

/**
 * Hero (§13.1, item 1).
 *
 * O nome, uma frase e **uma** ação: "Reservar uma data", que abre o calendário
 * do wizard. Era um seletor com as próximas datas livres; o dono preferiu uma
 * abertura limpa, com o texto centralizado sobre a foto e um botão só.
 *
 * Sem a agenda aqui, a landing deixou de consultar a disponibilidade: quem
 * mostra os dias livres é o calendário do wizard, que já pede a agenda do mês.
 *
 * A entrada em fade é só CSS, então roda no primeiro desenho do HTML
 * pré-renderizado, sem esperar o JavaScript.
 */

export type HeroSectionProps = {
  /** Primeira imagem de destaque, quando o dono já subiu uma (§14.9). */
  hero: GalleryImage | undefined;
};

export function HeroSection({ hero }: HeroSectionProps) {
  return (
    <section className={styles.hero}>
      {hero ? (
        <img
          className={styles.image}
          src={hero.url}
          alt={hero.alt}
          loading="eager"
          decoding="async"
          fetchPriority="high"
        />
      ) : (
        <div className={styles.imageFallback} aria-hidden="true" />
      )}

      <div className={styles.scrim} aria-hidden="true" />

      <div className={styles.content}>
        <h1 className={styles.title}>Espaço Donna Belle</h1>

        <p className={styles.lead}>O cenário perfeito para momentos inesquecíveis.</p>

        <Link className={styles.cta} to="/reservar">
          Reservar uma data
          <ArrowRightIcon size={22} />
        </Link>
      </div>
    </section>
  );
}
