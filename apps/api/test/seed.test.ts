import { SEEDED_THEME_SLUGS, paletteSchema } from '@chacara/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { verifyPassword } from '../src/lib/password.js';
import { THEMES } from '../src/seed/data.js';
import { type SeedLogger, type SeedSummary, runSeed } from '../src/seed/index.js';
import { prisma, truncateAll } from './helpers/db.js';

function createLogger(): SeedLogger & { warnings: string[] } {
  const warnings: string[] = [];
  return {
    warnings,
    info: () => {},
    warn: (_obj, msg) => {
      warnings.push(msg);
    },
  };
}

const ADMIN = { email: 'admin@chacara.local', password: 'senha-de-teste-123' };

function seed(options: { demo?: boolean; logger?: SeedLogger } = {}): Promise<SeedSummary> {
  return runSeed({
    prisma,
    logger: options.logger ?? createLogger(),
    demo: options.demo ?? false,
    admin: ADMIN,
  });
}

describe('seed', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  describe('idempotência (§8.2)', () => {
    it('cria tudo na primeira execução e nada na segunda', async () => {
      const first = await seed({ demo: true });
      expect(first).toEqual({
        admins: 1,
        settings: 1,
        categories: 5,
        themes: 12,
        priceRules: 3,
        items: 8,
        combos: 3,
        galleryImages: 4,
      });

      const second = await seed({ demo: true });
      expect(second).toEqual({
        admins: 0,
        settings: 0,
        categories: 0,
        themes: 0,
        priceRules: 0,
        items: 0,
        combos: 0,
        galleryImages: 0,
      });
    });

    it('não duplica registro ao rodar duas vezes', async () => {
      await seed({ demo: true });
      await seed({ demo: true });

      expect(await prisma.theme.count()).toBe(12);
      expect(await prisma.category.count()).toBe(5);
      expect(await prisma.item.count()).toBe(8);
      expect(await prisma.user.count()).toBe(1);
      expect(await prisma.venueSettings.count()).toBe(1);
    });

    // O admin ajusta preço e nome de estilo pelo painel; o seed não pode desfazer.
    it('não sobrescreve o que o admin editou', async () => {
      await seed();
      await prisma.venueSettings.update({
        where: { id: 1 },
        data: { name: 'Nome escolhido pelo dono', baseDailyPriceCents: 999_00 },
      });
      await prisma.theme.update({
        where: { slug: 'tropical' },
        data: { name: 'Verão na chácara' },
      });

      await seed();

      const settings = await prisma.venueSettings.findUniqueOrThrow({ where: { id: 1 } });
      expect(settings.name).toBe('Nome escolhido pelo dono');
      expect(settings.baseDailyPriceCents).toBe(999_00);

      const theme = await prisma.theme.findUniqueOrThrow({ where: { slug: 'tropical' } });
      expect(theme.name).toBe('Verão na chácara');
    });
  });

  describe('admin', () => {
    it('nasce com papel ADMIN, e-mail verificado e senha conferível', async () => {
      await seed();

      const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN.email } });
      expect(admin.role).toBe('ADMIN');
      expect(admin.emailVerifiedAt).not.toBeNull();
      expect(admin.termsAcceptedAt).not.toBeNull();
      expect(await verifyPassword(admin.passwordHash ?? '', ADMIN.password)).toBe(true);
    });

    it('não guarda a senha em texto puro', async () => {
      await seed();

      const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN.email } });
      expect(admin.passwordHash).not.toBe(ADMIN.password);
      expect(admin.passwordHash).toMatch(/^\$argon2id\$/);
    });

    it('avisa em vez de promover conta existente que não é admin', async () => {
      await prisma.user.create({ data: { name: 'Cliente', email: ADMIN.email } });
      const logger = createLogger();

      const summary = await seed({ logger });

      expect(summary.admins).toBe(0);
      expect(logger.warnings.join(' ')).toMatch(/não é admin/);
      const user = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN.email } });
      expect(user.role).toBe('CLIENT');
    });

    it('avisa e segue quando não há credencial de admin', async () => {
      const logger = createLogger();

      const summary = await runSeed({ prisma, logger, admin: undefined });

      expect(summary.admins).toBe(0);
      expect(summary.themes).toBe(12);
      expect(logger.warnings.join(' ')).toMatch(/ADMIN_EMAIL/);
    });
  });

  describe('estilos (§15.2)', () => {
    it('cria os 12 estilos com a paleta de 5 cores válida', async () => {
      await seed();

      const themes = await prisma.theme.findMany();
      expect(themes).toHaveLength(12);

      for (const theme of themes) {
        const palette = paletteSchema.safeParse(theme.palette);
        expect(palette.success, `paleta inválida em ${theme.slug}`).toBe(true);
      }
    });

    it('usa os mesmos slugs que o packages/shared sugere por tipo de evento', async () => {
      await seed();

      const slugs = (await prisma.theme.findMany()).map((theme) => theme.slug).sort();
      expect(slugs).toEqual([...SEEDED_THEME_SLUGS].sort());
    });

    it('cria todo estilo ativo e com tagline', async () => {
      await seed();

      for (const theme of await prisma.theme.findMany()) {
        expect(theme.active).toBe(true);
        expect(theme.tagline).toBeTruthy();
      }
    });

    // §14.9: sem foto real, a UI usa bloco chapado com a paleta. Foto de banco
    // de imagens é proibida, então a capa nasce vazia.
    it('deixa a capa vazia para a UI cair no bloco de cor', async () => {
      await seed();

      for (const theme of await prisma.theme.findMany()) {
        expect(theme.coverImageUrl).toBeNull();
      }
    });
  });

  describe('configurações da chácara', () => {
    it('cria a linha única com limites coerentes', async () => {
      await seed();

      const settings = await prisma.venueSettings.findUniqueOrThrow({ where: { id: 1 } });
      expect(settings.id).toBe(1);
      expect(settings.minDays).toBeLessThanOrEqual(settings.maxDays);
      expect(settings.baseDailyPriceCents).toBeGreaterThan(0);
      expect(settings.maxGuests).toBeGreaterThan(0);
      expect(settings.holdHours).toBeGreaterThan(0);
    });

    // §16.6: telefone, endereço e regras da casa são fatos do negócio e o seed
    // não inventa fato. Ficam para o dono preencher.
    it('não inventa contato nem regra da casa', async () => {
      await seed();

      const settings = await prisma.venueSettings.findUniqueOrThrow({ where: { id: 1 } });
      expect(settings.whatsapp).toBeNull();
      expect(settings.address).toBeNull();
      expect(settings.houseRules).toBeNull();
    });
  });

  describe('catálogo de demonstração', () => {
    it('não cria item algum sem SEED_DEMO', async () => {
      const summary = await seed({ demo: false });

      expect(summary.items).toBe(0);
      expect(await prisma.item.count()).toBe(0);
      expect(await prisma.combo.count()).toBe(0);
      expect(await prisma.galleryImage.count()).toBe(0);
    });

    it('liga cada item a categoria e a pelo menos um estilo', async () => {
      await seed({ demo: true });

      const items = await prisma.item.findMany({ include: { themes: true, category: true } });
      expect(items).toHaveLength(8);

      for (const item of items) {
        expect(item.category.name).toBeTruthy();
        expect(item.themes.length).toBeGreaterThan(0);
        expect(item.priceCents).toBeGreaterThan(0);
        expect(item.stock).toBeGreaterThan(0);
        expect(item.active).toBe(true);
      }
    });

    it('monta combos com itens reais e desconto dentro da faixa', async () => {
      await seed({ demo: true });

      const combos = await prisma.combo.findMany({ include: { items: true } });
      expect(combos).toHaveLength(3);

      for (const combo of combos) {
        expect(combo.items.length).toBeGreaterThan(1);
        if (combo.discountType === 'PERCENT') {
          expect(combo.discountValue).toBeGreaterThanOrEqual(1);
          expect(combo.discountValue).toBeLessThanOrEqual(100);
        } else {
          expect(combo.discountValue).toBeGreaterThan(0);
        }
      }
    });

    // §14.9: texto alternativo é obrigatório e descritivo, nunca vazio.
    it('exige texto alternativo em toda imagem da galeria', async () => {
      await seed({ demo: true });

      for (const image of await prisma.galleryImage.findMany()) {
        expect(image.alt.length).toBeGreaterThan(10);
      }
    });
  });
});

describe('dados do seed', () => {
  // Falha aqui significa que alguém mexeu na lista de estilos e esqueceu o
  // packages/shared, e o wizard passaria a sugerir um slug que não existe.
  it('declara exatamente os slugs que o packages/shared conhece', () => {
    expect(THEMES.map((theme) => theme.slug).sort()).toEqual([...SEEDED_THEME_SLUGS].sort());
  });

  it('não repete slug nem ordem de exibição', () => {
    expect(new Set(THEMES.map((theme) => theme.slug)).size).toBe(THEMES.length);
    expect(new Set(THEMES.map((theme) => theme.sortOrder)).size).toBe(THEMES.length);
  });
});
