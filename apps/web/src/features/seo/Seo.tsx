import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { useGallery } from '@/api/storefront';
import { useVenue } from '@/api/venue';
import {
  removeMetaByName,
  setCanonical,
  setJsonLd,
  setMetaByName,
  setMetaByProperty,
} from './document';
import { absoluteImageUrl, localBusinessJsonLd } from './local-business';
import { descriptionFor, documentTitle, seoForPath } from './routes';

/**
 * Camadas 1 e 4 da §18.3, em tempo de execução.
 *
 * O `index.html` já leva um piso de `title`, `description` e Open Graph, que
 * serve a quem lê o HTML sem executar JavaScript. Este componente faz o resto:
 * troca os textos conforme a rota, escreve `canonical` e `og:url` com o domínio
 * real, põe `noindex` nas páginas que não respondem a busca nenhuma e reescreve
 * o JSON-LD com o nome, o endereço e o telefone cadastrados no painel.
 *
 * **Limite honesto:** os leitores de cartão de WhatsApp, Facebook e similares
 * não executam JavaScript, então para eles valem os valores do `index.html` e os
 * que o pré-renderizador do build grava. Atualizar `og:*` daqui ajuda apenas os
 * rastreadores que executam a página — é barato e não atrapalha, mas não é o que
 * faz o cartão de compartilhamento ficar bom.
 *
 * Não renderiza nada: fica montado ao lado das rotas e só escreve no `<head>`.
 */
export function Seo() {
  const { pathname } = useLocation();
  const route = seoForPath(pathname);

  const { data: venue } = useVenue();

  /*
   * A galeria só é buscada onde a foto de destaque tem para quem servir: página
   * indexável é página que alguém compartilha. Na landing a requisição é a mesma
   * que a própria landing já faz.
   */
  const { data: gallery } = useGallery(undefined, { enabled: route.indexable });

  const title = documentTitle(route, venue?.name ?? null);
  const description = descriptionFor(route, venue);

  const heroUrl = gallery?.find((image) => image.kind === 'HERO')?.url;

  useEffect(() => {
    document.title = title;
    setMetaByName('description', description);

    /*
     * `canonical` e `og:url` saem de `window.location`, não de variável de
     * ambiente: assim acertam em qualquer domínio onde o site rodar, sem
     * configuração. A busca é descartada de propósito — `?data=` e `?next=`
     * descrevem o estado da navegação, não uma página diferente.
     */
    const url = `${window.location.origin}${pathname}`;
    setCanonical(url);
    setMetaByProperty('og:url', url);

    setMetaByProperty('og:title', title);
    setMetaByProperty('og:description', description);
    if (venue?.name) setMetaByProperty('og:site_name', venue.name);

    const image = absoluteImageUrl(heroUrl, window.location.origin);
    if (image) setMetaByProperty('og:image', image);

    if (route.indexable) {
      // Removida em vez de `content="index"`: ausência é o padrão, e é mais
      // difícil de errar que uma meta dizendo o óbvio.
      removeMetaByName('robots');
    } else {
      setMetaByName('robots', 'noindex, nofollow');
    }

    if (venue) {
      setJsonLd(
        'local-business',
        localBusinessJsonLd(venue, { url: window.location.origin, imageUrl: image }),
      );
    }
  }, [description, heroUrl, pathname, route.indexable, title, venue]);

  return null;
}
