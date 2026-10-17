import type { PublicVenue } from '@chacara/shared';
import { Link } from 'react-router';
import { PinIcon } from '@/components/icons';
import { whatsappUrl } from '@/lib/whatsapp';
import landing from './landing.module.css';
import styles from './DirectionsSection.module.css';

/**
 * Como chegar (§13.1, item 9).
 *
 * Endereço, link para o mapa e botão de WhatsApp. **Link, não embed**: a §13.1 é
 * explícita, e o iframe do Maps custa centenas de quilobytes e um bom pedaço do
 * LCP numa página que a §18.2 quer leve.
 *
 * Sem endereço nem WhatsApp cadastrados, a seção não aparece: um "como chegar"
 * vazio é pior que nenhum (§16.6).
 */

export type DirectionsSectionProps = {
  venue: PublicVenue;
};

export function DirectionsSection({ venue }: DirectionsSectionProps) {
  if (!venue.address && !venue.whatsapp) return null;

  return (
    <section
      className={[landing.section, landing.sectionAlt].join(' ')}
      aria-labelledby="titulo-como-chegar"
    >
      <div className={landing.inner}>
        <div className={landing.heading}>
          <h2 className={landing.title} id="titulo-como-chegar">
            Como chegar
          </h2>
        </div>

        <div className={[landing.body, styles.content].join(' ')}>
          {venue.address ? (
            <p className={styles.address}>
              <PinIcon size={22} />
              <span>{venue.address}</span>
            </p>
          ) : null}

          <div className={styles.actions}>
            {venue.mapsUrl ? (
              <a
                className={landing.secondaryAction}
                href={venue.mapsUrl}
                target="_blank"
                rel="noreferrer"
              >
                Abrir no mapa
              </a>
            ) : null}

            {venue.whatsapp ? (
              <a
                className={landing.secondaryAction}
                href={whatsappUrl(venue.whatsapp, 'Olá! Queria saber mais sobre alugar a chácara.')}
                target="_blank"
                rel="noreferrer"
              >
                Falar pelo WhatsApp
              </a>
            ) : null}

            <Link className={landing.action} to="/reservar">
              Ver datas livres
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
