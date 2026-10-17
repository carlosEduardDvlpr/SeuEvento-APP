import type { GalleryImage, PublicVenue } from '@chacara/shared';
import { CalendarIcon, ClockIcon, ImageIcon, UsersIcon } from '@/components/icons';
import landing from './landing.module.css';
import styles from './VenueSection.module.css';

/**
 * A chácara (§13.1, item 2).
 *
 * O tour por áreas sai das fotos marcadas como "A chácara" na galeria: o `alt` é
 * o nome da área e a `caption` são as duas linhas que a §13.1 pede. Isso é de
 * propósito — assim o dono descreve as áreas que **existem de verdade** pelo
 * painel, sem ninguém mexer em código, e nós não inventamos "salão de festas"
 * para uma chácara que não tem um (§16.6).
 *
 * O bloco de fatos lê `VenueSettings`, então capacidade e horário na landing
 * nunca divergem do que o sistema aceita.
 */

export type VenueSectionProps = {
  venue: PublicVenue;
  areas: GalleryImage[];
};

export function VenueSection({ venue, areas }: VenueSectionProps) {
  const facts = [
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
          <p className={landing.lead}>
            O espaço é seu pelo dia inteiro: você chega, monta e recebe quem quiser.
          </p>
        </div>

        {/* §14.12: bloco de fatos sem cara de planilha. */}
        <dl className={[landing.body, styles.facts].join(' ')}>
          {facts.map(({ icon: FactIcon, label, value }) => (
            <div className={styles.fact} key={label}>
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
                <div className={styles.areaPhoto}>
                  {area.url ? (
                    <img src={area.url} alt={area.alt} loading="lazy" decoding="async" />
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

        {venue.address ? <p className={styles.address}>{venue.address}</p> : null}
      </div>
    </section>
  );
}
