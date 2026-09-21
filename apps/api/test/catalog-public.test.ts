import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma, truncateAll } from './helpers/db.js';
import {
  createCategory,
  createGalleryImage,
  createItem,
  createTheme,
} from './helpers/factories.js';

/**
 * Vitrine pública do catálogo (§11.2).
 *
 * A regra que atravessa tudo aqui: o cliente só vê o que está ativo. Um item
 * desativado continua no banco por causa das reservas antigas (§11.2), e vazá-lo
 * na vitrine faria o cliente pedir algo que a chácara não oferece mais.
 */
describe('catálogo público', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll();
  });

  describe('GET /themes', () => {
    it('devolve só os estilos ativos, na ordem do admin', async () => {
      await createTheme({ name: 'Segundo', sortOrder: 2 });
      await createTheme({ name: 'Primeiro', sortOrder: 1 });
      await createTheme({ name: 'Escondido', active: false, sortOrder: 0 });

      const response = await app.inject({ method: 'GET', url: '/api/themes' });

      expect(response.statusCode).toBe(200);
      expect(response.json().map((theme: { name: string }) => theme.name)).toEqual([
        'Primeiro',
        'Segundo',
      ]);
    });

    it('entrega a paleta pronta para o cartão de estilo', async () => {
      await createTheme({ name: 'Rústico Boho' });

      const response = await app.inject({ method: 'GET', url: '/api/themes' });

      expect(response.json()[0].palette).toHaveLength(5);
      expect(response.json()[0].palette[0]).toEqual({ name: 'Sálvia', hex: '#A7B8A1' });
    });

    it('marca a resposta como cacheável por pouco tempo', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/themes' });

      expect(response.headers['cache-control']).toBe('public, max-age=60');
    });

    /*
     * Paleta fora do formato só chega no banco por escrita direta, mas é melhor
     * falhar alto do que servir um cartão de estilo com variável de CSS vazia.
     */
    it('recusa servir estilo com paleta inválida', async () => {
      const theme = await createTheme({ name: 'Quebrado' });
      await prisma.theme.update({
        where: { id: theme.id },
        data: { palette: [{ name: 'Só uma', hex: '#000000' }] },
      });

      const response = await app.inject({ method: 'GET', url: '/api/themes' });

      expect(response.statusCode).toBe(500);
      expect(response.json().error.code).toBe('INTERNAL');
    });
  });

  describe('GET /items', () => {
    it('devolve item ativo com categoria e estilos', async () => {
      const category = await createCategory({ name: 'Painéis' });
      const theme = await createTheme({ name: 'Nuvens' });
      await createItem({
        categoryId: category.id,
        name: 'Painel de nuvens',
        priceCents: 18000,
        themeIds: [theme.id],
      });

      const response = await app.inject({ method: 'GET', url: '/api/items' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([
        expect.objectContaining({
          name: 'Painel de nuvens',
          priceCents: 18000,
          category: { id: category.id, name: 'Painéis', sortOrder: 0 },
          themeIds: [theme.id],
        }),
      ]);
    });

    it('esconde item desativado', async () => {
      const category = await createCategory({});
      await createItem({ categoryId: category.id, name: 'Aposentado', active: false });

      const response = await app.inject({ method: 'GET', url: '/api/items' });

      expect(response.json()).toEqual([]);
    });

    it('filtra por estilo', async () => {
      const category = await createCategory({});
      const tropical = await createTheme({ name: 'Tropical' });
      const boho = await createTheme({ name: 'Boho' });
      await createItem({ categoryId: category.id, name: 'Folhagem', themeIds: [tropical.id] });
      await createItem({ categoryId: category.id, name: 'Macramê', themeIds: [boho.id] });

      const response = await app.inject({
        method: 'GET',
        url: `/api/items?themeId=${tropical.id}`,
      });

      expect(response.json().map((item: { name: string }) => item.name)).toEqual(['Folhagem']);
    });

    it('filtra por categoria', async () => {
      const paineis = await createCategory({ name: 'Painéis' });
      const mesas = await createCategory({ name: 'Mesas' });
      await createItem({ categoryId: paineis.id, name: 'Painel redondo' });
      await createItem({ categoryId: mesas.id, name: 'Mesa de doces' });

      const response = await app.inject({
        method: 'GET',
        url: `/api/items?categoryId=${mesas.id}`,
      });

      expect(response.json().map((item: { name: string }) => item.name)).toEqual(['Mesa de doces']);
    });

    /*
     * A vitrine agrupa por categoria, então a ordem da categoria manda. Sem o
     * nome como último critério a lista mudaria de ordem entre consultas, porque
     * `sortOrder` nasce 0 em todo item.
     */
    it('ordena por categoria, depois pela ordem do item e pelo nome', async () => {
      const primeira = await createCategory({ name: 'Painéis', sortOrder: 1 });
      const segunda = await createCategory({ name: 'Mesas', sortOrder: 2 });
      await createItem({ categoryId: segunda.id, name: 'Mesa alta' });
      await createItem({ categoryId: primeira.id, name: 'Painel B' });
      await createItem({ categoryId: primeira.id, name: 'Painel A' });

      const response = await app.inject({ method: 'GET', url: '/api/items' });

      expect(response.json().map((item: { name: string }) => item.name)).toEqual([
        'Painel A',
        'Painel B',
        'Mesa alta',
      ]);
    });

    it('recusa filtro que não é identificador', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/items?themeId=abc' });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      expect(response.json().error.details.context).toBe('querystring');
    });
  });

  describe('GET /categories', () => {
    it('devolve as categorias na ordem do admin, inclusive as vazias', async () => {
      await createCategory({ name: 'Iluminação', sortOrder: 2 });
      await createCategory({ name: 'Painéis', sortOrder: 1 });

      const response = await app.inject({ method: 'GET', url: '/api/categories' });

      expect(response.json().map((category: { name: string }) => category.name)).toEqual([
        'Painéis',
        'Iluminação',
      ]);
    });
  });

  describe('GET /gallery', () => {
    it('devolve as imagens ativas na ordem definida', async () => {
      await createGalleryImage({ alt: 'Segunda foto', sortOrder: 2 });
      await createGalleryImage({ alt: 'Primeira foto', sortOrder: 1 });
      await createGalleryImage({ alt: 'Foto arquivada', active: false, sortOrder: 0 });

      const response = await app.inject({ method: 'GET', url: '/api/gallery' });

      expect(response.json().map((image: { alt: string }) => image.alt)).toEqual([
        'Primeira foto',
        'Segunda foto',
      ]);
    });

    it('filtra por seção', async () => {
      await createGalleryImage({ kind: 'HERO', alt: 'Capa da página' });
      await createGalleryImage({ kind: 'EVENTS', alt: 'Festa realizada' });

      const response = await app.inject({ method: 'GET', url: '/api/gallery?kind=HERO' });

      expect(response.json().map((image: { alt: string }) => image.alt)).toEqual([
        'Capa da página',
      ]);
    });

    it('recusa seção que não existe', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/gallery?kind=FACHADA' });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    });
  });
});
