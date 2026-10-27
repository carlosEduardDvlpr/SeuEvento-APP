import type { ComponentType } from 'react';
import { NavLink } from 'react-router';
import { Drawer } from '@/components/Drawer';
import { HexMarkIcon } from '@/components/icons';
import styles from './SiteMenu.module.css';

/** Uma ação do site: ir a uma página ou sair da conta. */
export type SiteAction =
  | { type: 'link'; to: string; label: string; Icon: ComponentType<{ size?: number }> }
  | { type: 'signOut'; label: string; Icon: ComponentType<{ size?: number }> };

export type SiteMenuProps = {
  actions: SiteAction[];
  /** Nome de quem entrou, para o menu dizer em que conta a pessoa está. */
  userName: string | null;
  onSignOut: () => void;
  /** Avisado quando o menu fecha, por qualquer caminho: Escape, fundo, botão ou opção. */
  onClose: () => void;
};

/**
 * Menu lateral do site no celular (§13.1; pedido do dono em outubro de 2026).
 *
 * Uma gaveta (`components/Drawer`) que entra pela direita, do lado do botão
 * "Menu", com o fio dourado da marca. A gaveta cuida do foco, do Escape e do
 * fundo; aqui ficam só as ações, em linhas largas com o ícone num círculo.
 */
export function SiteMenu({ actions, userName, onSignOut, onClose }: SiteMenuProps) {
  return (
    <Drawer
      side="right"
      title={
        <>
          <HexMarkIcon size={22} />
          Menu
        </>
      }
      closeLabel="Fechar o menu"
      onClose={onClose}
    >
      {(close) => (
        <>
          {/* Os ícones são decorativos: o nome de cada ação é o texto ao lado. */}
          <ul className={styles.list}>
            {actions.map((action) => {
              const { Icon } = action;
              const content = (
                <>
                  <span className={styles.icon}>
                    <Icon size={22} />
                  </span>
                  {action.label}
                </>
              );

              return (
                <li key={action.label}>
                  {action.type === 'link' ? (
                    <NavLink to={action.to} className={styles.item} onClick={close}>
                      {content}
                    </NavLink>
                  ) : (
                    <button
                      type="button"
                      className={styles.item}
                      onClick={() => {
                        close();
                        onSignOut();
                      }}
                    >
                      {content}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          {/* Redação neutra: o cadastro não pergunta gênero. */}
          {userName ? <p className={styles.user}>Você entrou como {userName}.</p> : null}
        </>
      )}
    </Drawer>
  );
}
