import type { PublicVenue, SessionUser } from '@chacara/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorResponse, jsonResponse, renderWithProviders } from '../../../test/helpers/render';
import { PublicLayout } from './PublicLayout';

/**
 * Cabeçalho e rodapé do site (§13.1).
 *
 * O cabeçalho tem as ações como links no desktop e no menu lateral no celular.
 * O CSS que troca um pelo outro não roda no jsdom, então os dois aparecem aqui:
 * os casos do menu procuram as ações dentro do diálogo.
 */

const VENUE: PublicVenue = {
  name: 'Espaço Donna Belle',
  maxGuests: 50,
  checkInTime: '08:00',
  checkOutTime: '20:00',
  whatsapp: '11988887777',
  address: 'Estrada do Sol, 100',
  mapsUrl: null,
  houseRules: null,
  minDays: 1,
  maxDays: 3,
  minLeadDays: 2,
  freeCancelUntilDays: 7,
  holdHours: 48,
};

const ANA: SessionUser = {
  id: 'u-1',
  name: 'Ana',
  email: 'ana@exemplo.com',
  phone: '11988880000',
  role: 'CLIENT',
  emailVerified: true,
};

function renderLayout({
  venue = VENUE,
  user = null,
}: { venue?: PublicVenue; user?: SessionUser | null } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.startsWith('/api/public/venue')) return Promise.resolve(jsonResponse(venue));

      // A sessão abre pela renovação que o `AuthProvider` faz ao montar.
      if (url.startsWith('/api/auth/refresh') && user) {
        return Promise.resolve(jsonResponse({ accessToken: 'token-de-teste', user }));
      }

      // 204 sem corpo: `Response` recusa corpo nesse status.
      if (url.startsWith('/api/auth/logout')) {
        return Promise.resolve(new Response(null, { status: 204 }));
      }

      return Promise.resolve(errorResponse(401, 'UNAUTHORIZED', 'Sessão expirada.'));
    }),
  );

  renderWithProviders(
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<p>Página inicial</p>} />
        <Route path="entrar" element={<p>Tela de entrar</p>} />
        <Route path="minhas-reservas" element={<p>Tela das reservas</p>} />
      </Route>
    </Routes>,
    { route: '/' },
  );
}

/** As ações do cabeçalho no desktop, sem as do menu lateral. */
function mainNav() {
  return within(screen.getByRole('navigation', { name: 'Navegação principal' }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cabeçalho', () => {
  it('mostra as ações como links para quem não entrou', async () => {
    renderLayout();

    expect(await mainNav().findByRole('link', { name: 'Entrar' })).toHaveAttribute(
      'href',
      '/entrar',
    );
    expect(mainNav().getByRole('link', { name: 'Reservar' })).toHaveAttribute('href', '/reservar');
    expect(mainNav().queryByRole('link', { name: 'Minhas reservas' })).not.toBeInTheDocument();
  });

  /* Pedido do dono: por extenso, como o título da página. */
  it('mostra "Minhas reservas" e "Sair" para quem entrou', async () => {
    renderLayout({ user: ANA });

    expect(await mainNav().findByRole('link', { name: 'Minhas reservas' })).toHaveAttribute(
      'href',
      '/minhas-reservas',
    );
    expect(mainNav().getByRole('button', { name: 'Sair' })).toBeVisible();
    expect(mainNav().queryByRole('link', { name: 'Entrar' })).not.toBeInTheDocument();
  });

  it('sai da conta e volta a oferecer a entrada', async () => {
    const user = userEvent.setup();
    renderLayout({ user: ANA });

    await user.click(await mainNav().findByRole('button', { name: 'Sair' }));

    expect(await mainNav().findByRole('link', { name: 'Entrar' })).toBeVisible();
    expect(screen.getByText('Página inicial')).toBeVisible();
  });
});

describe('menu lateral', () => {
  it('abre com as ações do site, cada uma com o seu destino', async () => {
    const user = userEvent.setup();
    renderLayout();

    await mainNav().findByRole('link', { name: 'Entrar' });
    const button = screen.getByRole('button', { name: 'Menu' });
    expect(button).toHaveAttribute('aria-expanded', 'false');

    await user.click(button);

    const menu = within(screen.getByRole('dialog', { name: 'Menu' }));
    expect(menu.getByRole('link', { name: 'Reservar' })).toHaveAttribute('href', '/reservar');
    expect(menu.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/entrar');
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });

  it('mostra as reservas, a saída e quem entrou', async () => {
    const user = userEvent.setup();
    renderLayout({ user: ANA });

    await mainNav().findByRole('link', { name: 'Minhas reservas' });
    await user.click(screen.getByRole('button', { name: 'Menu' }));

    const menu = within(screen.getByRole('dialog', { name: 'Menu' }));
    expect(menu.getByRole('link', { name: 'Minhas reservas' })).toHaveAttribute(
      'href',
      '/minhas-reservas',
    );
    expect(menu.getByRole('button', { name: 'Sair' })).toBeVisible();
    expect(menu.getByText('Você entrou como Ana.')).toBeVisible();
  });

  it('fecha pelo botão de fechar', async () => {
    const user = userEvent.setup();
    renderLayout();

    await mainNav().findByRole('link', { name: 'Entrar' });
    await user.click(screen.getByRole('button', { name: 'Menu' }));
    const menu = within(screen.getByRole('dialog', { name: 'Menu' }));
    await user.click(menu.getByRole('button', { name: 'Fechar o menu' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('fecha ao escolher uma opção, e a página muda', async () => {
    const user = userEvent.setup();
    renderLayout();

    await mainNav().findByRole('link', { name: 'Entrar' });
    await user.click(screen.getByRole('button', { name: 'Menu' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Menu' })).getByRole('link', { name: 'Entrar' }),
    );

    expect(await screen.findByText('Tela de entrar')).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('rodapé', () => {
  function footer() {
    return within(screen.getByRole('contentinfo'));
  }

  it('mostra o nome e o endereço da chácara', async () => {
    renderLayout();

    expect(await footer().findByText('Espaço Donna Belle')).toBeVisible();
    expect(footer().getByText('Estrada do Sol, 100')).toBeVisible();
  });

  it('leva ao WhatsApp e ao Instagram da marca', async () => {
    renderLayout();

    expect(await footer().findByRole('link', { name: 'WhatsApp' })).toHaveAttribute(
      'href',
      expect.stringContaining('wa.me/5511988887777'),
    );
    expect(footer().getByRole('link', { name: 'Instagram @donnabelle.decor' })).toHaveAttribute(
      'href',
      'https://www.instagram.com/donnabelle.decor/',
    );
  });

  it('esconde o WhatsApp quando não há número cadastrado', async () => {
    renderLayout({ venue: { ...VENUE, whatsapp: null } });

    await footer().findByText('Espaço Donna Belle');
    expect(footer().queryByRole('link', { name: 'WhatsApp' })).not.toBeInTheDocument();
    expect(footer().getByRole('link', { name: /Instagram/ })).toBeVisible();
  });

  it('mantém os termos e a política de privacidade', async () => {
    renderLayout();

    await footer().findByText('Espaço Donna Belle');
    expect(footer().getByRole('link', { name: 'Termos de uso' })).toHaveAttribute(
      'href',
      '/termos',
    );
    expect(footer().getByRole('link', { name: 'Política de privacidade' })).toHaveAttribute(
      'href',
      '/privacidade',
    );
  });
});
