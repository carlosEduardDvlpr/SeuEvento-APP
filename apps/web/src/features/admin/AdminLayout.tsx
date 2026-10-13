import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  ArchMarkIcon,
  BoxIcon,
  CalendarIcon,
  GearIcon,
  GridIcon,
  ImageIcon,
  MenuIcon,
  MoneyIcon,
  PaletteIcon,
  TagIcon,
  UsersIcon,
} from '@/components/icons';
import styles from './AdminLayout.module.css';

/**
 * Casca do painel (§13).
 *
 * A navegação é lateral no desktop e abre por botão no celular, porque a §13 pede
 * que o dono opere o dia a dia pelo telefone. Os itens são as seções da §13 —
 * incluindo as que ainda não existem, que levam à página de "em construção": uma
 * lacuna visível é mais honesta que um menu que cresce a cada entrega e esconde o
 * que falta.
 */

type NavItem = {
  to: string;
  label: string;
  Icon: typeof GridIcon;
};

const NAV_ITEMS: NavItem[] = [
  { to: '/admin', label: 'Visão geral', Icon: GridIcon },
  { to: '/admin/calendario', label: 'Calendário', Icon: CalendarIcon },
  { to: '/admin/reservas', label: 'Reservas', Icon: ArchMarkIcon },
  { to: '/admin/itens', label: 'Itens', Icon: BoxIcon },
  { to: '/admin/categorias', label: 'Categorias', Icon: GridIcon },
  { to: '/admin/combos', label: 'Combos', Icon: TagIcon },
  { to: '/admin/temas', label: 'Estilos', Icon: PaletteIcon },
  { to: '/admin/precos', label: 'Preços', Icon: MoneyIcon },
  { to: '/admin/galeria', label: 'Galeria', Icon: ImageIcon },
  { to: '/admin/clientes', label: 'Clientes', Icon: UsersIcon },
  { to: '/admin/configuracoes', label: 'Configurações', Icon: GearIcon },
];

export function AdminLayout() {
  const { user, signOut } = useAuth();
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <button
          type="button"
          className={styles.menuButton}
          onClick={() => setNavOpen((open) => !open)}
          aria-expanded={navOpen}
          aria-controls="admin-nav"
        >
          <MenuIcon />
          Menu
        </button>

        <Link to="/admin" className={styles.brand}>
          <ArchMarkIcon size={20} />
          Painel da chácara
        </Link>

        <div className={styles.topbarEnd}>
          {/* Ver o site é o caminho de volta mais pedido de dentro do painel. */}
          <Link to="/" className={styles.topbarLink}>
            Ver o site
          </Link>
          <button type="button" className={styles.topbarLink} onClick={signOut}>
            Sair
          </button>
        </div>
      </header>

      <div className={styles.body}>
        <nav
          id="admin-nav"
          className={[styles.nav, navOpen ? styles.navOpen : null].filter(Boolean).join(' ')}
          aria-label="Seções do painel"
        >
          <ul className={styles.navList}>
            {NAV_ITEMS.map(({ to, label, Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  // `end` só na raiz: sem isso "Visão geral" ficaria ativa em tudo.
                  end={to === '/admin'}
                  className={({ isActive }) =>
                    [styles.navLink, isActive ? styles.navLinkActive : null]
                      .filter(Boolean)
                      .join(' ')
                  }
                  onClick={() => setNavOpen(false)}
                >
                  <Icon size={20} />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>

          {user ? <p className={styles.navUser}>Você está como {user.name}.</p> : null}
        </nav>

        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
