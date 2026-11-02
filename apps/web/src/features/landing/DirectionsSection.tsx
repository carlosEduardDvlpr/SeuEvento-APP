import type { PublicVenue } from '@chacara/shared';
import { Link } from 'react-router';
import { CalendarIcon, PinIcon, WhatsAppIcon } from '@/components/icons';
import { whatsappUrl } from '@/lib/whatsapp';
import landing from './landing.module.css';
import { revealOnScroll } from './reveal';
import styles from './DirectionsSection.module.css';

/**
 * Como chegar (§13.1, item 9).
 *
 * Endereço, o mapa e o botão de WhatsApp. O mapa embutido entrou em outubro de
 * 2026, a pedido do dono; a especificação original pedia só o link, pelo peso do
 * iframe. Dois cuidados seguram esse peso: `loading="lazy"` (a seção é a última
 * da página, então o iframe só carrega quando a pessoa chega perto) e nenhum
 * script nosso.
 *
 * Desde novembro de 2026 o mapa é a ficha da Donna Belle no Google, e não mais
 * a busca pelo endereço cadastrado: a ficha tem o pino no lugar certo e o nome
 * do espaço. Com ela saiu o link "Abrir no mapa", porque a própria ficha já leva
 * ao Google Maps. O `mapsUrl` continua no cadastro e na API, sem uso aqui.
 *
 * Sem endereço nem WhatsApp cadastrados, a seção não aparece: um "como chegar"
 * vazio é pior que nenhum (§16.6). Sem endereço, o mapa também não aparece.
 */

/**
 * Incorporação da ficha no Google Maps (Compartilhar › Incorporar um mapa). É
 * fixa porque aponta para o lugar, e não para um texto de endereço: trocar o
 * endereço no painel não move o pino. Se o espaço mudar de lugar, é aqui.
 */
const MAP_EMBED_URL =
  'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3671.654059627431!2d-46.53414819999999!3d-23.0364708!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x94cec79c8e7b457f%3A0x64b9412fe70ec5f1!2sDonna%20Belle%20Espa%C3%A7o%20de%20Eventos%20e%20Decora%C3%A7%C3%B5es!5e0!3m2!1spt-BR!2sbr!4v1793115202947!5m2!1spt-BR!2sbr';

export type DirectionsSectionProps = {
  venue: PublicVenue;
};

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
              src={MAP_EMBED_URL}
              loading="lazy"
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
