import type { Role } from '@chacara/shared';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '@/features/auth/AuthProvider';
import styles from './guards.module.css';

/**
 * Guardas de rota (§12.1).
 *
 * Enquanto a sessão está sendo renovada, mostra um aviso de carregamento em vez
 * de redirecionar: tratar "carregando" como "anônimo" mandaria para a tela de
 * entrada quem já está logado, em toda recarga de página.
 */
function SessionLoading() {
  return (
    <p className={styles.loading} role="status">
      Carregando sua conta…
    </p>
  );
}

function useSignInRedirect() {
  const location = useLocation();
  // `next` traz a pessoa de volta ao que ela queria depois de entrar.
  const next = encodeURIComponent(`${location.pathname}${location.search}`);
  return `/entrar?next=${next}`;
}

export function RequireAuth() {
  const { status } = useAuth();
  const signInPath = useSignInRedirect();

  if (status === 'loading') return <SessionLoading />;
  if (status === 'anonymous') return <Navigate to={signInPath} replace />;

  return <Outlet />;
}

export function RequireRole({ role }: { role: Role }) {
  const { status, user } = useAuth();
  const signInPath = useSignInRedirect();

  if (status === 'loading') return <SessionLoading />;
  if (status === 'anonymous') return <Navigate to={signInPath} replace />;

  // Logado sem o papel vai para a home, não para a tela de entrada: entrar de
  // novo não resolveria, e um 403 na cara não diz o que fazer.
  if (user?.role !== role) return <Navigate to="/" replace />;

  return <Outlet />;
}
