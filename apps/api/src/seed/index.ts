import type { PrismaClient } from '../generated/prisma/client.js';
import { hashPassword } from '../lib/password.js';
import { CATEGORIES, DEMO_COMBOS, DEMO_GALLERY, DEMO_ITEMS, PRICE_RULES, THEMES } from './data.js';

/**
 * Seed idempotente (§8.2).
 *
 * "Idempotente" aqui significa **criar o que falta e não tocar no que existe**.
 * O admin edita preço, nome de estilo e paleta pelo painel; um seed que
 * atualizasse os registros desfaria esse trabalho na próxima execução.
 */

export type SeedLogger = {
  info: (obj: Record<string, unknown>, msg: string) => void;
  warn: (obj: Record<string, unknown>, msg: string) => void;
};

export type SeedOptions = {
  prisma: PrismaClient;
  logger: SeedLogger;
  /** Popula um catálogo de demonstração. Nunca ligar em produção. */
  demo?: boolean;
  admin?: { email: string; password: string } | undefined;
};

/** Quantos registros esta execução criou. Na segunda rodada tudo deve dar zero. */
export type SeedSummary = {
  admins: number;
  settings: number;
  categories: number;
  themes: number;
  priceRules: number;
  items: number;
  combos: number;
  galleryImages: number;
};

export async function runSeed({
  prisma,
  logger,
  demo = false,
  admin,
}: SeedOptions): Promise<SeedSummary> {
  const summary: SeedSummary = {
    admins: await seedAdmin(prisma, logger, admin),
    settings: await seedSettings(prisma),
    categories: await seedCategories(prisma),
    themes: await seedThemes(prisma),
    priceRules: await seedPriceRules(prisma),
    items: 0,
    combos: 0,
    galleryImages: 0,
  };

  if (demo) {
    summary.items = await seedDemoItems(prisma);
    summary.combos = await seedDemoCombos(prisma);
    summary.galleryImages = await seedDemoGallery(prisma);
  }

  logger.info({ ...summary, demo }, 'Seed concluído');
  return summary;
}

async function seedAdmin(
  prisma: PrismaClient,
  logger: SeedLogger,
  admin: SeedOptions['admin'],
): Promise<number> {
  if (!admin) {
    logger.warn({}, 'ADMIN_EMAIL e ADMIN_PASSWORD ausentes: nenhum admin foi criado');
    return 0;
  }

  const email = admin.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    if (existing.role !== 'ADMIN') {
      // Promover em silêncio seria surpresa; trocar a senha, pior ainda.
      logger.warn({ email }, 'Já existe uma conta com este e-mail e ela não é admin');
    }
    return 0;
  }

  const now = new Date();
  await prisma.user.create({
    data: {
      name: 'Administração',
      email,
      passwordHash: await hashPassword(admin.password),
      role: 'ADMIN',
      // O admin nasce verificado: não há ninguém para lhe enviar o link ainda.
      emailVerifiedAt: now,
      termsAcceptedAt: now,
    },
  });

  logger.info({ email }, 'Admin criado');
  return 1;
}

/**
 * `VenueSettings` é linha única (id = 1).
 *
 * Os valores são ponto de partida editável em Admin → Configurações. Telefone,
 * endereço e regras da casa ficam vazios de propósito: são fatos do negócio, e a
 * §16.6 proíbe inventar fato na copy.
 */
async function seedSettings(prisma: PrismaClient): Promise<number> {
  const existing = await prisma.venueSettings.findUnique({ where: { id: 1 } });
  if (existing) return 0;

  await prisma.venueSettings.create({
    data: {
      id: 1,
      name: 'Chácara Seu Evento',
      baseDailyPriceCents: 150_000,
      maxGuests: 120,
      minDays: 1,
      maxDays: 3,
      minLeadDays: 2,
      freeCancelUntilDays: 7,
      holdHours: 48,
      maxPendingPerUser: 3,
      checkInTime: '08:00',
      checkOutTime: '22:00',
    },
  });

  return 1;
}

async function seedCategories(prisma: PrismaClient): Promise<number> {
  let created = 0;

  for (const category of CATEGORIES) {
    const existing = await prisma.category.findUnique({ where: { name: category.name } });
    if (existing) continue;

    await prisma.category.create({ data: category });
    created += 1;
  }

  return created;
}

async function seedThemes(prisma: PrismaClient): Promise<number> {
  let created = 0;

  for (const theme of THEMES) {
    const existing = await prisma.theme.findUnique({ where: { slug: theme.slug } });
    if (existing) continue;

    await prisma.theme.create({
      data: {
        slug: theme.slug,
        name: theme.name,
        tagline: theme.tagline,
        description: theme.description,
        // A paleta é Json; o array constante vira mutável para o Prisma aceitar.
        palette: theme.palette.map((color) => ({ ...color })),
        sortOrder: theme.sortOrder,
      },
    });
    created += 1;
  }

  return created;
}

async function seedPriceRules(prisma: PrismaClient): Promise<number> {
  let created = 0;

  for (const rule of PRICE_RULES) {
    // PriceRule não tem chave natural única, então a idempotência é pelo nome.
    const existing = await prisma.priceRule.findFirst({ where: { name: rule.name } });
    if (existing) continue;

    await prisma.priceRule.create({ data: rule });
    created += 1;
  }

  return created;
}

async function seedDemoItems(prisma: PrismaClient): Promise<number> {
  const categories = new Map(
    (await prisma.category.findMany()).map((category) => [category.name, category.id]),
  );
  const themes = new Map((await prisma.theme.findMany()).map((theme) => [theme.slug, theme.id]));

  let created = 0;
  let sortOrder = 0;

  for (const item of DEMO_ITEMS) {
    sortOrder += 1;

    const categoryId = categories.get(item.categoryName);
    if (!categoryId) {
      throw new Error(`Categoria do seed não encontrada: ${item.categoryName}`);
    }

    const existing = await prisma.item.findFirst({ where: { name: item.name } });
    if (existing) continue;

    const themeIds = item.themeSlugs.map((slug) => {
      const themeId = themes.get(slug);
      if (!themeId) throw new Error(`Estilo do seed não encontrado: ${slug}`);
      return themeId;
    });

    await prisma.item.create({
      data: {
        categoryId,
        name: item.name,
        description: item.description,
        priceCents: item.priceCents,
        stock: item.stock,
        assemblyNotes: item.assemblyNotes,
        sortOrder,
        themes: { create: themeIds.map((themeId) => ({ themeId })) },
      },
    });
    created += 1;
  }

  return created;
}

async function seedDemoCombos(prisma: PrismaClient): Promise<number> {
  const items = new Map((await prisma.item.findMany()).map((item) => [item.name, item.id]));
  const themes = new Map((await prisma.theme.findMany()).map((theme) => [theme.slug, theme.id]));

  let created = 0;

  for (const combo of DEMO_COMBOS) {
    const existing = await prisma.combo.findFirst({ where: { name: combo.name } });
    if (existing) continue;

    const comboItems = combo.items.map((line) => {
      const itemId = items.get(line.itemName);
      if (!itemId) throw new Error(`Item do combo não encontrado: ${line.itemName}`);
      return { itemId, quantity: line.quantity };
    });

    await prisma.combo.create({
      data: {
        name: combo.name,
        description: combo.description,
        themeId: themes.get(combo.themeSlug) ?? null,
        discountType: combo.discountType,
        discountValue: combo.discountValue,
        items: { create: comboItems },
      },
    });
    created += 1;
  }

  return created;
}

async function seedDemoGallery(prisma: PrismaClient): Promise<number> {
  let created = 0;

  for (const image of DEMO_GALLERY) {
    const existing = await prisma.galleryImage.findFirst({ where: { url: image.url } });
    if (existing) continue;

    await prisma.galleryImage.create({ data: image });
    created += 1;
  }

  return created;
}
