import type { PublicVenue, SessionUser } from '@chacara/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router';
import { errorResponse, jsonResponse, renderWithProviders } from '../../../test/helpers/render';
import { MyBookingsPage } from './MyBookingsPage';

/**
 * Remoção da conta pelo cliente (§10.8), do lado da tela.
 *
 * O que está sob teste não é o texto: é o caminho. A ação precisa **existir e ser
 * encontrável** (é um direito, não um favor), precisar de confirmação explícita
 * (§13.4), e mostrar a recusa da API sem repetir a regra que a gerou.
 */

const USER: SessionUser = {
  id: 'u-1',
  name: 'Ana Beatriz',
  email: 'ana@exemplo.com',
  phone: '11999990000',
  role: 'CLIENT',
  emailVerified: true,
};

const VENUE: PublicVenue = {
  name: 'Chácara Seu Evento',
  maxGuests: 120,
  checkInTime: '08:00',
  checkOutTime: '22:00',
  whatsapp: '(11) 98888-7777',
  address: 'Estrada do Sol, 100',
  mapsUrl: null,
  houseRules: null,
  minDays: 1,
  maxDays: 3,
  minLeadDays: 2,
  freeCancelUntilDays: 7,
  holdHours: 48,
};

type Call = { url: string; method: string };

function stubFetch(routes: Record<string, () => Response> = {}) {
  const calls: Call[] = [];

  const base: Record<string, () => Response> = {
    'GET /api/public/venue': () => jsonResponse(VENUE),
    'POST /api/auth/refresh': () => jsonResponse({ accessToken: 'token', user: USER }),
    'POST /api/auth/logout': () => new Response(null, { status: 204 }),
    'GET /api/bookings/me': () => jsonResponse([]),
    'DELETE /api/me': () => new Response(null, { status: 204 }),
    ...routes,
  };

  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: { method?: string }) => {
      const call = { url, method: init?.method ?? 'GET' };
      calls.push(call);

      const handler = base[`${call.method} ${url.split('?')[0]!}`];
      if (handler) return Promise.resolve(handler());

      return Promise.resolve(jsonResponse([]));
    }),
  );

  return calls;
}

/**
 * Monta a página do cliente com uma rota de `/entrar` só para observar o destino.
 *
 * O `MemoryRouter` não mexe em `window.location`, então afirmar o endereço final
 * pela URL passaria de graça; o que prova a navegação é a tela de destino
 * aparecer.
 */
function renderAccount() {
  return renderWithProviders(
    <Routes>
      <Route path="/minhas-reservas" element={<MyBookingsPage />} />
      <Route path="/entrar" element={<p>Tela de entrar</p>} />
    </Routes>,
    { route: '/minhas-reservas' },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('remoção da conta', () => {
  let calls: Call[];

  beforeEach(() => {
    calls = stubFetch();
  });

  it('oferece a ação na própria área do cliente, dizendo o que sai e o que fica', async () => {
    renderAccount();

    expect(await screen.findByRole('heading', { name: 'Sua conta' })).toBeInTheDocument();

    expect(screen.getByText(/Seu nome, e-mail e telefone saem do sistema/)).toBeInTheDocument();
    expect(screen.getByText(/registro das reservas continua guardado/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Política de privacidade' })).toHaveAttribute(
      'href',
      '/privacidade',
    );
  });

  // §13.4: ação destrutiva passa por confirmação, nunca por um clique só.
  it('não chama a API no primeiro clique', async () => {
    renderAccount();

    await userEvent.click(await screen.findByRole('button', { name: 'Apagar minha conta' }));

    expect(await screen.findByRole('dialog')).toBeVisible();
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
  });

  it('desiste sem apagar nada quando a pessoa volta', async () => {
    renderAccount();

    await userEvent.click(await screen.findByRole('button', { name: 'Apagar minha conta' }));

    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Voltar' }));

    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
  });

  it('apaga, encerra a sessão e leva para o login com o aviso', async () => {
    renderAccount();

    await userEvent.click(await screen.findByRole('button', { name: 'Apagar minha conta' }));

    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apagar minha conta' }));

    expect(await screen.findByText('Tela de entrar')).toBeInTheDocument();

    const deleted = calls.find((call) => call.method === 'DELETE');
    expect(deleted?.url).toBe('/api/me');

    // Sair também localmente: o token em memória não pode sobreviver à conta.
    expect(calls.some((call) => call.url === '/api/auth/logout')).toBe(true);
  });

  /*
   * A recusa por reserva em andamento é regra do servidor (§10.8). A tela mostra
   * a mensagem que veio e não repete a regra — duas versões divergiriam.
   */
  it('mostra a recusa da API e mantém a pessoa na página', async () => {
    calls = stubFetch({
      'DELETE /api/me': () =>
        errorResponse(
          422,
          'INVALID_TRANSITION',
          'Você tem uma reserva em andamento. Cancele pelo site ou fale com a chácara antes de apagar a conta.',
        ),
    });

    renderAccount();

    await userEvent.click(await screen.findByRole('button', { name: 'Apagar minha conta' }));

    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apagar minha conta' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Você tem uma reserva em andamento.',
    );

    expect(screen.queryByText('Tela de entrar')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sua conta' })).toBeInTheDocument();
  });
});
