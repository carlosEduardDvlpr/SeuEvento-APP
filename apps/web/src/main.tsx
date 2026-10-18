import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { AppProviders, createQueryClient } from './app/providers';
import { applySeed, readSeed } from './app/query-seed';
import { AppRouter } from './app/router';
import './styles/base.css';

const container = document.getElementById('root');
if (!container) throw new Error('Elemento #root não encontrado no index.html.');

/*
 * Quando o build pré-renderizou **esta** rota (§18.3, camada 3), o HTML já está
 * no lugar e os dados vêm junto: aí o certo é hidratar, aproveitando a pintura
 * que o navegador já fez.
 *
 * As duas condições importam. Sem o pacote de dados, a árvore do cliente
 * começaria no estado de carregamento e divergiria do HTML. E a comparação é com
 * o caminho, não com um "sim": o servidor devolve o mesmo `index.html` em
 * qualquer rota, então o HTML da landing chega também em `/reservar`, onde
 * hidratar seria erro. O `index.html` já limpa o `#root` nesse caso; esta
 * verificação é a segunda linha.
 *
 * Sem pré-renderização, nada muda em relação a antes: `createRoot` normal.
 */
const seed = readSeed(window as unknown as Record<string, unknown>);
const prerendered = container.dataset.prerendered === window.location.pathname && seed !== null;

const client = createQueryClient();
if (seed) applySeed(client, seed);

const tree = (
  <StrictMode>
    <AppProviders client={client}>
      <AppRouter />
    </AppProviders>
  </StrictMode>
);

if (prerendered) {
  hydrateRoot(container, tree);
} else {
  createRoot(container).render(tree);
}
