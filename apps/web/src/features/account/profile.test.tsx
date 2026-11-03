import type { Address, SessionUser } from '@chacara/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorResponse, jsonResponse, renderWithProviders } from '../../../test/helpers/render';
import { MyBookingsPage } from './MyBookingsPage';

/**
 * "Meu perfil" (novembro de 2026): dados de contato, endereço de entrega com a
 * busca do CEP no ViaCEP (§9.12) e troca de senha.
 *
 * O `fetch` de mentira responde pela URL inteira, e é assim que a busca no
 * ViaCEP, que não passa pela nossa API, também é respondida aqui.
 */

const USER: SessionUser = {
  id: 'u-1',
  name: 'Ana Beatriz',
  email: 'ana@exemplo.com',
  phone: '11999990000',
  role: 'CLIENT',
  emailVerified: true,
  address: null,
  hasPassword: true,
};

const ADDRESS: Address = {
  cep: '12954000',
  street: 'Rua das Orquídeas',
  number: '265',
  complement: 'casa 2',
  district: 'Chácaras Fernão Dias',
  city: 'Atibaia',
  state: 'SP',
};

/** O que o ViaCEP responde para a Praça da Sé. */
const VIACEP_SE = {
  cep: '01001-000',
  logradouro: 'Praça da Sé',
  complemento: 'lado ímpar',
  unidade: '',
  bairro: 'Sé',
  localidade: 'São Paulo',
  uf: 'SP',
  estado: 'São Paulo',
  ibge: '3550308',
  ddd: '11',
};

const VIACEP_URL = 'https://viacep.com.br/ws/01001000/json/';

type Call = { url: string; method: string; body: unknown };
type Handler = (call: Call) => Response | Promise<Response>;

function stubFetch(routes: Record<string, Handler>) {
  const calls: Call[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const call = {
        url,
        method: init?.method ?? 'GET',
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      };
      calls.push(call);

      const handler = routes[`${call.method} ${url.split('?')[0]!}`];
      return handler ? handler(call) : jsonResponse([]);
    }),
  );

  return calls;
}

function renderProfile(routes: Record<string, Handler> = {}, user: SessionUser = USER) {
  const calls = stubFetch({
    'POST /api/auth/refresh': () => jsonResponse({ accessToken: 'token', user }),
    'GET /api/bookings/me': () => jsonResponse([]),
    ...routes,
  });

  renderWithProviders(<MyBookingsPage />, { route: '/minhas-reservas?aba=perfil' });
  return calls;
}

/** O `PATCH /me` de mentira devolve o usuário com o que foi pedido. */
function patchMe(user: SessionUser = USER): Handler {
  return (call) => jsonResponse({ ...user, ...(call.body as Partial<SessionUser>) });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('seus dados', () => {
  it('mostra nome e WhatsApp para editar, e o e-mail só para ler', async () => {
    renderProfile();

    expect(await screen.findByLabelText('Nome')).toHaveValue('Ana Beatriz');
    expect(screen.getByLabelText('WhatsApp')).toHaveValue('11999990000');
    expect(screen.getByText('ana@exemplo.com')).toBeVisible();
    expect(screen.getByText(/A troca de e-mail vai pedir um código/)).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'E-mail' })).not.toBeInTheDocument();
  });

  it('salva nome e WhatsApp, só com os números do telefone', async () => {
    const user = userEvent.setup();
    const calls = renderProfile({ 'PATCH /api/me': patchMe() });

    const name = await screen.findByLabelText('Nome');
    await user.clear(name);
    await user.type(name, 'Ana Beatriz Souza');
    await user.clear(screen.getByLabelText('WhatsApp'));
    await user.type(screen.getByLabelText('WhatsApp'), '(11) 98888-7777');
    await user.click(screen.getByRole('button', { name: 'Salvar dados' }));

    expect(await screen.findByText('Dados salvos.')).toBeVisible();
    expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({
      name: 'Ana Beatriz Souza',
      phone: '11988887777',
    });
  });

  it('recusa o nome curto sem chamar a API', async () => {
    const user = userEvent.setup();
    const calls = renderProfile();

    const name = await screen.findByLabelText('Nome');
    await user.clear(name);
    await user.type(name, 'A');
    await user.click(screen.getByRole('button', { name: 'Salvar dados' }));

    expect(await screen.findByText('Informe o nome completo.')).toBeVisible();
    expect(calls.some((call) => call.method === 'PATCH')).toBe(false);
  });
});

describe('endereço de entrega', () => {
  it('sem endereço, explica para que serve e oferece cadastrar', async () => {
    renderProfile();

    expect(
      await screen.findByText(
        'Nenhum endereço cadastrado. Ele é usado quando a decoração vai até você.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cadastrar endereço' })).toBeVisible();
  });

  it('com endereço, mostra numa linha e oferece alterar', async () => {
    renderProfile({}, { ...USER, address: ADDRESS });

    expect(
      await screen.findByText(
        'Rua das Orquídeas, 265, casa 2 – Chácaras Fernão Dias, Atibaia/SP – CEP 12954-000',
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Alterar endereço' })).toBeVisible();
  });

  it('busca o CEP no ViaCEP, preenche o endereço, leva ao número e salva', async () => {
    const user = userEvent.setup();
    const calls = renderProfile({
      [`GET ${VIACEP_URL}`]: () => jsonResponse(VIACEP_SE),
      'PATCH /api/me': patchMe(),
    });

    await user.click(await screen.findByRole('button', { name: 'Cadastrar endereço' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Endereço de entrega' }));

    // O traço que a pessoa digita sai: o CEP fica só com os números.
    await user.type(dialog.getByLabelText('CEP'), '01001-000');
    expect(dialog.getByLabelText('CEP')).toHaveValue('01001000');

    await waitFor(() => expect(dialog.getByLabelText('Rua')).toHaveValue('Praça da Sé'));
    expect(dialog.getByLabelText('Bairro')).toHaveValue('Sé');
    expect(dialog.getByLabelText('Cidade')).toHaveValue('São Paulo');
    expect(dialog.getByLabelText('Estado')).toHaveValue('SP');
    expect(dialog.getByLabelText('Número')).toHaveFocus();
    expect(calls.filter((call) => call.url === VIACEP_URL)).toHaveLength(1);

    await user.type(dialog.getByLabelText('Número'), '100');
    await user.click(dialog.getByRole('button', { name: 'Salvar endereço' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({
      address: {
        cep: '01001000',
        street: 'Praça da Sé',
        number: '100',
        complement: null,
        district: 'Sé',
        city: 'São Paulo',
        state: 'SP',
      },
    });
    expect(screen.getByText('Praça da Sé, 100 – Sé, São Paulo/SP – CEP 01001-000')).toBeVisible();
    expect(screen.getByText('Endereço salvo.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Alterar endereço' })).toBeVisible();
  });

  it('diz quando o CEP não existe, e deixa preencher à mão', async () => {
    const user = userEvent.setup();
    renderProfile({
      'GET https://viacep.com.br/ws/99999999/json/': () => jsonResponse({ erro: true }),
    });

    await user.click(await screen.findByRole('button', { name: 'Cadastrar endereço' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Endereço de entrega' }));
    await user.type(dialog.getByLabelText('CEP'), '99999999');

    expect(
      await dialog.findByText(
        'Não encontramos este CEP. Confira os números ou preencha o endereço.',
      ),
    ).toBeVisible();
    expect(dialog.getByLabelText('Rua')).toBeEnabled();
  });

  it('diz quando a busca do CEP falha', async () => {
    const user = userEvent.setup();
    renderProfile({
      [`GET ${VIACEP_URL}`]: () => Promise.reject(new TypeError('Failed to fetch')),
    });

    await user.click(await screen.findByRole('button', { name: 'Cadastrar endereço' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Endereço de entrega' }));
    await user.type(dialog.getByLabelText('CEP'), '01001000');

    expect(
      await dialog.findByText('Não conseguimos buscar o CEP agora. Preencha o endereço à mão.'),
    ).toBeVisible();
  });

  it('não salva endereço incompleto e marca o que falta', async () => {
    const user = userEvent.setup();
    const calls = renderProfile();

    await user.click(await screen.findByRole('button', { name: 'Cadastrar endereço' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Endereço de entrega' }));
    await user.click(dialog.getByRole('button', { name: 'Salvar endereço' }));

    expect(await dialog.findByText('Informe o CEP com 8 números.')).toBeVisible();
    expect(dialog.getByText('Escolha o estado.')).toBeVisible();
    expect(calls.some((call) => call.method === 'PATCH')).toBe(false);
  });

  /* A API valida o endereço dentro do corpo: o erro de `address.cep` vai para o CEP. */
  it('mostra no campo o erro que a API devolve para o endereço', async () => {
    const user = userEvent.setup();
    renderProfile(
      {
        'PATCH /api/me': () =>
          errorResponse(400, 'VALIDATION_ERROR', 'Confira os campos.', {
            fields: [{ field: 'address.cep', message: 'Este CEP não existe.' }],
          }),
      },
      { ...USER, address: ADDRESS },
    );

    await user.click(await screen.findByRole('button', { name: 'Alterar endereço' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Endereço de entrega' }));
    expect(dialog.getByLabelText('Rua')).toHaveValue('Rua das Orquídeas');

    await user.click(dialog.getByRole('button', { name: 'Salvar endereço' }));

    expect(await dialog.findByText('Este CEP não existe.')).toBeVisible();
    expect(dialog.getByLabelText('CEP')).toHaveAttribute('aria-invalid', 'true');
  });

  it('fecha sem salvar quando a pessoa cancela', async () => {
    const user = userEvent.setup();
    const calls = renderProfile();

    await user.click(await screen.findByRole('button', { name: 'Cadastrar endereço' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Endereço de entrega' }));
    await user.click(dialog.getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.some((call) => call.method === 'PATCH')).toBe(false);
  });
});

describe('senha', () => {
  it('troca a senha, abre a sessão nova e limpa os campos', async () => {
    const user = userEvent.setup();
    const calls = renderProfile({
      'POST /api/auth/change-password': () =>
        jsonResponse({ accessToken: 'token-novo', user: USER }),
    });

    await user.type(await screen.findByLabelText('Senha atual'), 'senha-antiga');
    await user.type(screen.getByLabelText('Nova senha'), 'senha-nova-123');
    await user.click(screen.getByRole('button', { name: 'Trocar senha' }));

    expect(
      await screen.findByText('Senha trocada. As outras sessões foram encerradas.'),
    ).toBeVisible();
    expect(calls.find((call) => call.url === '/api/auth/change-password')?.body).toEqual({
      currentPassword: 'senha-antiga',
      newPassword: 'senha-nova-123',
    });
    expect(screen.getByLabelText('Senha atual')).toHaveValue('');
    expect(screen.getByLabelText('Nova senha')).toHaveValue('');
  });

  it('mostra no campo quando a senha atual não confere', async () => {
    const user = userEvent.setup();
    renderProfile({
      'POST /api/auth/change-password': () =>
        errorResponse(400, 'VALIDATION_ERROR', 'Confira os campos.', {
          fields: [{ field: 'currentPassword', message: 'A senha atual não confere.' }],
        }),
    });

    await user.type(await screen.findByLabelText('Senha atual'), 'senha-errada');
    await user.type(screen.getByLabelText('Nova senha'), 'senha-nova-123');
    await user.click(screen.getByRole('button', { name: 'Trocar senha' }));

    expect(await screen.findByText('A senha atual não confere.')).toBeVisible();
    expect(screen.getByLabelText('Senha atual')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText(/Senha trocada/)).not.toBeInTheDocument();
  });

  it('mostra a recusa da API que não é de um campo', async () => {
    const user = userEvent.setup();
    renderProfile({
      'POST /api/auth/change-password': () =>
        errorResponse(400, 'VALIDATION_ERROR', 'Esta conta entra com o Google e não tem senha.'),
    });

    await user.type(await screen.findByLabelText('Senha atual'), 'senha-antiga');
    await user.type(screen.getByLabelText('Nova senha'), 'senha-nova-123');
    await user.click(screen.getByRole('button', { name: 'Trocar senha' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esta conta entra com o Google e não tem senha.',
    );
  });

  it('na conta sem senha, explica em vez de pedir a senha atual', async () => {
    renderProfile({}, { ...USER, hasPassword: false });

    expect(await screen.findByText('Sua conta entra com o Google, sem senha.')).toBeVisible();
    expect(screen.queryByLabelText('Senha atual')).not.toBeInTheDocument();
  });
});
