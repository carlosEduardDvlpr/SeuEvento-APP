import { Link } from 'react-router';
import { useVenue } from '@/api/venue';
import { ArchFrame } from '@/components/ArchFrame';
import { CalendarIcon, ClockIcon, UsersIcon } from '@/components/icons';
import styles from './LandingPage.module.css';

/**
 * Landing (§13.1).
 *
 * Nesta etapa existe o hero e o bloco de fatos, os dois lendo dados reais do
 * banco. O tour pela chácara, a galeria, os estilos, os combos, o FAQ e o "como
 * chegar" entram junto com as fotos e a copy aprovada pelo dono.
 */
export function LandingPage() {
  const { data: venue, isPending, isError, error } = useVenue();

  if (isPending) {
    return (
      <section className={styles.state} aria-busy="true">
        <p>Carregando as informações da chácara…</p>
      </section>
    );
  }

  if (isError) {
    return (
      <section className={styles.state}>
        <h1>Não conseguimos carregar a página</h1>
        <p>{error.message}</p>
      </section>
    );
  }

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
    <>
      <section className={styles.hero}>
        <div className={styles.heroText}>
          <h1>Sua festa no nosso quintal</h1>
          <p className={styles.heroLead}>
            Alugue a chácara por dia e monte a decoração você mesmo, escolhendo os itens do estilo
            que combina com a sua festa.
          </p>

          <Link to="/reservar" className={styles.heroAction}>
            Ver datas livres
          </Link>

          <p className={styles.heroNote}>
            As datas ficam seguras por até {venue.holdHours} horas enquanto a chácara confirma.
          </p>
        </div>

        {/* Sem foto real ainda: a §14.9 pede bloco de cor, nunca banco de imagens. */}
        <ArchFrame className={styles.heroImage} />
      </section>

      <section className={styles.facts} aria-labelledby="titulo-fatos">
        <h2 id="titulo-fatos">A chácara</h2>

        <dl className={styles.factList}>
          {facts.map(({ icon: FactIcon, label, value }) => (
            <div className={styles.fact} key={label}>
              <FactIcon size={22} />
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        {venue.address ? <p className={styles.address}>{venue.address}</p> : null}

        {venue.houseRules ? (
          <div className={styles.rules}>
            <h3>Regras da casa</h3>
            <p>{venue.houseRules}</p>
          </div>
        ) : null}
      </section>
    </>
  );
}
