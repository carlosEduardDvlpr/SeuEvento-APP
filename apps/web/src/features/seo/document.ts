/**
 * Escrita no `<head>` (§18.3).
 *
 * Sem biblioteca de "head manager": o que o projeto precisa são seis atributos
 * e um bloco de JSON, e as funções abaixo cabem num arquivo. A §3 pede a solução
 * mínima que resolve, e uma dependência a mais na landing custaria justamente o
 * que a §18.2 tenta economizar.
 *
 * Tudo aqui mexe no DOM, então só pode ser chamado de efeito — nunca do corpo de
 * um componente, para o pré-renderizador do build não quebrar.
 */

/** Acha a tag pelo seletor ou cria uma no `<head>`. */
function upsert<E extends HTMLElement>(selector: string, create: () => E): E {
  const found = document.head.querySelector<E>(selector);
  if (found) return found;

  const created = create();
  document.head.append(created);
  return created;
}

export function setMetaByName(name: string, content: string): void {
  const tag = upsert(`meta[name="${name}"]`, () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', name);
    return meta;
  });

  tag.setAttribute('content', content);
}

export function removeMetaByName(name: string): void {
  document.head.querySelector(`meta[name="${name}"]`)?.remove();
}

/**
 * Open Graph usa `property`, não `name`.
 *
 * A troca é um erro clássico e silencioso: a tag fica no HTML, parece certa e os
 * leitores de cartão ignoram.
 */
export function setMetaByProperty(property: string, content: string): void {
  const tag = upsert(`meta[property="${property}"]`, () => {
    const meta = document.createElement('meta');
    meta.setAttribute('property', property);
    return meta;
  });

  tag.setAttribute('content', content);
}

export function removeMetaByProperty(property: string): void {
  document.head.querySelector(`meta[property="${property}"]`)?.remove();
}

export function setCanonical(href: string): void {
  const tag = upsert('link[rel="canonical"]', () => {
    const link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    return link;
  });

  tag.setAttribute('href', href);
}

/**
 * Reescreve um bloco JSON-LD identificado por `data-seo`.
 *
 * O `index.html` já traz o esqueleto com esse atributo, então o normal é esta
 * função substituir o conteúdo em vez de acrescentar um segundo bloco. Dois
 * `LocalBusiness` na mesma página seriam duas respostas para a mesma pergunta.
 */
export function setJsonLd(key: string, data: unknown): void {
  const tag = upsert(`script[type="application/ld+json"][data-seo="${key}"]`, () => {
    const script = document.createElement('script');
    script.setAttribute('type', 'application/ld+json');
    script.setAttribute('data-seo', key);
    return script;
  });

  tag.textContent = JSON.stringify(data);
}
