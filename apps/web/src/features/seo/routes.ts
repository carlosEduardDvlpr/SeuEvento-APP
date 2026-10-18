import type { PublicVenue } from '@chacara/shared';

/**
 * O que cada rota declara para busca e compartilhamento (§18.3).
 *
 * Fica num módulo puro, sem DOM e sem React, por dois motivos: é testável sem
 * montar nada, e o pré-renderizador do build precisa do mesmo cálculo que roda
 * no navegador. Duas tabelas de título divergiriam na primeira mudança de copy.
 */
export type RouteSeo = {
  /**
   * Título da página, sem o nome da chácara.
   *
   * `null` na landing, que não é "uma página do site": ela é o site, e usa a
   * frase completa com as palavras que alguém digitaria na busca.
   */
  title: string | null;
  description: string;
  /**
   * Se a página deve entrar no índice de busca.
   *
   * `false` vira `<meta name="robots" content="noindex">` (§18.3, camada 4). O
   * `robots.txt` já bloqueia estes caminhos, mas as duas coisas respondem a
   * perguntas diferentes: o arquivo pede para não rastrear, a meta pede para não
   * indexar. Uma URL descoberta por link de fora passa pelo primeiro e é pega
   * pela segunda.
   */
  indexable: boolean;
};

const LANDING: RouteSeo = {
  title: null,
  description:
    'Alugue a chácara por dia para aniversário, chá de bebê, casamento no campo e confraternização, e monte a decoração você mesmo.',
  indexable: true,
};

/**
 * Rotas de caminho exato (§12.1).
 *
 * Tudo que serve só a quem está logado, ou que só existe no meio de um fluxo,
 * sai do índice: é página que não responde a nenhuma busca e gasta rastreamento.
 */
const EXACT: Record<string, RouteSeo> = {
  '/': LANDING,

  '/reservar': {
    title: 'Reservar',
    description: 'Escolha as datas, monte a decoração e envie o pedido de reserva.',
    indexable: false,
  },

  '/entrar': {
    title: 'Entrar',
    description: 'Entre na sua conta para acompanhar as reservas.',
    indexable: false,
  },
  '/cadastro': {
    title: 'Criar conta',
    description: 'Crie sua conta para enviar pedidos de reserva.',
    indexable: false,
  },
  '/verificar-email': {
    title: 'Confirmar e-mail',
    description: 'Confirmação do endereço de e-mail da conta.',
    indexable: false,
  },
  '/esqueci-senha': {
    title: 'Recuperar acesso',
    description: 'Receba um link para definir uma nova senha.',
    indexable: false,
  },
  '/redefinir-senha': {
    title: 'Nova senha',
    description: 'Defina uma nova senha para a sua conta.',
    indexable: false,
  },

  '/minhas-reservas': {
    title: 'Minhas reservas',
    description: 'Acompanhe seus pedidos de reserva e o que já está confirmado.',
    indexable: false,
  },

  // As duas páginas públicas além da landing, e as únicas outras no sitemap.
  '/termos': {
    title: 'Termos de uso',
    description: 'Condições de uso da chácara e do serviço de decoração pegue e monte.',
    indexable: true,
  },
  '/privacidade': {
    title: 'Política de privacidade',
    description: 'Como tratamos os dados de quem usa o site, conforme a LGPD.',
    indexable: true,
  },
};

/** Rotas com parâmetro, resolvidas por início do caminho. */
const PREFIXES: ReadonlyArray<{ prefix: string; seo: RouteSeo }> = [
  {
    prefix: '/reservas/',
    seo: {
      title: 'Reserva',
      description: 'Detalhe do seu pedido de reserva.',
      indexable: false,
    },
  },
  {
    prefix: '/admin',
    seo: {
      title: 'Painel',
      description: 'Painel de administração da chácara.',
      indexable: false,
    },
  },
];

const NOT_FOUND: RouteSeo = {
  title: 'Página não encontrada',
  description: 'O endereço que você abriu não existe por aqui.',
  indexable: false,
};

/** Tira a barra final para `/termos/` e `/termos` caírem no mesmo lugar. */
function normalize(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname || '/';
}

export function seoForPath(pathname: string): RouteSeo {
  const path = normalize(pathname);

  const exact = EXACT[path];
  if (exact) return exact;

  for (const { prefix, seo } of PREFIXES) {
    if (path === prefix || path.startsWith(prefix)) return seo;
  }

  /*
   * Qualquer outro caminho é o 404 do SPA. Marcar `noindex` aqui importa: o
   * servidor devolve 200 com o `index.html` em tudo (é um SPA), então sem esta
   * meta o Google guardaria endereços inventados como páginas válidas.
   */
  return NOT_FOUND;
}

/**
 * Título do documento.
 *
 * Na landing o nome vem primeiro, porque é o que a pessoa reconhece no resultado
 * da busca; nas outras, o assunto da página vem primeiro e o nome fecha.
 */
export function documentTitle(route: RouteSeo, venueName: string | null): string {
  const name = venueName?.trim() || 'Chácara';

  if (route.title === null) {
    return `${name} — chácara para festas e decoração pegue e monte`;
  }

  return `${route.title} · ${name}`;
}

/**
 * Descrição da landing com os dados reais do painel.
 *
 * Sem os dados, devolve a frase do `index.html` — nunca uma com lacuna. A
 * capacidade entra porque é a primeira pergunta de quem procura chácara; o
 * endereço fica fora, porque descrição é o texto do resultado da busca e
 * endereço é informação estruturada (vai no JSON-LD).
 */
export function descriptionFor(route: RouteSeo, venue: PublicVenue | undefined): string {
  if (route.title !== null || !venue) return route.description;

  return `${venue.name}: chácara para até ${venue.maxGuests} pessoas, alugada por dia, com decoração pegue e monte para você escolher e montar.`;
}
