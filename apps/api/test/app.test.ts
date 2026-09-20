import { emailSchema } from '@chacara/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildApp, type LogSink } from '../src/app.js';

/** Coleta as linhas que o pino escreveria, para inspecionar o log no teste. */
function createLogSink(): LogSink & { text(): string } {
  const lines: string[] = [];
  return {
    write(line: string) {
      lines.push(line);
    },
    text() {
      return lines.join('\n');
    },
  };
}

describe('aplicação Fastify', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();

    // Rota de sonda registrada só aqui: exercita o compilador de validação do
    // Zod e o handler de erro, que é o que esta tarefa entrega.
    app.withTypeProvider<ZodTypeProvider>().post(
      '/api/__probe/echo',
      {
        schema: {
          body: z.object({ email: emailSchema, guestCount: z.number().int().min(1) }),
          response: { 200: z.object({ email: z.string(), guestCount: z.number() }) },
        },
      },
      async (request) => request.body,
    );

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/health', () => {
    it('responde 200 e confirma a conexão com o banco', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/health' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ok', database: 'up' });
    });

    it('vive sob o prefixo /api', async () => {
      const response = await app.inject({ method: 'GET', url: '/health' });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('formato de erro da §11.1', () => {
    it('devolve NOT_FOUND no envelope padrão para rota inexistente', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/nao-existe' });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({
        error: { code: 'NOT_FOUND', message: expect.any(String) },
      });
    });

    it('devolve VALIDATION_ERROR com o campo que falhou', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/__probe/echo',
        payload: { email: 'nao-e-email', guestCount: 0 },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details.context).toBe('body');
      expect(body.error.details.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'email' }),
          expect.objectContaining({ field: 'guestCount' }),
        ]),
      );
    });

    it('devolve VALIDATION_ERROR para JSON malformado', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/__probe/echo',
        headers: { 'content-type': 'application/json' },
        payload: '{ isto nao e json',
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('mantém a mensagem em pt-BR', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/nao-existe' });

      expect(response.json().error.message).toMatch(/[ãáéíóúç]/);
    });
  });

  describe('normalização pelos schemas compartilhados', () => {
    it('aplica trim e minúsculas no e-mail antes de chegar ao handler', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/__probe/echo',
        payload: { email: '  ANA@Exemplo.COM ', guestCount: 40 },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().email).toBe('ana@exemplo.com');
    });
  });

  describe('proteções de borda', () => {
    it('envia os cabeçalhos do helmet', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/health' });

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers).toHaveProperty('x-frame-options');
    });

    it('recusa corpo acima de 100 KB', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/__probe/echo',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ email: 'ana@exemplo.com', notes: 'x'.repeat(120_000) }),
      });

      expect(response.statusCode).toBe(413);
      const body = response.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      // A mensagem genérica de validação mandaria conferir campos que não existem.
      expect(body.error.message).toMatch(/grande demais/);
    });
  });
});

describe('redação do log (§10.7)', () => {
  it('censura credencial em vez de escrever no log', async () => {
    const sink = createLogSink();
    const app = await buildApp({ loggerStream: sink });
    await app.ready();

    app.log.info(
      {
        headers: { authorization: 'Bearer token-secretissimo', cookie: 'refresh_token=abc123' },
        password: 'senha-da-maria',
        idToken: 'id-token-do-google',
      },
      'sonda de redação',
    );

    const logged = sink.text();
    await app.close();

    expect(logged).toContain('[redigido]');
    expect(logged).not.toContain('token-secretissimo');
    expect(logged).not.toContain('refresh_token=abc123');
    expect(logged).not.toContain('senha-da-maria');
    expect(logged).not.toContain('id-token-do-google');
  });
});
