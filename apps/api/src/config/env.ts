import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

/**
 * Configuração do ambiente (§6).
 *
 * A API não sobe com variável obrigatória faltando: é melhor falhar no start,
 * com a lista do que falta, que descobrir em produção que o e-mail não sai ou
 * que o JWT está assinado com string vazia.
 *
 * O caminho do .env é absoluto porque o processo pode ser iniciado da raiz do
 * monorepo. `dotenv` não sobrescreve variável já definida, então o que vem da
 * plataforma (ou do runner de teste) continua valendo.
 */
loadDotenv({ path: path.join(import.meta.dirname, '..', '..', '.env'), quiet: true });

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3333),

    DATABASE_URL: z.string().min(1, { error: 'Informe a conexão do Postgres.' }),

    // 32 bytes é o piso para HS256 não ser o elo fraco da sessão (§10.1).
    JWT_SECRET: z.string().min(32, { error: 'Use pelo menos 32 caracteres aleatórios.' }),
    JWT_ACCESS_TTL: z.string().default('15m'),
    REFRESH_TTL_DAYS: z.coerce.number().int().min(1).default(30),

    /** URL pública do SPA, usada nos links dos e-mails. */
    APP_URL: z.url().default('http://localhost:5173'),

    /** Só em desenvolvimento: em produção o SPA chama /api no próprio domínio (§10.1). */
    CORS_ORIGIN: z.string().optional(),

    /** Ausente desliga o login com Google, sem quebrar o resto (§10.3). */
    GOOGLE_CLIENT_ID: z.string().optional(),

    /** `log` imprime o e-mail no console; `smtp` envia de verdade (§20.1). */
    MAIL_TRANSPORT: z.enum(['log', 'smtp']).default('log'),
    SMTP_URL: z.string().optional(),
    MAIL_FROM: z.string().default('Chácara <no-reply@localhost>'),

    /** Usadas só pelo seed, para criar o primeiro admin (§8.2). */
    ADMIN_EMAIL: z.string().optional(),
    ADMIN_PASSWORD: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.MAIL_TRANSPORT === 'smtp' && !env.SMTP_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_URL'],
        message: 'Obrigatória quando MAIL_TRANSPORT=smtp.',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (result.success) return result.data;

  const problems = result.error.issues
    .map((issue) => `  ${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
    .join('\n');
  throw new Error(
    `Configuração de ambiente inválida em apps/api/.env:\n${problems}\n` +
      'Confira apps/api/.env.example.',
  );
}

export const env = parseEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
