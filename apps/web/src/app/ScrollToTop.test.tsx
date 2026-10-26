import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScrollToTop } from './ScrollToTop';

/**
 * Página nova começa do topo; o voltar do navegador e a troca só de query
 * ficam de fora (ver o comentário do componente).
 */

function BackButton() {
  const navigate = useNavigate();

  return (
    <button type="button" onClick={() => navigate(-1)}>
      Voltar
    </button>
  );
}

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Link to="/reservar">Reservar</Link>} />
        <Route
          path="/reservar"
          element={
            <>
              <h1>Montar meu pedido</h1>
              <Link to="/reservar?step=itens">Itens</Link>
              <BackButton />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ScrollToTop', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('leva ao topo quando a página muda', async () => {
    const user = userEvent.setup();
    const scrollTo = vi.spyOn(window, 'scrollTo');
    renderApp();

    await user.click(screen.getByRole('link', { name: 'Reservar' }));

    expect(await screen.findByRole('heading', { name: 'Montar meu pedido' })).toBeVisible();
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  /* Primeiro carregamento e recarga: a rolagem já está onde o navegador deixou. */
  it('não mexe na rolagem ao abrir a primeira página', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo');
    renderApp();

    expect(screen.getByRole('link', { name: 'Reservar' })).toBeVisible();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('deixa o voltar do navegador com o navegador', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('link', { name: 'Reservar' }));
    await screen.findByRole('heading', { name: 'Montar meu pedido' });

    const scrollTo = vi.spyOn(window, 'scrollTo');
    await user.click(screen.getByRole('button', { name: 'Voltar' }));

    expect(await screen.findByRole('link', { name: 'Reservar' })).toBeVisible();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  /* O passo do wizard mora na query e cuida da própria rolagem. */
  it('não mexe na rolagem quando só a query muda', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('link', { name: 'Reservar' }));
    await screen.findByRole('heading', { name: 'Montar meu pedido' });

    const scrollTo = vi.spyOn(window, 'scrollTo');
    await user.click(screen.getByRole('link', { name: 'Itens' }));

    expect(screen.getByRole('heading', { name: 'Montar meu pedido' })).toBeVisible();
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
