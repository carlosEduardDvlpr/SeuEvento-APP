import { useState } from 'react';
import { type Location, Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useVenue } from '@/api/venue';
import {
  CalendarIcon,
  HexMarkIcon,
  InstagramIcon,
  ListIcon,
  LogInIcon,
  LogOutIcon,
  MenuIcon,
  WhatsAppIcon,
} from '@/components/icons';
import { useAuth } from '@/features/auth/AuthProvider';
import { whatsappUrl } from '@/lib/whatsapp';
import { SiteMenu, type SiteAction } from './SiteMenu';
import styles from './PublicLayout.module.css';

/**
 * Perfil da marca no Instagram, no rodapé (§13.1, item 10: "redes").
 *
 * Fixo no código: `VenueSettings` não tem campo de rede social, e o endereço
 * muda raramente. Se o dono quiser trocar pelo painel, o caminho é um campo
 * novo nas configurações.
 */
const INSTAGRAM = {
  url: 'https://www.instagram.com/donnabelle.decor/',
  handle: '@donnabelle.decor',
};

/**
 * Cabeçalho fixo e discreto (§13.1): o logo e as ações do site, que são
 * reservar, ver as reservas de quem entrou e entrar ou sair.
 *
 * No desktop as ações são links alinhados, cada um com o seu ícone, e as
 * reservas aparecem por extenso, "Minhas reservas". No celular elas moram no
 * menu lateral (`SiteMenu`), aberto pelo botão "Menu": em 375 px eram quatro
 * controles espremidos numa linha, e o rótulo precisava encolher para caber.
 * Pedido do dono, outubro de 2026.
 *
 * O rodapé fecha a página no tom de ameixa da marca, com o que a §13.1 pede
 * para ele: contato, redes, termos e privacidade.
 */
export function PublicLayout() {
  const { data: venue } = useVenue();
  const { status, user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  /*
   * O menu guarda a página em que foi aberto, e só fica aberto nela: qualquer
   * navegação, inclusive o voltar do navegador, o fecha sem precisar de efeito.
   * A comparação é com o objeto da localização, e não com a `key`: cada
   * navegação cria um objeto novo, inclusive a volta à mesma entrada do
   * histórico, então avançar de novo até a página não reabre o menu.
   */
  const [menuOpenFor, setMenuOpenFor] = useState<Location | null>(null);
  const menuOpen = menuOpenFor === location;

  async function handleSignOut() {
    await signOut();
    navigate('/', { replace: true });
  }

  /*
   * Enquanto a sessão carrega, nem "Entrar" nem "Minhas reservas" aparece:
   * mostrar um e trocar pelo outro faria o cabeçalho piscar em toda recarga de
   * quem está logado (§10.4).
   */
  const actions: SiteAction[] = [
    { type: 'link', to: '/reservar', label: 'Reservar', Icon: CalendarIcon },
  ];

  if (status === 'authenticated') {
    actions.push(
      { type: 'link', to: '/minhas-reservas', label: 'Minhas reservas', Icon: ListIcon },
      { type: 'signOut', label: 'Sair', Icon: LogOutIcon },
    );
  }

  if (status === 'anonymous') {
    actions.push({ type: 'link', to: '/entrar', label: 'Entrar', Icon: LogInIcon });
  }

  return (
    <>
      <a className="skip-link" href="#conteudo">
        Ir para o conteúdo
      </a>

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link to="/" className={styles.logo}>
            <HexMarkIcon size={28} />
            <span>{venue?.name ?? 'Chácara'}</span>
          </Link>

          {/* Desktop: as ações como links. O CSS esconde esta lista no celular. */}
          <nav className={styles.nav} aria-label="Navegação principal">
            <ul className={styles.navList}>
              {actions.map((action) => {
                const { Icon } = action;

                return (
                  <li key={action.label}>
                    {action.type === 'link' ? (
                      <NavLink to={action.to} className={styles.navLink}>
                        <Icon size={18} />
                        <span>{action.label}</span>
                      </NavLink>
                    ) : (
                      <button
                        type="button"
                        className={styles.navLink}
                        onClick={() => void handleSignOut()}
                      >
                        <Icon size={18} />
                        <span>{action.label}</span>
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>

          {/*
            Celular: as mesmas ações, no menu lateral. O CSS esconde o botão no
            desktop. Abaixo de 400 px só o ícone fica à vista, e "Menu" continua
            sendo o nome do botão para o leitor de tela.
          */}
          <button
            type="button"
            className={styles.menuButton}
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpenFor(location)}
          >
            <MenuIcon size={24} />
            <span className={styles.menuLabel}>Menu</span>
          </button>
        </div>
      </header>

      {menuOpen ? (
        <SiteMenu
          actions={actions}
          userName={status === 'authenticated' ? (user?.name ?? null) : null}
          onSignOut={() => void handleSignOut()}
          onClose={() => setMenuOpenFor(null)}
        />
      ) : null}

      <main id="conteudo">
        <Outlet />
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div>
            <p className={styles.footerBrand}>
              <HexMarkIcon size={28} />
              <span>{venue?.name ?? 'Chácara'}</span>
            </p>
            {venue?.address ? <p className={styles.footerAddress}>{venue.address}</p> : null}
          </div>

          {/* Os ícones são decorativos: o nome de cada canal está no texto do link. */}
          <ul className={styles.footerContacts} aria-label="Contato">
            {venue?.whatsapp ? (
              <li>
                <a href={whatsappUrl(venue.whatsapp)} target="_blank" rel="noreferrer">
                  <WhatsAppIcon size={20} />
                  WhatsApp
                </a>
              </li>
            ) : null}
            <li>
              <a href={INSTAGRAM.url} target="_blank" rel="noreferrer">
                <InstagramIcon size={20} />
                Instagram {INSTAGRAM.handle}
              </a>
            </li>
          </ul>

          <nav aria-label="Rodapé" className={styles.footerNav}>
            <Link to="/termos">Termos de uso</Link>
            <Link to="/privacidade">Política de privacidade</Link>
          </nav>

          {/* Redação neutra: o cadastro não pergunta gênero. */}
          {user ? <p className={styles.footerUser}>Você entrou como {user.name}.</p> : null}
        </div>
      </footer>
    </>
  );
}
