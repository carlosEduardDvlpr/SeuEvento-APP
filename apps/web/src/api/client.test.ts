import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch, setAuthHooks } from './client';

/** Resposta de sucesso já em JSON. */
function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Erro no envelope da §11.1. */
function apiError(status: number, code: string, message: string, details?: unknown) {
  return new Response(
    JSON.stringify({
      error: details === undefined ? { code, message } : { code, message, details },
    }),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('apiFetch', () => {
  beforeEach(() => {
    setAuthHooks({ getAccessToken: () => null, onSessionExpired: () => {} });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('devolve o corpo em caso de sucesso', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ name: 'Chácara Seu Evento' })));

    await expect(apiFetch<{ name: string }>('/public/venue')).resolves.toEqual({
      name: 'Chácara Seu Evento',
    });
  });

  it('chama a API sob o prefixo /api', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({}));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/public/venue');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/public/venue');
  });

  describe('tradução do envelope de erro (§11.1)', () => {
    it('converte código, status, mensagem e detalhes em ApiError', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          apiError(409, 'DATE_UNAVAILABLE', 'O dia 24/12 acabou de ser reservado.', {
            dates: ['2026-12-24'],
          }),
        ),
      );

      const error = await apiFetch('/bookings', { method: 'POST' }).catch(
        (caught: unknown) => caught,
      );

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        code: 'DATE_UNAVAILABLE',
        status: 409,
        message: 'O dia 24/12 acabou de ser reservado.',
        details: { dates: ['2026-12-24'] },
      });
    });

    it('preserva a mensagem da API, que é escrita no tom da §16.4', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            apiError(422, 'CANCEL_WINDOW_CLOSED', 'O prazo para cancelar pelo site terminou.'),
          ),
      );

      const error = (await apiFetch('/bookings/1/cancel', { method: 'PATCH' }).catch(
        (caught: unknown) => caught,
      )) as ApiError;

      expect(error.message).toBe('O prazo para cancelar pelo site terminou.');
    });

    // Um código desconhecido significa API mais nova que o front. Cair em
    // INTERNAL é melhor que deixar `code` inválido circular pela interface.
    it('usa INTERNAL quando o código não é conhecido', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(apiError(400, 'CODIGO_NOVO', 'Algo novo aconteceu.')),
      );

      const error = (await apiFetch('/qualquer').catch((caught: unknown) => caught)) as ApiError;

      expect(error.code).toBe('INTERNAL');
      expect(error.status).toBe(400);
    });

    it('não quebra quando a resposta de erro não tem envelope', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response('502 Bad Gateway', { status: 502 })),
      );

      const error = (await apiFetch('/qualquer').catch((caught: unknown) => caught)) as ApiError;

      expect(error.code).toBe('INTERNAL');
      expect(error.message).toMatch(/Algo deu errado/);
    });

    it('trata falha de rede como status 0, sem envelope', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

      const error = (await apiFetch('/qualquer').catch((caught: unknown) => caught)) as ApiError;

      expect(error.status).toBe(0);
      expect(error.message).toMatch(/conexão/);
    });
  });

  describe('sessão', () => {
    it('só envia o token quando a requisição pede autenticação', async () => {
      const fetchMock = vi.fn().mockResolvedValue(ok({}));
      vi.stubGlobal('fetch', fetchMock);
      setAuthHooks({ getAccessToken: () => 'token-de-acesso' });

      await apiFetch('/public/venue');
      await apiFetch('/me', { auth: true });

      const publicHeaders = fetchMock.mock.calls[0]?.[1].headers as Headers;
      const privateHeaders = fetchMock.mock.calls[1]?.[1].headers as Headers;

      expect(publicHeaders.get('Authorization')).toBeNull();
      expect(privateHeaders.get('Authorization')).toBe('Bearer token-de-acesso');
    });

    it('avisa o contexto de auth quando a rota autenticada devolve 401', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(apiError(401, 'UNAUTHORIZED', 'Sua sessão expirou.')),
      );
      const onSessionExpired = vi.fn();
      setAuthHooks({ getAccessToken: () => 'token-velho', onSessionExpired });

      await apiFetch('/me', { auth: true }).catch(() => {});

      expect(onSessionExpired).toHaveBeenCalledOnce();
    });

    it('não avisa a expiração quando o 401 vem de rota pública', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(apiError(401, 'UNAUTHORIZED', 'Sua sessão expirou.')),
      );
      const onSessionExpired = vi.fn();
      setAuthHooks({ onSessionExpired });

      await apiFetch('/public/venue').catch(() => {});

      expect(onSessionExpired).not.toHaveBeenCalled();
    });
  });
});
