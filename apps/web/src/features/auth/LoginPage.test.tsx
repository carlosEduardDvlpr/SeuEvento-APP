import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorResponse, jsonResponse, renderWithProviders } from '../../../test/helpers/render';
import { LoginPage } from './LoginPage';

const SESSION = {
  accessToken: 'jwt-de-acesso',
  user: {
    id: 'u1',
    name: 'Ana Beatriz',
    email: 'ana@exemplo.com',
    phone: '11999990000',
    role: 'CLIENT',
    emailVerified: true,
  },
};

/**
 * O provider chama `POST /auth/refresh` ao montar. Cada teste responde a essa
 * primeira chamada com 401 (visitante anônimo) e só depois encena o login.
 */
function stubFetch(handlers: Record<string, () => Response>) {
  const calls: string[] = [];

  const fetchMock = vi.fn((url: string, _init?: { body?: unknown }) => {
    calls.push(url);
    const handler = handlers[url];
    if (handler) return Promise.resolve(handler());
    return Promise.resolve(errorResponse(401, 'UNAUTHORIZED', 'Sua sessão expirou.'));
  });

  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, calls };
}

describe('LoginPage', () => {
  beforeEach(() => {
    stubFetch({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mostra rótulo visível e autocomplete correto (§14.11)', async () => {
    renderWithProviders(<LoginPage />, { route: '/entrar' });

    const email = await screen.findByLabelText('E-mail');
    const password = screen.getByLabelText('Senha');

    expect(email).toHaveAttribute('autocomplete', 'email');
    // `current-password` e não `new-password`: aqui a senha já existe.
    expect(password).toHaveAttribute('autocomplete', 'current-password');
  });

  // §12.5: valida com o mesmo schema do servidor antes de enviar.
  it('recusa localmente e-mail malformado, sem chamar a API', async () => {
    const { calls } = stubFetch({});
    renderWithProviders(<LoginPage />, { route: '/entrar' });

    await userEvent.type(await screen.findByLabelText('E-mail'), 'ana@');
    await userEvent.type(screen.getByLabelText('Senha'), 'senha-123');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText(/e-mail válido/i)).toBeInTheDocument();
    expect(calls.filter((url) => url.includes('/auth/login'))).toHaveLength(0);
  });

  it('liga o erro ao campo por aria-describedby (§18.1)', async () => {
    renderWithProviders(<LoginPage />, { route: '/entrar' });

    await userEvent.type(await screen.findByLabelText('E-mail'), 'ana@');
    await userEvent.type(screen.getByLabelText('Senha'), 'senha-123');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    const email = screen.getByLabelText('E-mail');
    await waitFor(() => expect(email).toHaveAttribute('aria-invalid', 'true'));

    const describedBy = email.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy ?? '')?.textContent).toMatch(/e-mail válido/i);
  });

  it('mostra a mensagem da API quando a credencial está errada', async () => {
    stubFetch({
      '/api/auth/login': () =>
        errorResponse(
          401,
          'INVALID_CREDENTIALS',
          'E-mail ou senha incorretos. Confira e tente de novo.',
        ),
    });
    renderWithProviders(<LoginPage />, { route: '/entrar' });

    await userEvent.type(await screen.findByLabelText('E-mail'), 'ana@exemplo.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'senha-errada');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('E-mail ou senha incorretos');
  });

  // §10.2: quem não confirmou precisa de um caminho, não só de um aviso.
  it('oferece reenviar o link quando o e-mail não foi confirmado', async () => {
    stubFetch({
      '/api/auth/login': () =>
        errorResponse(
          403,
          'EMAIL_NOT_VERIFIED',
          'Confirme seu e-mail para entrar. Enviamos um link para ana@exemplo.com.',
        ),
      '/api/auth/resend-verification': () => jsonResponse({ message: 'Enviamos um e-mail.' }, 202),
    });
    renderWithProviders(<LoginPage />, { route: '/entrar' });

    await userEvent.type(await screen.findByLabelText('E-mail'), 'ana@exemplo.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'senha-bem-boa-123');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    const resend = await screen.findByRole('button', { name: /reenviar o link/i });
    await userEvent.click(resend);

    expect(await screen.findByRole('button', { name: 'Link reenviado' })).toBeInTheDocument();
  });

  it('avisa quando a pessoa acabou de redefinir a senha', async () => {
    renderWithProviders(<LoginPage />, { route: '/entrar?senha-redefinida=1' });

    expect(await screen.findByText(/senha alterada/i)).toBeInTheDocument();
  });

  it('envia o e-mail normalizado para a API', async () => {
    const { fetchMock } = stubFetch({ '/api/auth/login': () => jsonResponse(SESSION) });
    renderWithProviders(<LoginPage />, { route: '/entrar' });

    await userEvent.type(await screen.findByLabelText('E-mail'), '  ANA@Exemplo.COM ');
    await userEvent.type(screen.getByLabelText('Senha'), 'senha-bem-boa-123');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      const login = fetchMock.mock.calls.find(([url]) => url === '/api/auth/login');
      expect(login).toBeDefined();
      const body = JSON.parse(String(login?.[1]?.body)) as { email: string };
      expect(body.email).toBe('ana@exemplo.com');
    });
  });

  // Sem VITE_GOOGLE_CLIENT_ID, mostrar o botão levaria a um 503 da API.
  it('não mostra o botão do Google sem credencial configurada', async () => {
    renderWithProviders(<LoginPage />, { route: '/entrar' });

    await screen.findByLabelText('E-mail');
    expect(screen.queryByText('ou')).not.toBeInTheDocument();
  });

  it('tem um único h1 e os caminhos de cadastro e senha esquecida', async () => {
    renderWithProviders(<LoginPage />, { route: '/entrar' });

    expect(await screen.findByRole('heading', { level: 1, name: 'Entrar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Criar uma conta' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Esqueci minha senha' })).toBeInTheDocument();
  });
});
