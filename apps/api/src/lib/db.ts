import type { Prisma, PrismaClient } from '../generated/prisma/client.js';

/**
 * Cliente do Prisma, ou o cliente de dentro de uma transação.
 *
 * Existe porque a conferência de estoque (§9.3) é chamada nos dois contextos: no
 * orçamento, que só lê, e na criação da reserva, que precisa rodar **dentro** da
 * transação que travou as linhas de `Item`. Duplicar a função para aceitar os
 * dois tipos daria duas versões da mesma regra para divergir.
 *
 * O tipo de transação do Prisma não tem `$transaction` nem `$connect`, então
 * quem recebe `Db` fica limitado a ler e escrever — que é exatamente o que um
 * service deve fazer.
 */
export type Db = PrismaClient | Prisma.TransactionClient;
