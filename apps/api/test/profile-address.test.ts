import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/mailer.js', () => ({
  sendMail: async () => {},
  resetMailerForTests: () => {},
}));

const { buildApp } = await import('../src/app.js');
const { hashPassword } = await import('../src/lib/password.js');
const { prisma, truncateAll } = await import('./helpers/db.js');

/**
 * Endereço no perfil e o que a sessão diz da conta (§9.12, novembro de 2026).
 *
 * O endereço existe para a entrega da decoração: um por conta, editado em
 * `PATCH /me` e copiado na reserva quando a pessoa pede a entrega. A sessão
 * passa a dizer também se a conta tem senha, para "Meu perfil" só oferecer a
 * troca a quem tem uma — sem nunca deixar o hash sair da API.
 */

const PASSWORD = 'senha-bem-boa-123';

/** Endereço como o formulário manda: com espaço sobrando e complemento vazio. */
const ADDRESS_INPUT = {
  cep: '12954000',
  street: '  Rua das Orquídeas ',
  number: ' 265',
  complement: '',
  district: 'Chácaras Fernão Dias',
  city: 'Atibaia',
  state: 'SP',
};

/** O mesmo endereço, como a API guarda e devolve. */
const ADDRESS = {
  cep: '12954000',
  street: 'Rua das Orquídeas',
  number: '265',
  complement: null,
  district: 'Chácaras Fernão Dias',
  city: 'Atibaia',
  state: 'SP',
};

describe('endereço no perfil', () => {
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

  async function createClient(overrides: { withPassword?: boolean } = {}) {
    const user = await prisma.user.create({
      data: {
        name: 'Ana Beatriz',
        email: 'ana@exemplo.com',
        phone: '11999990000',
        passwordHash: overrides.withPassword === false ? null : await hashPassword(PASSWORD),
        googleId: overrides.withPassword === false ? 'google-sub-123' : null,
        emailVerifiedAt: new Date(),
        termsAcceptedAt: new Date(),
      },
    });

    return { user, token: app.jwt.sign({ sub: user.id, role: user.role }) };
  }

  function patchMe(token: string, payload: Record<string, unknown>) {
    return app.inject({
      method: 'PATCH',
      url: '/api/me',
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
  }

  function getMe(token: string) {
    return app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { authorization: `Bearer ${token}` },
    });
  }

  /** `NULL` do SQL, e não o JSON `null`, que pareceria um endereço gravado. */
  async function addressIsSqlNull(userId: string) {
    const [row] = await prisma.$queryRaw<{ empty: boolean }[]>`
      SELECT address IS NULL AS empty FROM "User" WHERE id = ${userId}
    `;
    return row?.empty;
  }

  describe('PATCH /me', () => {
    it('cadastra o endereço já normalizado, com o complemento vazio virando nulo', async () => {
      const { user, token } = await createClient();

      const response = await patchMe(token, { address: ADDRESS_INPUT });

      expect(response.statusCode).toBe(200);
      expect(response.json().address).toEqual(ADDRESS);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).address).toEqual(
        ADDRESS,
      );
    });

    it('mantém o complemento que vier preenchido', async () => {
      const { token } = await createClient();

      const response = await patchMe(token, {
        address: { ...ADDRESS_INPUT, complement: ' casa 2 ' },
      });

      expect(response.json().address.complement).toBe('casa 2');
    });

    /* O CEP é só número na tela e na API, para os dois lados não divergirem. */
    it('recusa CEP com traço, apontando o campo', async () => {
      const { user, token } = await createClient();

      const response = await patchMe(token, { address: { ...ADDRESS_INPUT, cep: '12954-000' } });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details.fields).toEqual([
        { field: 'address.cep', message: 'Informe o CEP com 8 números.' },
      ]);
      expect(await addressIsSqlNull(user.id)).toBe(true);
    });

    it('recusa estado que não existe', async () => {
      const { token } = await createClient();

      const response = await patchMe(token, { address: { ...ADDRESS_INPUT, state: 'XX' } });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details.fields[0].field).toBe('address.state');
    });

    it('null apaga o endereço', async () => {
      const { user, token } = await createClient();
      await patchMe(token, { address: ADDRESS_INPUT });

      const response = await patchMe(token, { address: null });

      expect(response.statusCode).toBe(200);
      expect(response.json().address).toBeNull();
      expect(await addressIsSqlNull(user.id)).toBe(true);
    });

    it('mudar o nome não mexe no endereço', async () => {
      const { token } = await createClient();
      await patchMe(token, { address: ADDRESS_INPUT });

      const response = await patchMe(token, { name: 'Ana B. Souza' });

      expect(response.json()).toMatchObject({ name: 'Ana B. Souza', address: ADDRESS });
    });

    it('aceita mudar só o endereço', async () => {
      const { token } = await createClient();

      const response = await patchMe(token, { address: ADDRESS_INPUT });

      expect(response.json()).toMatchObject({ name: 'Ana Beatriz', phone: '11999990000' });
    });

    it('exige sessão', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/me',
        payload: { address: ADDRESS_INPUT },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('o usuário da sessão', () => {
    it('traz o endereço e diz que a conta tem senha', async () => {
      const { token } = await createClient();
      await patchMe(token, { address: ADDRESS_INPUT });

      const login = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'ana@exemplo.com', password: PASSWORD },
      });

      expect(login.statusCode).toBe(200);
      expect(login.json().user).toMatchObject({ address: ADDRESS, hasPassword: true });

      const refresh = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        cookies: {
          refresh_token:
            login.cookies.find((cookie) => cookie.name === 'refresh_token')?.value ?? '',
        },
      });

      expect(refresh.json().user).toMatchObject({ address: ADDRESS, hasPassword: true });
    });

    it('sem endereço cadastrado, o endereço é nulo', async () => {
      const { token } = await createClient();

      expect((await getMe(token)).json()).toMatchObject({ address: null, hasPassword: true });
    });

    /* Conta só com o Google: "Meu perfil" não oferece trocar uma senha que não existe. */
    it('conta sem senha diz que não tem senha', async () => {
      const { token } = await createClient({ withPassword: false });

      expect((await getMe(token)).json()).toMatchObject({ hasPassword: false });
    });

    it('nunca devolve o hash da senha', async () => {
      const { token } = await createClient();

      const response = await getMe(token);

      expect(response.body).not.toContain('argon2');
      expect(response.json()).not.toHaveProperty('passwordHash');
    });

    /* Um JSON fora do formato, por escrita direta no banco, não impede ninguém de entrar. */
    it('endereço gravado fora do formato vira endereço nulo', async () => {
      const { user, token } = await createClient();
      await prisma.user.update({ where: { id: user.id }, data: { address: { cep: 'x' } } });

      const response = await getMe(token);

      expect(response.statusCode).toBe(200);
      expect(response.json().address).toBeNull();
    });
  });
});
