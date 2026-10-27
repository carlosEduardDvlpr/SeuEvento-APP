import type { PublicVenue } from '@chacara/shared';
import { Link } from 'react-router';
import { CalendarIcon, MapIcon, PinIcon, WhatsAppIcon } from '@/components/icons';
import { whatsappUrl } from '@/lib/whatsapp';
import landing from './landing.module.css';
import { revealOnScroll } from './reveal';
import styles from './DirectionsSection.module.css';

/**
 * Como chegar (§13.1, item 9).
 *
 * Endereço, o mapa da região, o link para abrir no aplicativo de mapas e o botão
 * de WhatsApp. O mapa embutido entrou em outubro de 2026, a pedido do dono; a
 * especificação original pedia só o link, pelo peso do iframe. Dois cuidados
 * seguram esse peso: `loading="lazy"` (a seção é a última da página, então o
 * iframe só carrega quando a pessoa chega perto) e nenhum script nosso.
 *
 * O mapa sai do **endereço** cadastrado, pela busca do Google Maps em modo de
 * incorporação, que dispensa chave de API. O link "Abrir no mapa" continua sendo
 * o `mapsUrl` que o dono cadastrou, que pode apontar para a ficha do lugar.
 *
 * Sem endereço nem WhatsApp cadastrados, a seção não aparece: um "como chegar"
 * vazio é pior que nenhum (§16.6).
 */

export type DirectionsSectionProps = {
  venue: PublicVenue;
};

/** O endereço no mapa incorporável do Google, em português e na altura da rua. */
function mapEmbedUrl(address: string): string {
  const params = new URLSearchParams({ q: address, hl: 'pt-BR', z: '16', output: 'embed' });
  return `https://maps.google.com/maps?${params.toString()}`;
}

export function DirectionsSection({ venue }: DirectionsSectionProps) {
  if (!venue.address && !venue.whatsapp) return null;

  return (
    <section className={landing.section} aria-labelledby="titulo-como-chegar">
      <div className={[landing.inner, styles.layout].join(' ')}>
        <div className={styles.info} ref={revealOnScroll}>
          <div className={landing.heading}>
            <h2 className={landing.title} id="titulo-como-chegar">
              Como chegar
            </h2>
          </div>

          {venue.address ? (
            <p className={styles.address}>
              <span className={styles.addressIcon}>
                <PinIcon size={20} />
              </span>
              <span>{venue.address}</span>
            </p>
          ) : null}

          {/* Os ícones são decorativos: o nome de cada ação é o texto do botão. */}
          <div className={styles.actions}>
            {venue.mapsUrl ? (
              <a
                className={landing.secondaryAction}
                href={venue.mapsUrl}
                target="_blank"
                rel="noreferrer"
              >
                <MapIcon size={20} />
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
                <WhatsAppIcon size={20} />
                Falar pelo WhatsApp
              </a>
            ) : null}

            <Link className={landing.action} to="/reservar">
              <CalendarIcon size={20} />
              Ver datas livres
            </Link>
          </div>
        </div>

        {venue.address ? (
          <div className={styles.map} ref={revealOnScroll}>
            <iframe
              title={`Mapa com a localização de ${venue.name}`}
              src={mapEmbedUrl(venue.address)}
              loading="lazy"
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
