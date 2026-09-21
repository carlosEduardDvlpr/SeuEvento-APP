import { afterAll } from 'vitest';
import { prisma } from './helpers/db.js';

/**
 * Fecha a conexão compartilhada ao fim de cada arquivo de teste.
 *
 * O `prisma` de `helpers/db.ts` é estado de módulo, então cada arquivo abre um
 * pool do `pg`. Pool aberto é handle ativo no event loop: sem isto, a suíte
 * termina de rodar mas o processo não encerra, e o runner fica pendurado depois
 * de imprimir o resultado.
 */
afterAll(async () => {
  await prisma.$disconnect();
});
