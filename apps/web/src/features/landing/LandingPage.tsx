import { useCombos, useGallery, useThemes } from '@/api/storefront';
import { useVenue } from '@/api/venue';
import { Skeleton } from '@/components/Skeleton';
import { formErrorMessage } from '@/lib/form';
import { CombosSection } from './CombosSection';
import { DirectionsSection } from './DirectionsSection';
import { FaqSection } from './FaqSection';
import { GallerySection } from './GallerySection';
import { HeroSection } from './HeroSection';
import { HowItWorksSection } from './HowItWorksSection';
import { ThemesSection } from './ThemesSection';
import { VenueSection } from './VenueSection';
import styles from './LandingPage.module.css';

/**
 * Landing (§13.1).
 *
 * A ordem das seções é decisão de produto e está fixada na §13.1 — não mexer sem
 * aprovação. O objetivo é fazer a pessoa sentir a festa na chácara e chegar às
 * datas em um gesto, e é por isso que o seletor de datas está no hero, não no
 * fim.
 *
 * **Seção sem conteúdo não aparece.** Galeria, estilos e combos se escondem
 * sozinhos quando o painel ainda não tem nada: a §16.6 proíbe inventar conteúdo,
 * e uma seção vazia é pior que a ausência dela.
 *
 * Os depoimentos da §13.1 (item 7) ficam de fora por decisão consciente: a §13.1
 * exige depoimento **real, com nome e tipo de evento**, e não há onde guardá-los
 * (§8 não tem o modelo). Inventar seria o único jeito de a seção existir hoje.
 *
 * Cada seção busca o que precisa por hook próprio, em paralelo: só o hero depende
 * de `venue` para renderizar, e o resto aparece conforme chega.
 */
export function LandingPage() {
  const venue = useVenue();
  const gallery = useGallery();
  const themes = useThemes();
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
  const events = images.filter((image) => image.kind === 'EVENTS');

  return (
    <>
      <HeroSection venue={venue.data} hero={hero} />
      <VenueSection venue={venue.data} areas={areas} />
      <GallerySection images={events} />
      <HowItWorksSection />
      <ThemesSection themes={themes.data ?? []} />
      <CombosSection combos={combos.data ?? []} />
      <FaqSection venue={venue.data} />
      <DirectionsSection venue={venue.data} />
    </>
  );
}
