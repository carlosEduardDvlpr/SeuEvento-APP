import { Link } from 'react-router';
import { BoxIcon, ImageIcon, PaletteIcon, TagIcon } from '@/components/icons';
import { useVenue } from '@/api/venue';
import styles from './admin.module.css';
import dashboardStyles from './DashboardPage.module.css';

/**
 * Visão geral (§13).
 *
 * Por enquanto é um ponto de partida: as caixas levam ao que já existe, e o
 * resumo do dia a dia (próximas reservas, pedidos aguardando) entra quando a
 * Fase 5 trouxer as reservas. Mostrar caixas vazias agora só ensinaria o dono a
 * ignorar esta tela.
 */

const SHORTCUTS = [
  {
    to: '/admin/itens',
    label: 'Itens',
    description: 'O que o cliente pode levar no pegue e monte, com preço e estoque.',
    Icon: BoxIcon,
  },
  {
    to: '/admin/combos',
    label: 'Combos',
    description: 'Conjuntos com desconto, para incentivar o pedido maior.',
    Icon: TagIcon,
  },
  {
    to: '/admin/temas',
    label: 'Estilos',
    description: 'As linhas estéticas que organizam a vitrine.',
    Icon: PaletteIcon,
  },
  {
    to: '/admin/galeria',
    label: 'Galeria',
    description: 'As fotos da landing. É o que faz a pessoa se imaginar na festa.',
    Icon: ImageIcon,
  },
];

export function DashboardPage() {
  const venue = useVenue();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>{venue.data?.name ?? 'Painel da chácara'}</h1>
          <p className={styles.subtitle}>
            Daqui você muda preço, foto e item sem depender de ninguém. O calendário e as reservas
            entram nas próximas entregas.
          </p>
        </div>
      </header>

      <ul className={dashboardStyles.grid}>
        {SHORTCUTS.map(({ to, label, description, Icon }) => (
          <li key={to}>
            <Link to={to} className={dashboardStyles.card}>
              <span className={dashboardStyles.icon}>
                <Icon size={28} />
              </span>
              <span className={dashboardStyles.cardTitle}>{label}</span>
              <span className={dashboardStyles.cardText}>{description}</span>
            </Link>
          </li>
        ))}
      </ul>

      {venue.data ? (
        <section className={dashboardStyles.facts}>
          <h2 className={dashboardStyles.factsTitle}>Como a chácara está configurada</h2>
          <dl className={dashboardStyles.factsList}>
            <div>
              <dt>Capacidade</dt>
              <dd>{venue.data.maxGuests} convidados</dd>
            </div>
            <div>
              <dt>Horário</dt>
              <dd>
                {venue.data.checkInTime} às {venue.data.checkOutTime}
              </dd>
            </div>
            <div>
              <dt>Duração</dt>
              <dd>
                {venue.data.minDays} a {venue.data.maxDays} dias
              </dd>
            </div>
            <div>
              <dt>Antecedência mínima</dt>
              <dd>{venue.data.minLeadDays} dias</dd>
            </div>
            <div>
              <dt>Prazo do pedido</dt>
              <dd>{venue.data.holdHours} horas</dd>
            </div>
            <div>
              <dt>Cancelamento pelo cliente</dt>
              <dd>até {venue.data.freeCancelUntilDays} dias antes</dd>
            </div>
          </dl>
        </section>
      ) : null}
    </div>
  );
}
