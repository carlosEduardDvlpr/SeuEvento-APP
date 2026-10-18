import type { PublicVenue } from '@chacara/shared';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useVenue } from '@/api/venue';
import { Skeleton } from '@/components/Skeleton';
import { formErrorMessage } from '@/lib/form';
import styles from './legal.module.css';

/**
 * Casca das duas páginas legais da §10.8 (`/termos` e `/privacidade`).
 *
 * As duas dependem de `VenueSettings`, e pelo mesmo motivo da FAQ (§13.1): todo
 * número e todo contato saem dos mesmos dados que o sistema usa para decidir.
 * Prazo de cancelamento escrito à mão aqui divergiria do prazo que a API aplica
 * na primeira vez que o dono mudasse a configuração — e uma página legal que
 * contradiz o sistema é pior que não existir.
 *
 * Por isso elas esperam a chácara carregar em vez de mostrar texto com lacuna.
 */
export type LegalPageProps = {
  title: string;
  lead: string;
  children: (venue: PublicVenue) => ReactNode;
  /** Link para a outra página legal, no pé. */
  sibling: { to: string; label: string };
};

export function LegalPage({ title, lead, children, sibling }: LegalPageProps) {
  const venue = useVenue();

  if (venue.isPending) {
    return (
      <div className={styles.state} aria-busy="true">
        <h1 className={styles.title}>{title}</h1>
        <Skeleton rows={8} />
      </div>
    );
  }

  if (venue.isError || !venue.data) {
    return (
      <div className={styles.state}>
        <h1 className={styles.title}>{title}</h1>
        <p role="alert">
          {formErrorMessage(venue.error) ?? 'Não conseguimos carregar esta página agora.'}
        </p>
        <p>
          <Link to="/">Voltar para a página inicial</Link>
        </p>
      </div>
    );
  }

  return (
    <article className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.lead}>{lead}</p>
      </header>

      {children(venue.data)}

      <nav className={styles.footerNav} aria-label="Outras páginas">
        <Link to={sibling.to}>{sibling.label}</Link>
        <Link to="/">Página inicial</Link>
      </nav>
    </article>
  );
}

/** Bloco com título, para as seções não repetirem a marcação. */
export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}

export { styles as legalStyles };
