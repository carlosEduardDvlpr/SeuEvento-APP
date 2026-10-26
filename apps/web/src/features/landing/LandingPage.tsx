import { useCombos, useGallery, useItems, useThemes } from '@/api/storefront';
import { useVenue } from '@/api/venue';
import { Skeleton } from '@/components/Skeleton';
import { formErrorMessage } from '@/lib/form';
import { CombosSection } from './CombosSection';
import { DirectionsSection } from './DirectionsSection';
import { FaqSection } from './FaqSection';
import { HeroSection } from './HeroSection';
import { HowItWorksSection } from './HowItWorksSection';
import { ItemsSection } from './ItemsSection';
import { ThemesSection } from './ThemesSection';
import { VenueSection } from './VenueSection';
import styles from './LandingPage.module.css';

/**
 * Landing (§13.1).
 *
 * A ordem das seções é decisão de produto e está fixada na §13.1 — não mexer sem
 * aprovação. O objetivo é fazer a pessoa sentir a festa na chácara e chegar às
 * datas em um gesto, e é por isso que o hero tem um botão só, o que leva ao
 * calendário.
 *
 * A vitrine de itens (`ItemsSection`) entrou depois, a pedido do dono, entre os
 * estilos e os combos: é o bloco da decoração, e ela precisa aparecer mesmo
 * quando ainda não há estilo cadastrado. A galeria de festas ("Festas que já
 * aconteceram aqui") saiu, também a pedido do dono: fotos da seção "Eventos"
 * que ainda existam no banco são ignoradas.
 *
 * **Seção sem conteúdo não aparece.** Estilos, itens e combos se escondem
 * sozinhos quando o painel ainda não tem nada: a §16.6 proíbe inventar
 * conteúdo, e uma seção vazia é pior que a ausência dela.
 *
 * Os depoimentos da §13.1 (item 7) ficam de fora por decisão consciente: a §13.1
 * exige depoimento **real, com nome e tipo de evento**, e não há onde guardá-los
 * (§8 não tem o modelo). Inventar seria o único jeito de a seção existir hoje.
 *
 * Cada seção busca o que precisa por hook próprio, em paralelo. A página espera
 * só `venue`, de que a chácara, as perguntas e o "como chegar" dependem; o resto
 * aparece conforme chega.
 */
export function LandingPage() {
  const venue = useVenue();
  const gallery = useGallery();
  const themes = useThemes();
  const items = useItems();
  const combos = useCombos();

  if (venue.isPending) {
    return (
      <div className={styles.state} aria-busy="true">
        <Skeleton rows={6} />
      </div>
    );
  }

  if (venue.isError || !venue.data) {
    return (
      <div className={styles.state}>
        <h1>Não conseguimos carregar a página</h1>
        <p>{formErrorMessage(venue.error) ?? 'Tente de novo em instantes.'}</p>
      </div>
    );
  }

  const images = gallery.data ?? [];
  const hero = images.find((image) => image.kind === 'HERO');
  const areas = images.filter((image) => image.kind === 'VENUE');

  return (
    <>
      <HeroSection hero={hero} />
      <VenueSection venue={venue.data} areas={areas} />
      <HowItWorksSection />
      <ThemesSection themes={themes.data ?? []} />
      <ItemsSection items={items.data ?? []} />
      <CombosSection combos={combos.data ?? []} />
      <FaqSection venue={venue.data} />
      <DirectionsSection venue={venue.data} />
    </>
  );
}
