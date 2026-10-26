import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  BoxIcon,
  CalendarIcon,
  GearIcon,
  GridIcon,
  HexMarkIcon,
  ImageIcon,
  ListIcon,
  MenuIcon,
  MoneyIcon,
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
 *
 * Combos e Estilos saíram do menu a pedido do dono, que não vai usá-los por
 * enquanto. As telas continuam funcionando em `/admin/combos` e `/admin/temas`,
 * e o que já está cadastrado continua valendo no site.
 */

type NavItem = {
  to: string;
  label: string;
  Icon: typeof GridIcon;
};

const NAV_ITEMS: NavItem[] = [
  { to: '/admin', label: 'Visão geral', Icon: GridIcon },
  { to: '/admin/calendario', label: 'Calendário', Icon: CalendarIcon },
  { to: '/admin/reservas', label: 'Reservas', Icon: ListIcon },
  { to: '/admin/itens', label: 'Itens', Icon: BoxIcon },
  { to: '/admin/categorias', label: 'Categorias', Icon: GridIcon },
  { to: '/admin/precos', label: 'Preços', Icon: MoneyIcon },
  { to: '/admin/galeria', label: 'Galeria', Icon: ImageIcon },
  { to: '/admin/clientes', label: 'Clientes', Icon: UsersIcon },
  { to: '/admin/configuracoes', label: 'Configurações', Icon: GearIcon },
];

export function AdminLayout() {
  const { user, signOut } = useAuth();
  const [navOpen, setNavOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  /*
   * Escape fecha a gaveta do celular (§18.1).
   *
   * O foco volta para o botão de menu, e isso não é enfeite: a gaveta fechada é
   * `display: none`, então o foco que estava num link dela iria para o `<body>`
   * e quem navega por teclado recomeçaria do topo da página.
   *
   * O ouvinte só existe enquanto a gaveta está aberta.
   */
  useEffect(() => {
    if (!navOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;

      setNavOpen(false);
      menuButtonRef.current?.focus();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [navOpen]);

  return (
    <div className={styles.shell}>
      {/*
        O painel também precisa do atalho (§18.1): sem ele, cada troca de página
        obriga a passar pelos 3 controles da topbar e pelos 9 itens do menu
        antes de chegar ao conteúdo.
      */}
      <a className="skip-link" href="#admin-conteudo">
        Ir para o conteúdo
      </a>

      <header className={styles.topbar}>
        <button
          type="button"
          ref={menuButtonRef}
          className={styles.menuButton}
          onClick={() => setNavOpen((open) => !open)}
          aria-expanded={navOpen}
          aria-controls="admin-nav"
        >
          <MenuIcon />
          Menu
        </button>

        <Link to="/admin" className={styles.brand}>
          <HexMarkIcon size={20} />
          {/*
            O rótulo some no celular (ver o CSS): com o botão de menu na tela,
            quatro controles não cabem em 375 px e o "Ver o site" quebrava em
            três linhas. O ícone continua levando para a visão geral.
          */}
          <span>Painel da chácara</span>
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

        <main className={styles.main} id="admin-conteudo">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
