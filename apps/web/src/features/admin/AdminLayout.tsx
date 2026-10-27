import { useState } from 'react';
import { type Location, Link, NavLink, Outlet, useLocation } from 'react-router';
import { Drawer } from '@/components/Drawer';
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
 * No celular, as seções abrem numa gaveta pela esquerda, por cima da tela (a
 * mesma `components/Drawer` do menu do site), do lado do botão "Menu". Antes o
 * menu entrava no meio da página e empurrava o conteúdo para baixo. A gaveta
 * prende o foco, fecha com Escape ou pelo fundo e devolve o foco ao botão.
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

/** As seções do painel: a mesma lista na lateral do desktop e na gaveta do celular. */
function SectionLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <ul className={styles.navList}>
      {NAV_ITEMS.map(({ to, label, Icon }) => (
        <li key={to}>
          <NavLink
            to={to}
            // `end` só na raiz: sem isso "Visão geral" ficaria ativa em tudo.
            end={to === '/admin'}
            className={({ isActive }) =>
              [styles.navLink, isActive ? styles.navLinkActive : null].filter(Boolean).join(' ')
            }
            onClick={onNavigate}
          >
            <Icon size={20} />
            {label}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

export function AdminLayout() {
  const { user, signOut } = useAuth();
  const location = useLocation();

  /*
   * A gaveta guarda a página em que foi aberta, e só fica aberta nela: trocar de
   * página com ela aberta (o voltar do navegador, por exemplo) a fecha. A
   * comparação é com o objeto da localização, e não com a `key`: cada navegação
   * cria um objeto novo, inclusive a volta à mesma entrada do histórico, então
   * avançar de novo até a página não reabre a gaveta.
   */
  const [menuOpenFor, setMenuOpenFor] = useState<Location | null>(null);
  const menuOpen = menuOpenFor === location;

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
          className={styles.menuButton}
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpenFor(location)}
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
        {/* Desktop: a lateral fixa. O CSS a esconde no celular, onde quem leva às seções é a gaveta. */}
        <nav className={styles.nav} aria-label="Seções do painel">
          <SectionLinks />

          {user ? <p className={styles.navUser}>Você está como {user.name}.</p> : null}
        </nav>

        <main className={styles.main} id="admin-conteudo">
          <Outlet />
        </main>
      </div>

      {menuOpen ? (
        <Drawer
          side="left"
          title="Menu"
          closeLabel="Fechar o menu"
          className={styles.drawer}
          onClose={() => setMenuOpenFor(null)}
        >
          {(close) => (
            <>
              <nav className={styles.drawerNav} aria-label="Seções do painel">
                <SectionLinks onNavigate={close} />
              </nav>

              {user ? <p className={styles.drawerUser}>Você está como {user.name}.</p> : null}
            </>
          )}
        </Drawer>
      ) : null}
    </div>
  );
}
