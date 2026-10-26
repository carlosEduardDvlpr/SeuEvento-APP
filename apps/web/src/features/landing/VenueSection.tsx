import type { GalleryImage, PublicVenue } from '@chacara/shared';
import { CalendarIcon, ClockIcon, ImageIcon, PinIcon, UsersIcon } from '@/components/icons';
import landing from './landing.module.css';
import styles from './VenueSection.module.css';

/**
 * A chácara (§13.1, item 2).
 *
 * O tour por áreas sai das fotos marcadas como "A chácara" na galeria: o `alt` é
 * o nome da área e a `caption` são as duas linhas que a §13.1 pede. Isso é de
 * propósito — assim o dono descreve as áreas que **existem de verdade** pelo
 * painel, sem ninguém mexer em código, e nós não inventamos "salão de festas"
 * para uma chácara que não tem um (§16.6). A ordem do tour é a da galeria.
 *
 * O bloco de fatos lê `VenueSettings`, então capacidade, horário e endereço na
 * landing nunca divergem do que o sistema aceita.
 */

export type VenueSectionProps = {
  venue: PublicVenue;
  areas: GalleryImage[];
};

type Fact = {
  icon: typeof UsersIcon;
  label: string;
  value: string;
  /** Ocupa a linha inteira do bloco: o endereço não cabe numa coluna. */
  wide?: boolean;
};

export function VenueSection({ venue, areas }: VenueSectionProps) {
  const facts: Fact[] = [
    { icon: UsersIcon, label: 'Cabem até', value: `${venue.maxGuests} pessoas` },
    {
      icon: ClockIcon,
      label: 'Entrada e saída',
      value: `${venue.checkInTime} às ${venue.checkOutTime}`,
    },
    {
      icon: CalendarIcon,
      label: 'Período',
      value:
        venue.minDays === venue.maxDays
          ? `${venue.maxDays} ${venue.maxDays === 1 ? 'dia' : 'dias'}`
          : `de ${venue.minDays} a ${venue.maxDays} dias`,
    },
  ];

  // §13.1: o endereço entra no bloco de fatos, e não solto no fim da seção.
  if (venue.address) {
    facts.push({ icon: PinIcon, label: 'Endereço', value: venue.address, wide: true });
  }

  return (
    <section
      className={[landing.section, landing.sectionAlt].join(' ')}
      aria-labelledby="titulo-chacara"
    >
      <div className={landing.inner}>
        <div className={landing.heading}>
          <h2 className={landing.title} id="titulo-chacara">
            A chácara
          </h2>
        </div>

        {/* §14.12: bloco de fatos sem cara de planilha. */}
        <dl className={[landing.body, styles.facts].join(' ')}>
          {facts.map(({ icon: FactIcon, label, value, wide }) => (
            <div
              className={[styles.fact, wide && styles.factWide].filter(Boolean).join(' ')}
              key={label}
            >
              <FactIcon size={22} />
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        {areas.length > 0 ? (
          <ul className={styles.areas}>
            {areas.map((area) => (
              <li key={area.id} className={styles.area}>
                {/*
                  `alt=""` de propósito: o `alt` cadastrado é o nome da área, e
                  ele já aparece no `h3` logo abaixo. Repeti-lo na foto faria o
                  leitor de tela anunciar o mesmo nome duas vezes (§18.1) — aqui
                  a imagem ilustra o bloco que o título nomeia.
                */}
                <div className={styles.areaPhoto}>
                  {area.url ? (
                    <img src={area.url} alt="" loading="lazy" decoding="async" />
                  ) : (
                    <ImageIcon size={32} />
                  )}
                </div>

                <h3 className={styles.areaTitle}>{area.alt}</h3>
                {area.caption ? <p className={styles.areaText}>{area.caption}</p> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
