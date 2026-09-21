import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Sem mock do verificador: aqui o `google.ts` de verdade roda.
 *
 * O `.env` local deixa `GOOGLE_CLIENT_ID` vazio, que é o estado de quem ainda não
 * criou a credencial no Google Cloud. O comportamento esperado é a rota se
 * declarar indisponível, e o resto da autenticação continuar funcionando.
 */
vi.mock('../src/lib/mailer.js', () => ({
  sendMail: async () => {},
  resetMailerForTests: () => {},
}));

const { buildApp } = await import('../src/app.js');
const { env } = await import('../src/config/env.js');

describe('login com Google sem credencial configurada', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('confirma que o ambiente de teste está sem GOOGLE_CLIENT_ID', () => {
    // Se esta condição mudar, os dois testes abaixo param de medir o que querem.
    expect(env.GOOGLE_CLIENT_ID).toBeFalsy();
  });

  it('responde 503 em vez de tentar validar o token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { idToken: 'qualquer-coisa' },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('INTERNAL');
    expect(response.json().error.message).toMatch(/não está disponível/i);
  });

  it('não impede o login por e-mail e senha', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'ninguem@exemplo.com', password: 'senha-qualquer-123' },
    });

    // 401 é a resposta de credencial inválida; o que importa é não ser 5xx.
    expect(response.statusCode).toBe(401);
  });
});
