import { createHash, randomBytes } from 'node:crypto';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { TokenType } from '../generated/prisma/enums.js';
import { AppError } from './errors.js';

/**
 * Tokens de confirmação de e-mail e redefinição de senha (§10.2 e §10.5).
 *
 * O valor em claro existe **uma vez**, no momento em que vai para o e-mail. O
 * banco guarda só o hash SHA-256 (§10.1): quem vaze o banco não consegue
 * confirmar conta nem trocar senha de ninguém.
 *
 * SHA-256 sem salt é suficiente aqui, ao contrário de senha. O token tem 256 bits
 * de entropia aleatória, então não há dicionário nem tabela para consultar — o
 * custo alto do argon2 protegeria contra força bruta em segredo fraco, que não é
 * o caso.
 */

const TOKEN_BYTES = 32;

/** Validade por tipo, em milissegundos. */
export const TOKEN_TTL_MS: Record<TokenType, number> = {
  EMAIL_VERIFY: 24 * 60 * 60 * 1000, // 24 h (§10.2)
  PASSWORD_RESET: 60 * 60 * 1000, // 1 h (§10.5)
};

export function generateToken(): string {
  // base64url para o valor caber numa URL sem escape.
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type IssueTokenInput = {
  userId: string;
  type: TokenType;
  now?: Date;
};

/**
 * Cria um token e devolve o valor em claro para quem vai montar o e-mail.
 *
 * Tokens anteriores do mesmo tipo que ainda não foram usados são marcados como
 * usados: depois de um reenvio, só o link mais novo vale. Sem isso, um pedido de
 * redefinição antigo continuaria aberto na caixa de entrada.
 */
export async function issueAuthToken(
  prisma: PrismaClient,
  { userId, type, now = new Date() }: IssueTokenInput,
): Promise<string> {
  const token = generateToken();

  await prisma.$transaction([
    prisma.authToken.updateMany({
      where: { userId, type, usedAt: null },
      data: { usedAt: now },
    }),
    prisma.authToken.create({
      data: {
        userId,
        type,
        tokenHash: hashToken(token),
        expiresAt: new Date(now.getTime() + TOKEN_TTL_MS[type]),
      },
    }),
  ]);

  return token;
}

export type ConsumeTokenInput = {
  token: string;
  type: TokenType;
  now?: Date;
};

/**
 * Gasta o token e devolve de quem ele é.
 *
 * O uso único vem de um único `UPDATE` com a guarda no `WHERE`: duas requisições
 * simultâneas com o mesmo token disputam a mesma linha, e só uma vê `count === 1`.
 * Conferir antes e atualizar depois deixaria uma janela entre a leitura e a
 * escrita.
 *
 * Token inexistente, expirado e já usado dão o mesmo erro de propósito: distinguir
 * os casos contaria a um atacante que o token existe.
 */
export async function consumeAuthToken(
  prisma: PrismaClient,
  { token, type, now = new Date() }: ConsumeTokenInput,
): Promise<{ userId: string }> {
  const tokenHash = hashToken(token);

  const spent = await prisma.authToken.updateMany({
    where: { tokenHash, type, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });

  if (spent.count === 0) {
    throw new AppError('INVALID_TOKEN', 400, 'Este link expirou ou já foi usado. Peça um novo.');
  }

  const consumed = await prisma.authToken.findUnique({
    where: { tokenHash },
    select: { userId: true },
  });

  if (!consumed) {
    throw new AppError('INVALID_TOKEN', 400, 'Este link expirou ou já foi usado. Peça um novo.');
  }

  return { userId: consumed.userId };
}
