import type { SessionResponse, SessionUser } from '@chacara/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  clearAccessToken,
  endSession,
  refreshSession,
  setSessionExpiredHandler,
  storeSession,
} from './session';

/**
 * Sessão no SPA (§10.4 e §12.2).
 *
 * Três estados, e a diferença entre os dois primeiros importa: enquanto a
 * renovação inicial não responde, não se sabe se há sessão. Tratar "carregando"
 * como "anônimo" faria a tela de login piscar em toda recarga de quem está logado.
 */
export type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

type AuthContextValue = {
  status: AuthStatus;
  user: SessionUser | null;
  /** Guarda a sessão devolvida por login, cadastro confirmado ou Google. */
  signIn: (session: SessionResponse) => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);

  const forgetSession = useCallback(() => {
    clearAccessToken();
    setUser(null);
    setStatus('anonymous');
  }, []);

  // O cliente HTTP já sabe ler o token e renovar (ligado no módulo de sessão).
  // O que falta é quem reage à sessão acabar, que é este componente.
  useEffect(() => {
    setSessionExpiredHandler(forgetSession);
  }, [forgetSession]);

  /*
   * Ao carregar, tenta renovar pelo cookie (§10.4).
   *
   * Em desenvolvimento o StrictMode executa este efeito duas vezes. O módulo de
   * sessão compartilha a renovação em voo, então as duas chamadas viram uma — o
   * que evita a segunda parecer reuso de token e derrubar a sessão.
   */
  useEffect(() => {
    let active = true;

    void refreshSession().then((renewed) => {
      if (!active) return;

      setUser(renewed);
      setStatus(renewed ? 'authenticated' : 'anonymous');
    });

    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback((session: SessionResponse) => {
    setUser(storeSession(session));
    setStatus('authenticated');
  }, []);

  const signOut = useCallback(async () => {
    await endSession();
    setUser(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, signIn, signOut }),
    [status, user, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth precisa estar dentro de <AuthProvider>.');
  return context;
}
