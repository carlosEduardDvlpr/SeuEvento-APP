import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Drawer } from './Drawer';

/**
 * A gaveta é um `<dialog>` modal, como o `Dialog`, e o contrato é o mesmo: quem
 * usa precisa saber quando ela fechou, por qualquer caminho. O que só ela tem é
 * fechar pelo fundo e entregar o fechamento ao conteúdo.
 *
 * Escape não é simulado: quem fecha por ele é o navegador, e o sinal é o evento
 * `close`. No jsdom, o `close()` do preenchimento dispara esse evento na hora
 * (ver `test/setup.ts`); no navegador ele chega logo depois.
 */
describe('Drawer', () => {
  it('abre em modo modal, com o título como nome', () => {
    render(
      <Drawer side="right" title="Menu" onClose={() => {}}>
        {() => <p>Conteúdo</p>}
      </Drawer>,
    );

    expect(screen.getByRole('dialog', { name: 'Menu' })).toBeVisible();
    expect(screen.getByText('Conteúdo')).toBeVisible();
  });

  it('fecha pelo botão de fechar', async () => {
    const onClose = vi.fn();

    render(
      <Drawer side="left" title="Menu" closeLabel="Fechar o menu" onClose={onClose}>
        {() => <p>Conteúdo</p>}
      </Drawer>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Fechar o menu' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /* No navegador, o clique no fundo escuro tem o próprio `<dialog>` como alvo. */
  it('fecha pelo clique no fundo, e não pelo clique dentro', async () => {
    const onClose = vi.fn();

    render(
      <Drawer side="right" title="Menu" onClose={onClose}>
        {() => <p>Conteúdo</p>}
      </Drawer>,
    );

    await userEvent.click(screen.getByText('Conteúdo'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /* A opção do menu fecha a gaveta pelo `close` que ela recebe, como o botão de fechar. */
  it('entrega o fechamento ao conteúdo', async () => {
    const onClose = vi.fn();

    render(
      <Drawer side="right" title="Menu" onClose={onClose}>
        {(close) => (
          <button type="button" onClick={close}>
            Escolher
          </button>
        )}
      </Drawer>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Escolher' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('avisa quem usa quando o navegador fecha a gaveta', () => {
    const onClose = vi.fn();

    render(
      <Drawer side="right" title="Menu" onClose={onClose}>
        {() => <p>Conteúdo</p>}
      </Drawer>,
    );

    screen.getByRole('dialog').dispatchEvent(new Event('close'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('trava a rolagem da página enquanto está aberta', () => {
    const { unmount } = render(
      <Drawer side="right" title="Menu" onClose={() => {}}>
        {() => <p>Conteúdo</p>}
      </Drawer>,
    );

    expect(document.documentElement.style.overflow).toBe('hidden');

    unmount();

    expect(document.documentElement.style.overflow).toBe('');
  });
});
