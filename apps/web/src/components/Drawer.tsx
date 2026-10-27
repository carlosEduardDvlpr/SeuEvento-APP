import { useEffect, useId, useState, type ReactNode } from 'react';
import { CloseIcon } from './icons';
import styles from './Drawer.module.css';

/**
 * Gaveta lateral (§14.11, "Dialog/Drawer").
 *
 * Um `<dialog>` nativo aberto com `showModal()`, pelo mesmo motivo do `Dialog`:
 * o navegador prende o foco, fecha com Escape, deixa o resto da página inerte e
 * devolve o foco a quem abriu. O que muda é a forma: presa a uma borda da tela,
 * na altura toda, entrando pelo lado. É o menu do site e o do painel no celular.
 *
 * Só fica montada enquanto está aberta, e quem decide é quem usa. Assim o
 * conteúdo não aparece duplicado na página com ela fechada.
 *
 * O conteúdo recebe `close`: uma opção que fecha a gaveta pelo caminho do
 * navegador devolve o foco ao botão que a abriu, que é o que o teclado espera.
 *
 * `onClose` vem do evento `close` do navegador. Se quem usa desmonta a gaveta
 * antes de o evento chegar, como numa opção que troca de página, ele não chega:
 * por isso o menu do site e o do painel guardam a página em que abriram, e a
 * troca de página já os fecha.
 *
 * Fundo e fio são ajustáveis por `--drawer-bg` e `--drawer-line`, na classe de
 * quem usa.
 */
export type DrawerProps = {
  /** Obrigatório (§14.11): é o nome da gaveta para o leitor de tela. */
  title: ReactNode;
  side: 'left' | 'right';
  closeLabel?: string;
  className?: string;
  /** Avisado quando o navegador fecha a gaveta, por qualquer caminho. */
  onClose: () => void;
  children: (close: () => void) => ReactNode;
};

export function Drawer({
  title,
  side,
  closeLabel = 'Fechar',
  className,
  onClose,
  children,
}: DrawerProps) {
  /*
   * O elemento fica em estado, e não numa ref: o `close` é entregue ao conteúdo
   * durante a renderização (é argumento de `children`), e uma função que lê ref
   * não pode sair dali, porque o React não teria como saber se ela é chamada
   * enquanto a tela é montada.
   */
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (dialog && !dialog.open) dialog.showModal();
  }, [dialog]);

  /*
   * Com a gaveta aberta, a página de trás não rola: no celular, o dedo que
   * arrasta dentro dela levaria a página junto.
   */
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = 'hidden';

    return () => {
      root.style.overflow = previous;
    };
  }, []);

  /* Fecha pelo caminho do navegador, que devolve o foco a quem abriu. */
  function close() {
    dialog?.close();
  }

  return (
    <dialog
      ref={setDialog}
      className={[styles.drawer, styles[side], className].filter(Boolean).join(' ')}
      aria-labelledby={titleId}
      onClose={onClose}
      // O clique no fundo escuro cai no próprio `<dialog>`; dentro da gaveta, sempre num filho.
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className={styles.panel}>
        <div className={styles.head}>
          <h2 className={styles.title} id={titleId}>
            {title}
          </h2>

          <button type="button" className={styles.close} onClick={close} aria-label={closeLabel}>
            <CloseIcon size={22} />
          </button>
        </div>

        {children(close)}
      </div>
    </dialog>
  );
}
