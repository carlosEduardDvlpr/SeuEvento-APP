import { screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequireAuth, RequireRole } from '@/app/guards';
import { errorResponse, jsonResponse, renderWithProviders } from '../../../test/helpers/render';
import { useAuth } from './AuthProvider';

function session(role: 'CLIENT' | 'ADMIN' = 'CLIENT') {
  return {
    accessToken: 'jwt-de-acesso',
    user: {
      id: 'u1',
      name: 'Ana Beatriz',
      email: 'ana@exemplo.com',
      phone: '11999990000',
      role,
      emailVerified: true,
    },
  };
}

/** Deixa a renovação pendurada, para o estado "carregando" poder ser observado. */
function pendingRefresh() {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>(() => {})),
  );
}

function StatusProbe() {
  const { status, user } = useAuth();
  return <p data-testid="status">{`${status}:${user?.name ?? '-'}`}</p>;
}

describe('AuthProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('tenta renovar a sessão ao carregar (§10.4)', async () => {
    const fetchMock = vi.fn((_url: string) => Promise.resolve(jsonResponse(session())));
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<StatusProbe />);

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated:Ana Beatriz'),
    );
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/refresh');
  });

  it('fica anônimo quando não há sessão para renovar', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(errorResponse(401, 'UNAUTHORIZED', 'Sua sessão expirou.'))),
    );

    renderWithProviders(<StatusProbe />);

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous:-'));
  });

  /*
   * A distinção que evita o pisca-pisca: enquanto a renovação não responde, não se
   * sabe se há sessão. Tratar isso como "anônimo" mandaria quem está logado para a
   * tela de entrada em toda recarga.
   */
  it('começa em carregando, não em anônimo', () => {
    pendingRefresh();

    renderWithProviders(<StatusProbe />);

    expect(screen.getByTestId('status')).toHaveTextContent('loading:-');
  });
});

describe('RequireAuth', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function renderGuarded(route = '/minhas-reservas') {
    return renderWithProviders(
      <Routes>
        <Route element={<RequireAuth />}>
          <Route path="/minhas-reservas" element={<p>Conteúdo protegido</p>} />
        </Route>
        <Route path="/entrar" element={<p>Tela de entrada</p>} />
      </Routes>,
      { route },
    );
  }

  it('espera a renovação em vez de redirecionar', () => {
    pendingRefresh();

    renderGuarded();

    expect(screen.getByRole('status')).toHaveTextContent('Carregando sua conta');
    expect(screen.queryByText('Tela de entrada')).not.toBeInTheDocument();
  });

  it('libera quem tem sessão', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(session()))),
    );

    renderGuarded();

    expect(await screen.findByText('Conteúdo protegido')).toBeInTheDocument();
  });

  it('manda para a entrada quem não tem sessão', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(errorResponse(401, 'UNAUTHORIZED', 'Sua sessão expirou.'))),
    );

    renderGuarded();

    expect(await screen.findByText('Tela de entrada')).toBeInTheDocument();
  });
});

describe('RequireRole', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function renderAdminArea() {
    return renderWithProviders(
      <Routes>
        <Route element={<RequireRole role="ADMIN" />}>
          <Route path="/admin" element={<p>Painel da chácara</p>} />
        </Route>
        <Route path="/" element={<p>Página inicial</p>} />
        <Route path="/entrar" element={<p>Tela de entrada</p>} />
      </Routes>,
      { route: '/admin' },
    );
  }

  it('libera quem tem o papel', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(session('ADMIN')))),
    );

    renderAdminArea();

    expect(await screen.findByText('Painel da chácara')).toBeInTheDocument();
  });

  // Entrar de novo não resolveria, e um 403 na cara não diz o que fazer.
  it('manda para a home quem está logado sem o papel', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(session('CLIENT')))),
    );

    renderAdminArea();

    expect(await screen.findByText('Página inicial')).toBeInTheDocument();
  });

  it('manda para a entrada quem não tem sessão', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(errorResponse(401, 'UNAUTHORIZED', 'Sua sessão expirou.'))),
    );

    renderAdminArea();

    expect(await screen.findByText('Tela de entrada')).toBeInTheDocument();
  });
});
