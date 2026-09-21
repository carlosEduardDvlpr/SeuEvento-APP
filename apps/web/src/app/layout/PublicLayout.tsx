import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { useVenue } from '@/api/venue';
import { ArchMarkIcon } from '@/components/icons';
import { useAuth } from '@/features/auth/AuthProvider';
import styles from './PublicLayout.module.css';

/**
 * Cabeçalho fixo e discreto (§13.1): logo, "Reservar" como ação principal e a
 * entrada da conta. No celular o botão "Reservar" fica sempre acessível.
 */
export function PublicLayout() {
  const { data: venue } = useVenue();
  const { status, user, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate('/', { replace: true });
  }

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

            {/*
              Enquanto a sessão carrega, nenhuma das duas opções aparece: mostrar
              "Entrar" e depois trocar por "Minhas reservas" faria o cabeçalho
              piscar em toda recarga de quem está logado (§10.4).
            */}
            {status === 'authenticated' ? (
              <>
                <NavLink to="/minhas-reservas" className={styles.navLink}>
                  Minhas reservas
                </NavLink>
                <button type="button" className={styles.navLink} onClick={handleSignOut}>
                  Sair
                </button>
              </>
            ) : null}

            {status === 'anonymous' ? (
              <NavLink to="/entrar" className={styles.navLink}>
                Entrar
              </NavLink>
            ) : null}
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

          {/* Redação neutra: o cadastro não pergunta gênero. */}
          {user ? <p className={styles.footerUser}>Você entrou como {user.name}.</p> : null}
        </div>
      </footer>
    </>
  );
}
