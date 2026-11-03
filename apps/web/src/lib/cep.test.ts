import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse } from '../../test/helpers/render';
import { lookupCep } from './cep';

/**
 * Busca de endereço pelo CEP (§9.12).
 *
 * A resposta do ViaCEP é dado de fora: o que se cobra aqui é que só o formato
 * esperado vire endereço, que "CEP não existe" e "a busca falhou" saiam
 * diferentes, e que nada vá à rede sem um CEP de oito números.
 */

const SE: Record<string, unknown> = {
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

function stubFetch(response: () => Promise<Response>) {
  const fetchMock = vi.fn((_url: string, _init?: RequestInit) => response());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('lookupCep', () => {
  it('busca o CEP no ViaCEP e devolve rua, bairro, cidade e estado', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse(SE)));

    await expect(lookupCep('01001000')).resolves.toEqual({
      street: 'Praça da Sé',
      district: 'Sé',
      city: 'São Paulo',
      state: 'SP',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://viacep.com.br/ws/01001000/json/',
      expect.anything(),
    );
  });

  it('repassa o sinal de cancelamento ao fetch', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse(SE)));
    const controller = new AbortController();

    await lookupCep('01001000', controller.signal);

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ signal: controller.signal });
  });

  it.each([true, 'true'])(
    'devolve null quando o ViaCEP diz que o CEP não existe (erro: %s)',
    async (erro) => {
      stubFetch(() => Promise.resolve(jsonResponse({ erro })));

      await expect(lookupCep('99999999')).resolves.toBeNull();
    },
  );

  /* CEP de cidade com CEP único: não há rua nem bairro, e a pessoa completa. */
  it('aceita rua e bairro vazios', async () => {
    stubFetch(() =>
      Promise.resolve(jsonResponse({ ...SE, logradouro: '', bairro: '', localidade: 'Itu' })),
    );

    await expect(lookupCep('13300000')).resolves.toEqual({
      street: '',
      district: '',
      city: 'Itu',
      state: 'SP',
    });
  });

  it('deixa o estado vazio quando a sigla não é de uma unidade da federação', async () => {
    stubFetch(() => Promise.resolve(jsonResponse({ ...SE, uf: 'XX' })));

    await expect(lookupCep('01001000')).resolves.toMatchObject({ state: null });
  });

  it('não vai à rede sem um CEP de oito números', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse(SE)));

    await expect(lookupCep('0100100')).resolves.toBeNull();
    await expect(lookupCep('01001-000')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  /* "A busca falhou" não pode virar "o CEP não existe": a tela diz coisas diferentes. */
  it('lança erro quando a rede falha', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));

    await expect(lookupCep('01001000')).rejects.toThrow();
  });

  it('lança erro quando o ViaCEP responde com falha', async () => {
    stubFetch(() => Promise.resolve(new Response('Bad Request', { status: 400 })));

    await expect(lookupCep('01001000')).rejects.toThrow();
  });

  it('lança erro quando a resposta não tem o formato esperado', async () => {
    stubFetch(() => Promise.resolve(jsonResponse({ cidade: 'São Paulo' })));

    await expect(lookupCep('01001000')).rejects.toThrow();
  });

  it('lança erro quando a resposta não é JSON', async () => {
    stubFetch(() => Promise.resolve(new Response('<html>manutenção</html>', { status: 200 })));

    await expect(lookupCep('01001000')).rejects.toThrow();
  });
});
