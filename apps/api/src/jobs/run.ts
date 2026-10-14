import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';
import { logger } from '../lib/logger.js';
import { runCompleteBookings } from './complete-bookings.js';
import { runExpireHolds } from './expire-holds.js';

/**
 * Entrada dos jobs (§9.9, §20).
 *
 * Um runner só, e não um arquivo executável por job: conectar, desconectar,
 * registrar o resumo e sair com o código certo é a mesma coisa nos dois, e
 * duplicar isso seria duplicar o jeito de errar.
 *
 * A lógica vive nos módulos ao lado, sem efeito algum ao serem importados, para
 * os testes chamarem as funções contra o banco de teste sem abrir processo —
 * mesmo arranjo do seed.
 *
 * Os jobs rodam por **Cron Job da plataforma**, nunca dentro do processo da API:
 * um agendador em memória rodaria duas vezes com duas instâncias no ar, e pararia
 * junto com o servidor.
 */

const JOBS = {
  'expire-holds': runExpireHolds,
  'complete-bookings': runCompleteBookings,
} as const;

type JobName = keyof typeof JOBS;

function isJobName(value: string | undefined): value is JobName {
  return value !== undefined && value in JOBS;
}

const name = process.argv[2];

if (!isJobName(name)) {
  logger.error(
    { received: name, available: Object.keys(JOBS) },
    'Informe o nome do job como primeiro argumento',
  );
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

try {
  const startedAt = Date.now();
  const summary = await JOBS[name]({ prisma });

  // Resumo em uma linha estruturada: é o que a plataforma coleta e o que permite
  // notar um job que parou de fazer trabalho.
  logger.info({ job: name, durationMs: Date.now() - startedAt, ...summary }, 'Job concluído');
} catch (error) {
  /*
   * Código de saída diferente de zero é o que faz o cron da plataforma marcar a
   * execução como falha. Sem isso, um job quebrado passaria semanas em silêncio.
   */
  logger.error({ err: error, job: name }, 'Job falhou');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
