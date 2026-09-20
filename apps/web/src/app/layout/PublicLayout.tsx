import { Link, NavLink, Outlet } from 'react-router';
import { ArchMarkIcon } from '@/components/icons';
import { useVenue } from '@/api/venue';
import styles from './PublicLayout.module.css';

/**
 * Cabeçalho fixo e discreto (§13.1): logo, "Reservar" como ação principal e
 * "Entrar". No celular o botão "Reservar" fica sempre acessível.
 */
export function PublicLayout() {
  const { data: venue } = useVenue();

  return (
    <>
      <a className="skip-link" href="#conteudo">
        Ir para o conteúdo
      </a>

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link to="/" className={styles.logo}>
            <ArchMarkIcon size={28} />
            <span>{venue?.name ?? 'Chácara'}</span>
          </Link>

          <nav className={styles.nav} aria-label="Navegação principal">
            <NavLink to="/reservar" className={styles.navLink}>
              Reservar
            </NavLink>
            <NavLink to="/entrar" className={styles.navLink}>
              Entrar
            </NavLink>
          </nav>
        </div>
      </header>

      <main id="conteudo">
        <Outlet />
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <p className={styles.footerBrand}>{venue?.name ?? 'Chácara'}</p>

          <nav aria-label="Rodapé" className={styles.footerNav}>
            <Link to="/termos">Termos de uso</Link>
            <Link to="/privacidade">Política de privacidade</Link>
          </nav>
        </div>
      </footer>
    </>
  );
}
