import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { slugify } from '../src/modules/themes/service.js';
import { prisma, truncateAll } from './helpers/db.js';
import {
  PALETTE,
  createBooking,
  createCategory,
  createCombo,
  createGalleryImage,
  createItem,
  createTheme,
  createUser,
} from './helpers/factories.js';

/**
 * CRUD do catálogo pelo painel (§11.2).
 *
 * O critério de aceite da Fase 3 é o dono criar item, estilo e combo sem ajuda de
 * desenvolvedor, então o que está sob teste aqui é o que dá errado na mão de quem
 * opera: nome repetido, id que não existe, campo esvaziado no formulário e
 * exclusão de coisa que já foi usada.
 */
describe('catálogo pelo admin', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let clientToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll();

    const admin = await createUser({ email: 'dono@chacara.local', role: 'ADMIN' });
    const client = await createUser({ email: 'cliente@exemplo.com' });

    adminToken = app.jwt.sign({ sub: admin.id, role: admin.role });
    clientToken = app.jwt.sign({ sub: client.id, role: client.role });
  });

  function asAdmin(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    payload?: Record<string, unknown>,
  ) {
    return app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${adminToken}` },
      payload,
    });
  }

  describe('autorização', () => {
    it('recusa quem não está autenticado', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/admin/items' });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHORIZED');
    });

    it('recusa cliente autenticado', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/items',
        headers: { authorization: `Bearer ${clientToken}` },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('FORBIDDEN');
    });

    /*
     * A guarda está num hook do plugin de `/admin`, não rota por rota. Este teste
     * cobre o recurso mais recente para provar que rota nova nasce protegida.
     */
    it('protege a galeria pelo mesmo hook', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/admin/gallery' });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('categorias', () => {
    it('cria e devolve 201', async () => {
      const response = await asAdmin('POST', '/api/admin/categories', {
        name: 'Iluminação',
        sortOrder: 3,
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual(
        expect.objectContaining({ name: 'Iluminação', sortOrder: 3 }),
      );
    });

    it('aponta o campo quando o nome já existe', async () => {
      await createCategory({ name: 'Painéis' });

      const response = await asAdmin('POST', '/api/admin/categories', { name: 'Painéis' });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      expect(response.json().error.details.fields).toEqual([
        { field: 'name', message: 'Já existe uma categoria com esse nome.' },
      ]);
    });

    /*
     * Categoria não tem `active`: ela é a gaveta onde o item mora. Desativar com
     * item dentro deixaria o item sem lugar na vitrine, então a saída é recusar e
     * explicar o que fazer.
     */
    it('recusa excluir categoria com itens e diz quantos são', async () => {
      const category = await createCategory({ name: 'Mesas' });
      await createItem({ categoryId: category.id });

      const response = await asAdmin('DELETE', `/api/admin/categories/${category.id}`);

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details.itemCount).toBe(1);
      expect(await prisma.category.count()).toBe(1);
    });

    it('exclui categoria vazia', async () => {
      const category = await createCategory({ name: 'Sobrou' });

      const response = await asAdmin('DELETE', `/api/admin/categories/${category.id}`);

      expect(response.statusCode).toBe(204);
      expect(await prisma.category.count()).toBe(0);
    });

    it('devolve 404 para categoria que não existe', async () => {
      const response = await asAdmin(
        'PATCH',
        '/api/admin/categories/00000000-0000-4000-8000-000000000000',
        { name: 'Qualquer' },
      );

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('NOT_FOUND');
    });
  });

  describe('estilos', () => {
    const newTheme = {
      name: 'Rústico Boho',
      tagline: 'Madeira, macramê e flores secas',
      palette: PALETTE,
    };

    it('deriva o slug do nome, sem acento', async () => {
      const response = await asAdmin('POST', '/api/admin/themes', newTheme);

      expect(response.statusCode).toBe(201);
      expect(response.json().slug).toBe('rustico-boho');
      expect(slugify('Nuvens & Estrelas')).toBe('nuvens-estrelas');
    });

    it('acrescenta sufixo quando o slug já está tomado', async () => {
      await asAdmin('POST', '/api/admin/themes', newTheme);

      const response = await asAdmin('POST', '/api/admin/themes', newTheme);

      expect(response.statusCode).toBe(201);
      expect(response.json().slug).toBe('rustico-boho-2');
    });

    /* O slug é o endereço do estilo na vitrine: renomear não pode quebrar link. */
    it('mantém o slug quando o nome muda', async () => {
      const created = await asAdmin('POST', '/api/admin/themes', newTheme);

      const response = await asAdmin('PATCH', `/api/admin/themes/${created.json().id}`, {
        name: 'Boho Rústico',
      });

      expect(response.json()).toEqual(
        expect.objectContaining({ name: 'Boho Rústico', slug: 'rustico-boho' }),
      );
    });

    it('exige exatamente cinco cores na paleta', async () => {
      const response = await asAdmin('POST', '/api/admin/themes', {
        ...newTheme,
        palette: PALETTE.slice(0, 4),
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details.fields[0].field).toBe('palette');
    });

    it('esvaziar a tagline no formulário grava nulo, não string vazia', async () => {
      const created = await asAdmin('POST', '/api/admin/themes', newTheme);

      const response = await asAdmin('PATCH', `/api/admin/themes/${created.json().id}`, {
        tagline: '',
      });

      expect(response.json().tagline).toBeNull();
    });

    it('lista inclusive o que está desativado', async () => {
      await createTheme({ name: 'Fora do ar', active: false });

      const response = await asAdmin('GET', '/api/admin/themes');

      expect(response.json()).toEqual([expect.objectContaining({ active: false })]);
    });

    it('exclui de verdade o estilo que ninguém usou', async () => {
      const theme = await createTheme({ name: 'Criado por engano' });

      const response = await asAdmin('DELETE', `/api/admin/themes/${theme.id}`);

      expect(response.json()).toEqual({ outcome: 'deleted' });
      expect(await prisma.theme.count()).toBe(0);
    });

    /*
     * O vínculo item-estilo apaga em cascata, então o banco deixaria a exclusão
     * passar e levaria embora a curadoria em silêncio.
     */
    it('desativa o estilo que já tem item vinculado', async () => {
      const category = await createCategory({});
      const theme = await createTheme({ name: 'Com itens' });
      await createItem({ categoryId: category.id, themeIds: [theme.id] });

      const response = await asAdmin('DELETE', `/api/admin/themes/${theme.id}`);

      expect(response.json()).toEqual({ outcome: 'deactivated' });
      expect(await prisma.theme.findUnique({ where: { id: theme.id } })).toMatchObject({
        active: false,
      });
    });

    it('desativa o estilo que já tem combo', async () => {
      const theme = await createTheme({ name: 'Com combo' });
      await createCombo({ themeId: theme.id });

      const response = await asAdmin('DELETE', `/api/admin/themes/${theme.id}`);

      expect(response.json()).toEqual({ outcome: 'deactivated' });
    });
  });

  describe('itens', () => {
    it('cria com estilos e devolve a forma da vitrine', async () => {
      const category = await createCategory({ name: 'Painéis' });
      const theme = await createTheme({ name: 'Nuvens' });

      const response = await asAdmin('POST', '/api/admin/items', {
        categoryId: category.id,
        name: 'Painel de nuvens',
        priceCents: 18000,
        stock: 2,
        themeIds: [theme.id],
        assemblyNotes: 'Fixe com fita dupla face nos cantos.',
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual(
        expect.objectContaining({
          name: 'Painel de nuvens',
          category: expect.objectContaining({ name: 'Painéis' }),
          themeIds: [theme.id],
          active: true,
        }),
      );
    });

    /* Id inexistente viraria violação de chave estrangeira, ou seja, um 500. */
    it('aponta o campo quando a categoria não existe', async () => {
      const response = await asAdmin('POST', '/api/admin/items', {
        categoryId: '00000000-0000-4000-8000-000000000000',
        name: 'Sem gaveta',
        priceCents: 1000,
        stock: 1,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details.fields).toEqual([
        { field: 'categoryId', message: 'Escolha uma categoria da lista.' },
      ]);
    });

    it('aponta o campo quando um estilo não existe', async () => {
      const category = await createCategory({});

      const response = await asAdmin('POST', '/api/admin/items', {
        categoryId: category.id,
        name: 'Item solto',
        priceCents: 1000,
        stock: 1,
        themeIds: ['00000000-0000-4000-8000-000000000000'],
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details.fields[0].field).toBe('themeIds');
    });

    /* O formulário manda a seleção completa: ausente significa desmarcado. */
    it('substitui os estilos em vez de somar', async () => {
      const category = await createCategory({});
      const antigo = await createTheme({ name: 'Antigo' });
      const novo = await createTheme({ name: 'Novo' });
      const item = await createItem({ categoryId: category.id, themeIds: [antigo.id] });

      const response = await asAdmin('PATCH', `/api/admin/items/${item.id}`, {
        themeIds: [novo.id],
      });

      expect(response.json().themeIds).toEqual([novo.id]);
    });

    it('ignora estilo repetido na seleção', async () => {
      const category = await createCategory({});
      const theme = await createTheme({});

      const response = await asAdmin('POST', '/api/admin/items', {
        categoryId: category.id,
        name: 'Repetido',
        priceCents: 1000,
        stock: 1,
        themeIds: [theme.id, theme.id],
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().themeIds).toEqual([theme.id]);
    });

    it('recusa endereço de imagem que não é http nem caminho do site', async () => {
      const category = await createCategory({});

      const response = await asAdmin('POST', '/api/admin/items', {
        categoryId: category.id,
        name: 'Com link suspeito',
        priceCents: 1000,
        stock: 1,
        imageUrl: 'javascript:alert(1)',
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details.fields[0].field).toBe('imageUrl');
    });

    it('aceita caminho do próprio site como imagem', async () => {
      const category = await createCategory({});

      const response = await asAdmin('POST', '/api/admin/items', {
        categoryId: category.id,
        name: 'Com imagem local',
        priceCents: 1000,
        stock: 1,
        imageUrl: '/imagens/painel.webp',
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().imageUrl).toBe('/imagens/painel.webp');
    });

    it('pagina a lista do painel', async () => {
      const category = await createCategory({});
      for (const name of ['A', 'B', 'C']) {
        await createItem({ categoryId: category.id, name });
      }

      const response = await asAdmin('GET', '/api/admin/items?page=2&pageSize=2');

      expect(response.json()).toEqual({
        items: [expect.objectContaining({ name: 'C' })],
        total: 3,
        page: 2,
        pageSize: 2,
      });
    });

    it('exclui de verdade o item que ninguém usou', async () => {
      const category = await createCategory({});
      const item = await createItem({ categoryId: category.id });

      const response = await asAdmin('DELETE', `/api/admin/items/${item.id}`);

      expect(response.json()).toEqual({ outcome: 'deleted' });
      expect(await prisma.item.count()).toBe(0);
    });

    /* Reserva antiga precisa continuar mostrando o que o cliente levou. */
    it('desativa o item que já apareceu em reserva', async () => {
      const category = await createCategory({});
      const item = await createItem({ categoryId: category.id, name: 'Painel usado' });
      const user = await createUser({ email: 'ana@exemplo.com' });
      const booking = await createBooking({
        userId: user.id,
        startDate: '2026-12-05',
        endDate: '2026-12-06',
      });
      await prisma.bookingItem.create({
        data: {
          bookingId: booking.id,
          itemId: item.id,
          itemName: item.name,
          quantity: 1,
          unitPriceCents: item.priceCents,
        },
      });

      const response = await asAdmin('DELETE', `/api/admin/items/${item.id}`);

      expect(response.json()).toEqual({ outcome: 'deactivated' });
      expect(await prisma.item.findUnique({ where: { id: item.id } })).toMatchObject({
        active: false,
      });
    });

    /* Apagar mudaria a definição do combo sem o dono pedir. */
    it('desativa o item que está em combo', async () => {
      const category = await createCategory({});
      const item = await createItem({ categoryId: category.id });
      await createCombo({ itemIds: [item.id] });

      const response = await asAdmin('DELETE', `/api/admin/items/${item.id}`);

      expect(response.json()).toEqual({ outcome: 'deactivated' });
    });
  });

  describe('galeria', () => {
    const newImage = {
      kind: 'EVENTS' as const,
      url: 'https://exemplo.com/festa.webp',
      alt: 'Mesa de doces montada sob o arco de balões',
    };

    it('cria com texto alternativo', async () => {
      const response = await asAdmin('POST', '/api/admin/gallery', newImage);

      expect(response.statusCode).toBe(201);
      expect(response.json().alt).toBe(newImage.alt);
    });

    /* Foto sem descrição deixa de fora quem usa leitor de tela (§18). */
    it('recusa imagem sem texto alternativo', async () => {
      const response = await asAdmin('POST', '/api/admin/gallery', { ...newImage, alt: '' });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details.fields[0].field).toBe('alt');
    });

    it('grava a ordem que o painel enviou', async () => {
      const primeira = await createGalleryImage({ kind: 'EVENTS', alt: 'Foto A' });
      const segunda = await createGalleryImage({ kind: 'EVENTS', alt: 'Foto B' });

      const response = await asAdmin('PATCH', '/api/admin/gallery/order', {
        kind: 'EVENTS',
        ids: [segunda.id, primeira.id],
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().map((image: { alt: string }) => image.alt)).toEqual([
        'Foto B',
        'Foto A',
      ]);
    });

    /*
     * Tela aberta há algum tempo, sem a imagem que outra aba acabou de criar,
     * mandaria essa imagem para o começo da seção sem ninguém ter pedido.
     */
    it('recusa ordem que não cobre a seção inteira', async () => {
      const primeira = await createGalleryImage({ kind: 'EVENTS', alt: 'Foto A' });
      await createGalleryImage({ kind: 'EVENTS', alt: 'Foto nova de outra aba' });

      const response = await asAdmin('PATCH', '/api/admin/gallery/order', {
        kind: 'EVENTS',
        ids: [primeira.id],
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details).toEqual({ expected: 2, received: 1 });
    });

    it('recusa ordem com imagem de outra seção', async () => {
      const doEvento = await createGalleryImage({ kind: 'EVENTS', alt: 'Foto A' });
      const daChacara = await createGalleryImage({ kind: 'VENUE', alt: 'Foto B' });

      const response = await asAdmin('PATCH', '/api/admin/gallery/order', {
        kind: 'EVENTS',
        ids: [doEvento.id, daChacara.id],
      });

      expect(response.statusCode).toBe(400);
    });

    it('exclui imagem', async () => {
      const image = await createGalleryImage({ alt: 'Foto a descartar' });

      const response = await asAdmin('DELETE', `/api/admin/gallery/${image.id}`);

      expect(response.statusCode).toBe(204);
      expect(await prisma.galleryImage.count()).toBe(0);
    });
  });
});
