import type { DiscountType, GalleryKind, ThemePalette } from '@chacara/shared';

/**
 * Dados iniciais do sistema (§8.2).
 *
 * Os 12 estilos vêm da §15.2, com nome, clima e paleta de 5 cores. Texto e foto
 * aqui são ponto de partida: o admin edita tudo pelo painel, e a §16.6 é clara
 * que copy só vale depois de aprovada pelo dono.
 *
 * Regra de conteúdo da §15: nada de personagem ou marca licenciada. Os estilos
 * falam de cor, material e tema genérico (circo, safári, fundo do mar).
 */

export type ThemeSeed = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  palette: ThemePalette;
  sortOrder: number;
};

/**
 * Imagem de capa fica vazia no seed.
 *
 * Preferimos ausência a foto de banco de imagens: a §14.9 manda usar bloco
 * chapado com a paleta do tema enquanto não houver foto real, e é exatamente o
 * que a UI faz quando `coverImageUrl` é nulo.
 */
export const THEMES: readonly ThemeSeed[] = [
  {
    slug: 'rustico-boho',
    name: 'Rústico boho',
    tagline: 'Tons naturais, trama de palha e sensação de feito à mão.',
    description:
      'Para chá de bebê neutro, chá de panela, aniversário adulto e casamento no campo. ' +
      'Madeira, macramê, flores secas e luzes de varal, em tons suaves e acolhedores.',
    palette: [
      { name: 'Palha', hex: '#D8C7A3' },
      { name: 'Madeira', hex: '#8C6A4F' },
      { name: 'Sálvia', hex: '#A7B8A1' },
      { name: 'Rosa seco', hex: '#C9A29A' },
      { name: 'Branco cru', hex: '#F2EEE6' },
    ],
    sortOrder: 1,
  },
  {
    slug: 'jardim-provencal',
    name: 'Jardim branco e verde',
    tagline: 'Romântico e leve, com folhagem fina e um toque de dourado.',
    description:
      'Para casamento, noivado, chá de panela, quinze anos e batizado. ' +
      'Arco de treliça, toalha branca, castiçais e muito verde, no clima de cerimônia ao ar livre.',
    palette: [
      { name: 'Branco', hex: '#FFFFFF' },
      { name: 'Verde névoa', hex: '#DDE6D5' },
      { name: 'Eucalipto', hex: '#7F9A82' },
      { name: 'Dourado suave', hex: '#C8A96A' },
      { name: 'Verde floresta', hex: '#2F4A3B' },
    ],
    sortOrder: 2,
  },
  {
    slug: 'nuvens-e-estrelas',
    name: 'Nuvens e estrelas',
    tagline: 'Pastéis leves, com cara de céu de manhã.',
    description:
      'Para chá de bebê, chá de fraldas e primeiro aniversário. ' +
      'Painel de nuvens, arco de balões pastel, estrelas e móbile, em tons delicados.',
    palette: [
      { name: 'Azul céu', hex: '#BFD9EE' },
      { name: 'Rosa bebê', hex: '#F4CBD3' },
      { name: 'Menta', hex: '#CDE8DA' },
      { name: 'Manteiga', hex: '#F8E7A4' },
      { name: 'Branco nuvem', hex: '#FFFFFF' },
    ],
    sortOrder: 3,
  },
  {
    slug: 'cha-revelacao',
    name: 'Chá revelação',
    tagline: 'Rosa e azul lado a lado, sem entregar o resultado.',
    description:
      'Para revelar o sexo do bebê. Painel duplo, arco bicolor, balões gigantes e caixa surpresa: ' +
      'o suspense é o assunto da decoração.',
    palette: [
      { name: 'Rosa', hex: '#F29BB0' },
      { name: 'Azul', hex: '#8EC5F0' },
      { name: 'Dourado', hex: '#E6C36A' },
      { name: 'Branco', hex: '#FFFFFF' },
      { name: 'Cinza pérola', hex: '#D9DDE3' },
    ],
    sortOrder: 4,
  },
  {
    slug: 'safari-selva',
    name: 'Safári e selva',
    tagline: 'Aventura suave em tons de savana.',
    description:
      'Para aniversário infantil, em especial o primeiro ano, e chá de bebê. ' +
      'Painel de folhagens, animais decorativos, caixotes e tapetes de fibra, em terrosos que não cansam a vista.',
    palette: [
      { name: 'Areia', hex: '#CDB68A' },
      { name: 'Oliva', hex: '#6C7A3F' },
      { name: 'Terra', hex: '#6B4A2E' },
      { name: 'Laranja savana', hex: '#D9822B' },
      { name: 'Verde mata', hex: '#2F5D3A' },
    ],
    sortOrder: 5,
  },
  {
    slug: 'circo-carrossel',
    name: 'Circo e carrossel',
    tagline: 'Listras, bandeirolas e cara de parque de diversões.',
    description:
      'Para aniversário infantil e festa de parque. ' +
      'Tenda listrada, painel de listras, carrossel decorativo e balões, num clima festivo e nostálgico.',
    palette: [
      { name: 'Vermelho', hex: '#D7263D' },
      { name: 'Azul', hex: '#1F5FA8' },
      { name: 'Amarelo', hex: '#F6C445' },
      { name: 'Branco', hex: '#FFFFFF' },
      { name: 'Céu', hex: '#BFDDF5' },
    ],
    sortOrder: 6,
  },
  {
    slug: 'fundo-do-mar',
    name: 'Fundo do mar',
    tagline: 'Azul, coral e bolhas, para festa de piscina.',
    description:
      'Para aniversário infantil e festa na piscina. ' +
      'Painel de ondas, conchas e estrelas-do-mar, redes e arco de bolhas, em tons frescos.',
    palette: [
      { name: 'Turquesa', hex: '#2BB3B3' },
      { name: 'Azul profundo', hex: '#14567A' },
      { name: 'Coral', hex: '#FF7F6E' },
      { name: 'Areia', hex: '#EAD9B5' },
      { name: 'Madrepérola', hex: '#F1E8F5' },
    ],
    sortOrder: 7,
  },
  {
    slug: 'cores-doces',
    name: 'Cores doces',
    tagline: 'Pastéis vivos, com cara de confeitaria.',
    description:
      'Para aniversário infantil, chá de panela e chá de bebê colorido. ' +
      'Arco de balões em tons de macaron, cúpulas de doces, guirlandas de papel e tapetes fofos.',
    palette: [
      { name: 'Lilás', hex: '#CDB4E8' },
      { name: 'Rosa', hex: '#F7B6D2' },
      { name: 'Menta', hex: '#BDE8D3' },
      { name: 'Azul bebê', hex: '#B7D7F5' },
      { name: 'Limão claro', hex: '#FFF0A8' },
    ],
    sortOrder: 8,
  },
  {
    slug: 'tropical',
    name: 'Tropical',
    tagline: 'Folhagem grande e cor saturada, no clima de verão.',
    description:
      'Para aniversário infantil e adulto, formatura e confraternização de verão. ' +
      'Folhagens largas, painel de folhas, mesas de bambu e luminárias de fibra.',
    palette: [
      { name: 'Verde folha', hex: '#1E7F4F' },
      { name: 'Rosa flamingo', hex: '#F2557B' },
      { name: 'Amarelo abacaxi', hex: '#FFD23F' },
      { name: 'Turquesa', hex: '#26B5B0' },
      { name: 'Branco coco', hex: '#FBF7EE' },
    ],
    sortOrder: 9,
  },
  {
    slug: 'festa-junina',
    name: 'Arraial',
    tagline: 'Xadrez, bandeirola e fardo de palha.',
    description:
      'Para festa junina e julina, confraternização e aniversário no clima caipira. ' +
      'Bandeirolas, painel de xadrez, lampiões, barraquinhas de jogos e mesas de madeira. ' +
      'Ganha destaque de maio a julho.',
    palette: [
      { name: 'Vermelho quadrilha', hex: '#C8352B' },
      { name: 'Amarelo milho', hex: '#F2C230' },
      { name: 'Verde bandeirola', hex: '#3E8E41' },
      { name: 'Azul', hex: '#2D5DA8' },
      { name: 'Palha', hex: '#D5B77A' },
    ],
    sortOrder: 10,
  },
  {
    slug: 'boteco-churrasco',
    name: 'Boteco e churrasco',
    tagline: 'Tijolinho, lousa de giz e luz de varal.',
    description:
      'Para aniversário adulto informal, confraternização e churrasco de fim de semana. ' +
      'Painel de tijolinho, lousas de cardápio, mesas altas e engradados, num clima de bar de esquina.',
    palette: [
      { name: 'Tijolo', hex: '#A5442F' },
      { name: 'Âmbar', hex: '#E0A030' },
      { name: 'Verde garrafa', hex: '#23573F' },
      { name: 'Carvão', hex: '#2B2B2B' },
      { name: 'Kraft', hex: '#C9A87C' },
    ],
    sortOrder: 11,
  },
  {
    slug: 'elegante-esmeralda',
    name: 'Elegante esmeralda',
    tagline: 'Veludo, dourado e luz de vela.',
    description:
      'Para aniversário adulto, bodas, formatura e casamento noturno. ' +
      'Painéis de veludo ou espelho, castiçais, arranjos altos e iluminação quente.',
    palette: [
      { name: 'Esmeralda', hex: '#0F5C4D' },
      { name: 'Dourado', hex: '#C9A24B' },
      { name: 'Marfim', hex: '#F5EFE0' },
      { name: 'Vinho', hex: '#6E1F2E' },
      { name: 'Carvão', hex: '#2B2B2B' },
    ],
    sortOrder: 12,
  },
];

/** Categorias do pegue e monte (§8, exemplos da própria especificação). */
export const CATEGORIES: readonly { name: string; sortOrder: number }[] = [
  { name: 'Painéis', sortOrder: 1 },
  { name: 'Arcos', sortOrder: 2 },
  { name: 'Mesas', sortOrder: 3 },
  { name: 'Iluminação', sortOrder: 4 },
  { name: 'Lúdicos', sortOrder: 5 },
];

export type PriceRuleSeed = {
  name: string;
  dayOfWeek: number | null;
  priceCents: number;
  priority: number;
};

/**
 * Regras de exemplo (§8.2). O dono ajusta valor e prioridade em Admin → Preços,
 * onde há simulador para conferir qual regra vence em cada dia.
 */
export const PRICE_RULES: readonly PriceRuleSeed[] = [
  { name: 'Sábado', dayOfWeek: 6, priceCents: 220_000, priority: 10 },
  { name: 'Domingo', dayOfWeek: 0, priceCents: 200_000, priority: 10 },
  { name: 'Sexta-feira', dayOfWeek: 5, priceCents: 180_000, priority: 5 },
];

export type DemoItemSeed = {
  name: string;
  categoryName: string;
  themeSlugs: readonly string[];
  priceCents: number;
  stock: number;
  description: string;
  assemblyNotes: string;
};

/**
 * Catálogo de demonstração, criado só com `SEED_DEMO=true`.
 *
 * Existe para o wizard ter o que mostrar em desenvolvimento. Em produção não se
 * cria item falso (§8.2): o acervo de verdade é cadastrado pelo dono.
 */
export const DEMO_ITEMS: readonly DemoItemSeed[] = [
  {
    name: 'Painel de nuvens',
    categoryName: 'Painéis',
    themeSlugs: ['nuvens-e-estrelas', 'cha-revelacao'],
    priceCents: 18_000,
    stock: 2,
    description: 'Painel redondo com nuvens em relevo, 2 m de diâmetro.',
    assemblyNotes: 'Monte em piso plano e fixe a base antes de encaixar o disco.',
  },
  {
    name: 'Arco de balões pastel',
    categoryName: 'Arcos',
    themeSlugs: ['nuvens-e-estrelas', 'cores-doces'],
    priceCents: 24_000,
    stock: 3,
    description: 'Estrutura de arco com balões em tons pastel, 2,5 m de altura.',
    assemblyNotes: 'Encha os balões no local: transportar cheio estoura no caminho.',
  },
  {
    name: 'Mesa de madeira rústica',
    categoryName: 'Mesas',
    themeSlugs: ['rustico-boho', 'jardim-provencal', 'boteco-churrasco', 'festa-junina'],
    priceCents: 12_000,
    stock: 6,
    description: 'Mesa de madeira maciça para 8 pessoas, 2 m por 0,9 m.',
    assemblyNotes: 'Pé dobrável: abra até travar o clique dos dois lados.',
  },
  {
    name: 'Painel ripado de madeira',
    categoryName: 'Painéis',
    themeSlugs: ['rustico-boho', 'boteco-churrasco'],
    priceCents: 20_000,
    stock: 2,
    description: 'Painel ripado 1,8 m por 2 m, com base de apoio.',
    assemblyNotes: 'Precisa de duas pessoas para levantar. Apoie contra parede ou use o tripé.',
  },
  {
    name: 'Cordão de luzes de varal',
    categoryName: 'Iluminação',
    themeSlugs: ['rustico-boho', 'boteco-churrasco', 'jardim-provencal', 'festa-junina'],
    priceCents: 6_000,
    stock: 10,
    description: 'Cordão de 10 m com 20 lâmpadas, para área coberta ou aberta.',
    assemblyNotes: 'Use os ganchos da área coberta. Não passe o cordão sobre a churrasqueira.',
  },
  {
    name: 'Arranjo de flores secas',
    categoryName: 'Lúdicos',
    themeSlugs: ['rustico-boho', 'jardim-provencal'],
    priceCents: 4_500,
    stock: 8,
    description: 'Arranjo de capim-dos-pampas e folhagem seca artificial, 60 cm.',
    assemblyNotes: 'Abra as hastes com a mão para dar volume antes de posicionar.',
  },
  {
    name: 'Animais decorativos de safári',
    categoryName: 'Lúdicos',
    themeSlugs: ['safari-selva'],
    priceCents: 9_000,
    stock: 4,
    description: 'Trio de animais decorativos em resina: leão, girafa e zebra.',
    assemblyNotes: 'São peças pesadas. Posicione longe da circulação das crianças.',
  },
  {
    name: 'Bandeirolas de arraial',
    categoryName: 'Lúdicos',
    themeSlugs: ['festa-junina', 'circo-carrossel'],
    priceCents: 3_500,
    stock: 12,
    description: 'Cinco varais de bandeirolas de tecido, 8 m cada.',
    assemblyNotes: 'Estique bem entre dois pontos altos; bandeirola frouxa embola com vento.',
  },
];

export type DemoComboSeed = {
  name: string;
  description: string;
  themeSlug: string;
  discountType: DiscountType;
  discountValue: number;
  items: readonly { itemName: string; quantity: number }[];
};

/** Combos de demonstração, um por estilo, conforme as sugestões da §15.2. */
export const DEMO_COMBOS: readonly DemoComboSeed[] = [
  {
    name: 'Céu de chá',
    description: 'Painel de nuvens, arco de balões pastel e mesa, com desconto no conjunto.',
    themeSlug: 'nuvens-e-estrelas',
    discountType: 'PERCENT',
    discountValue: 15,
    items: [
      { itemName: 'Painel de nuvens', quantity: 1 },
      { itemName: 'Arco de balões pastel', quantity: 1 },
      { itemName: 'Mesa de madeira rústica', quantity: 1 },
    ],
  },
  {
    name: 'Mesa do bolo boho',
    description: 'Painel ripado, mesa, arranjos e luzes por um preço fechado.',
    themeSlug: 'rustico-boho',
    discountType: 'FIXED_PRICE',
    discountValue: 38_000,
    items: [
      { itemName: 'Painel ripado de madeira', quantity: 1 },
      { itemName: 'Mesa de madeira rústica', quantity: 1 },
      { itemName: 'Arranjo de flores secas', quantity: 2 },
      { itemName: 'Cordão de luzes de varal', quantity: 1 },
    ],
  },
  {
    name: 'Arraial completo',
    description: 'Bandeirolas, mesas e luzes para montar o arraial.',
    themeSlug: 'festa-junina',
    discountType: 'PERCENT',
    discountValue: 10,
    items: [
      { itemName: 'Bandeirolas de arraial', quantity: 2 },
      { itemName: 'Mesa de madeira rústica', quantity: 2 },
      { itemName: 'Cordão de luzes de varal', quantity: 2 },
    ],
  },
];

export type DemoGallerySeed = {
  kind: GalleryKind;
  url: string;
  alt: string;
  caption: string | null;
  sortOrder: number;
};

/**
 * Galeria de demonstração com imagem de placeholder.
 *
 * A URL é trocável em Admin → Galeria (suposição 9 da §23: o admin informa a URL
 * de um CDN). O `alt` é obrigatório e descritivo, nunca genérico (§14.9).
 */
export const DEMO_GALLERY: readonly DemoGallerySeed[] = [
  {
    kind: 'HERO',
    url: 'https://placehold.co/1600x2000/E4ECDF/1F4A38?text=Foto+da+chacara',
    alt: 'Área externa da chácara com mesa comprida posta sob as árvores no fim da tarde.',
    caption: null,
    sortOrder: 1,
  },
  {
    kind: 'VENUE',
    url: 'https://placehold.co/1600x1200/E4ECDF/1F4A38?text=Area+coberta',
    alt: 'Área coberta com mesas e cadeiras dispostas para uma festa.',
    caption: 'Área coberta',
    sortOrder: 1,
  },
  {
    kind: 'VENUE',
    url: 'https://placehold.co/1600x1200/E4ECDF/1F4A38?text=Area+verde',
    alt: 'Gramado amplo com árvores nas laterais.',
    caption: 'Área verde',
    sortOrder: 2,
  },
  {
    kind: 'EVENTS',
    url: 'https://placehold.co/1200x1200/F4CBD3/7A5500?text=Cha+de+bebe',
    alt: 'Mesa de doces de chá de bebê com painel de nuvens ao fundo.',
    caption: 'Chá de bebê',
    sortOrder: 1,
  },
];
