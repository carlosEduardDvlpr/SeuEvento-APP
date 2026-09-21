import type {
  AdminGalleryImage,
  CreateGalleryImageBody,
  GalleryImage,
  GalleryQuery,
  ReorderGalleryBody,
  UpdateGalleryImageBody,
} from '@chacara/shared';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { GalleryImageModel } from '../../generated/prisma/models.js';
import { AppError } from '../../lib/errors.js';

/**
 * Galeria de fotos (§11.2, §13).
 *
 * `alt` é obrigatório no banco e no schema: a foto é o principal ativo da landing
 * (§14.9) e imagem sem descrição deixa de fora quem usa leitor de tela (§18).
 */

/** `id` desempata porque `GalleryImage` não tem `createdAt` para ordenar. */
const GALLERY_ORDER = [{ sortOrder: 'asc' as const }, { id: 'asc' as const }];

function toGalleryImage(row: GalleryImageModel): GalleryImage {
  return {
    id: row.id,
    kind: row.kind,
    url: row.url,
    alt: row.alt,
    caption: row.caption,
    sortOrder: row.sortOrder,
  };
}

function toAdminGalleryImage(row: GalleryImageModel): AdminGalleryImage {
  return { ...toGalleryImage(row), active: row.active };
}

export async function listPublicGallery(
  prisma: PrismaClient,
  query: GalleryQuery,
): Promise<GalleryImage[]> {
  const rows = await prisma.galleryImage.findMany({
    where: { active: true, ...(query.kind ? { kind: query.kind } : {}) },
    orderBy: GALLERY_ORDER,
  });

  return rows.map(toGalleryImage);
}

/**
 * Lista do admin: tudo, inclusive desativado, e **sem paginar**.
 *
 * Reordenar exige ver a seção inteira; uma página parcial produziria ordem errada
 * ao salvar.
 */
export async function listAdminGallery(prisma: PrismaClient): Promise<AdminGalleryImage[]> {
  const rows = await prisma.galleryImage.findMany({ orderBy: GALLERY_ORDER });
  return rows.map(toAdminGalleryImage);
}

export async function createGalleryImage(
  prisma: PrismaClient,
  body: CreateGalleryImageBody,
): Promise<AdminGalleryImage> {
  const row = await prisma.galleryImage.create({ data: body });
  return toAdminGalleryImage(row);
}

export async function updateGalleryImage(
  prisma: PrismaClient,
  id: string,
  body: UpdateGalleryImageBody,
): Promise<AdminGalleryImage> {
  await findImageOrThrow(prisma, id);

  const row = await prisma.galleryImage.update({ where: { id }, data: body });
  return toAdminGalleryImage(row);
}

/** Imagem não aparece em reserva nem em combo, então exclusão aqui é exclusão. */
export async function deleteGalleryImage(prisma: PrismaClient, id: string): Promise<void> {
  await findImageOrThrow(prisma, id);
  await prisma.galleryImage.delete({ where: { id } });
}

/**
 * Grava a nova ordem de uma seção.
 *
 * Exige a lista completa da seção e recusa lista divergente: tela aberta há
 * algum tempo, sem a imagem que outra aba acabou de criar, mandaria essa imagem
 * para o começo da seção sem ninguém ter pedido. Pedir para recarregar é melhor
 * que reordenar errado em silêncio.
 */
export async function reorderGallery(
  prisma: PrismaClient,
  { kind, ids }: ReorderGalleryBody,
): Promise<AdminGalleryImage[]> {
  const current = await prisma.galleryImage.findMany({ where: { kind }, select: { id: true } });
  const expected = new Set(current.map((row) => row.id));
  const received = new Set(ids);

  const matches =
    received.size === ids.length &&
    received.size === expected.size &&
    ids.every((id) => expected.has(id));

  if (!matches) {
    throw new AppError(
      'VALIDATION_ERROR',
      400,
      'A lista de imagens mudou. Recarregue a página e ordene de novo.',
      { expected: expected.size, received: ids.length },
    );
  }

  // Tudo numa transação: ordem gravada pela metade deixaria duas imagens na
  // mesma posição.
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.galleryImage.update({ where: { id }, data: { sortOrder: index } }),
    ),
  );

  return listAdminGallery(prisma);
}

async function findImageOrThrow(prisma: PrismaClient, id: string) {
  const row = await prisma.galleryImage.findUnique({ where: { id } });

  if (!row) throw new AppError('NOT_FOUND', 404, 'Imagem não encontrada.');

  return row;
}
