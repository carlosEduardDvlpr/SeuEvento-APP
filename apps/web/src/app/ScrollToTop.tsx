import { useLayoutEffect, useRef } from 'react';
import { NavigationType, useLocation, useNavigationType } from 'react-router';

/**
 * Página nova começa do topo.
 *
 * O SPA troca de página sem recarregar, e o navegador deixa a rolagem onde
 * estava: quem tocava em "Reservar" no fim da landing abria o wizard já lá
 * embaixo.
 *
 * Duas exceções, de propósito:
 *
 * - **Voltar e avançar do navegador** (`POP`) ficam com o navegador, que tenta
 *   devolver a pessoa ao ponto em que ela estava naquela página. É também o tipo
 *   do primeiro carregamento e da recarga, em que a rolagem já está certa.
 * - **Mudança só na query** é a mesma tela mudando de estado, não página nova. O
 *   passo do wizard, que mora na query, cuida da própria rolagem.
 *
 * `useLayoutEffect` para rolar antes da pintura: com `useEffect`, a página nova
 * aparecia por um quadro na altura da antiga e depois pulava.
 */
export function ScrollToTop() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  const lastPathname = useRef(pathname);

  useLayoutEffect(() => {
    if (lastPathname.current === pathname) return;
    lastPathname.current = pathname;

    if (navigationType !== NavigationType.Pop) window.scrollTo(0, 0);
  }, [pathname, navigationType]);

  return null;
}
