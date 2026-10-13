import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';

/**
 * O que precisa ser garantido aqui é o contrato com o `<dialog>` nativo: o
 * fechamento acontece fora do React (Escape, backdrop), então o estado de quem
 * usa o componente só se mantém em sincronia se o evento `close` chamar
 * `onClose`. Sem isso, reabrir não funcionaria.
 */
describe('Dialog', () => {
  it('abre em modo modal e liga o título ao diálogo', () => {
    render(
      <Dialog open title="Novo estilo" onClose={() => {}}>
        <p>Conteúdo</p>
      </Dialog>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Novo estilo' });

    expect(dialog).toBeVisible();
    expect(screen.getByText('Conteúdo')).toBeVisible();
  });

  it('fica fora do alcance quando fechado', () => {
    render(
      <Dialog open={false} title="Novo estilo" onClose={() => {}}>
        <p>Conteúdo</p>
      </Dialog>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  /*
   * No navegador, Escape e clique no backdrop fecham o `<dialog>` sem passar
   * pelo React, e o único sinal é o evento `close`. Testamos a reação a esse
   * evento, não a tecla: simular a tecla aqui mediria o preenchimento do jsdom
   * (ver `test/setup.ts`), não este componente.
   */
  it('avisa quem usa quando o navegador fecha o diálogo', () => {
    const onClose = vi.fn();

    render(
      <Dialog open title="Novo estilo" onClose={onClose}>
        <p>Conteúdo</p>
      </Dialog>,
    );

    screen.getByRole('dialog').dispatchEvent(new Event('close'));

    expect(onClose).toHaveBeenCalled();
  });

  it('fecha pelo botão de fechar', async () => {
    const onClose = vi.fn();

    render(
      <Dialog open title="Novo estilo" onClose={onClose}>
        <p>Conteúdo</p>
      </Dialog>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));

    expect(onClose).toHaveBeenCalled();
  });

  /* O rodapé fica fora do corpo para as ações não rolarem com o formulário. */
  it('mostra as ações do rodapé', () => {
    render(
      <Dialog
        open
        title="Novo estilo"
        onClose={() => {}}
        footer={<button type="button">Salvar</button>}
      >
        <p>Conteúdo</p>
      </Dialog>,
    );

    expect(screen.getByRole('button', { name: 'Salvar' })).toBeVisible();
  });
});
