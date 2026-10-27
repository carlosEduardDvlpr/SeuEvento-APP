import type { SessionUser } from '@chacara/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorResponse, jsonResponse, renderWithProviders } from '../../../test/helpers/render';
import { AdminLayout } from './AdminLayout';

/**
 * Casca do painel: as seções na lateral do desktop e numa gaveta no celular.
 *
 * O CSS que esconde uma e mostra a outra não roda no jsdom, então a lateral
 * está sempre na página aqui: os casos da gaveta procuram as seções dentro do
 * diálogo.
 */

const OWNER: SessionUser = {
  id: 'u-1',
  name: 'Dona',
  email: 'dona@exemplo.com',
  phone: '11988880000',
  role: 'ADMIN',
  emailVerified: true,
};

function renderPanel() {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      // A sessão abre pela renovação que o `AuthProvider` faz ao montar.
      if (url.startsWith('/api/auth/refresh')) {
        return Promise.resolve(jsonResponse({ accessToken: 'token-de-teste', user: OWNER }));
      }

      return Promise.resolve(errorResponse(404, 'NOT_FOUND', 'Não encontrado.'));
    }),
  );

  renderWithProviders(
    <Routes>
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<p>Tela da visão geral</p>} />
        <Route path="configuracoes" element={<p>Tela de configurações</p>} />
      </Route>
    </Routes>,
    { route: '/admin' },
  );
}

/** A gaveta aberta, e só ela. */
function drawer() {
  return within(screen.getByRole('dialog', { name: 'Menu' }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AdminLayout', () => {
  it('mostra as seções na lateral, com a atual marcada', async () => {
    renderPanel();

    const nav = within(screen.getByRole('navigation', { name: 'Seções do painel' }));

    expect(nav.getByRole('link', { name: 'Visão geral' })).toHaveAttribute('aria-current', 'page');
    expect(nav.getByRole('link', { name: 'Configurações' })).not.toHaveAttribute('aria-current');
    expect(await nav.findByText('Você está como Dona.')).toBeVisible();
  });

  /* Pedido do dono: por cima da página, como o menu do site, e não empurrando o conteúdo. */
  it('abre as seções numa gaveta pelo botão "Menu"', async () => {
    const user = userEvent.setup();
    renderPanel();

    await screen.findByText('Você está como Dona.');
    const button = screen.getByRole('button', { name: 'Menu' });
    expect(button).toHaveAttribute('aria-expanded', 'false');

    await user.click(button);

    expect(drawer().getByRole('navigation', { name: 'Seções do painel' })).toBeVisible();
    expect(drawer().getByRole('link', { name: 'Configurações' })).toHaveAttribute(
      'href',
      '/admin/configuracoes',
    );
    expect(drawer().getByText('Você está como Dona.')).toBeVisible();
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });

  it('fecha a gaveta ao escolher uma seção, e a página muda', async () => {
    const user = userEvent.setup();
    renderPanel();

    await screen.findByText('Você está como Dona.');
    await user.click(screen.getByRole('button', { name: 'Menu' }));
    await user.click(drawer().getByRole('link', { name: 'Configurações' }));

    expect(await screen.findByText('Tela de configurações')).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('fecha a gaveta pelo botão de fechar', async () => {
    const user = userEvent.setup();
    renderPanel();

    await screen.findByText('Você está como Dona.');
    await user.click(screen.getByRole('button', { name: 'Menu' }));
    await user.click(drawer().getByRole('button', { name: 'Fechar o menu' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Tela da visão geral')).toBeVisible();
  });
});
