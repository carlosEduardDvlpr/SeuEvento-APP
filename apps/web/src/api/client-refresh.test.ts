import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch, setAuthHooks } from './client';

/**
 * Renovação de sessão no cliente HTTP (§10.4).
 *
 * O servidor **rotaciona** o refresh token e trata um token já gasto como reuso,
 * revogando a sessão inteira (§10.1). Por isso a regra não é só "tentar de novo":
 * é garantir que N requisições que expiram juntas provoquem **uma** renovação.
 */
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function unauthorized() {
  return json({ error: { code: 'UNAUTHORIZED', message: 'Sua sessão expirou.' } }, 401);
}

describe('renovação automática', () => {
  let token: string | null;
  let refreshCalls: number;
  let onSessionExpired: () => void;
  let expiredCalls: number;

  beforeEach(() => {
    token = 'token-vencido';
    refreshCalls = 0;
    expiredCalls = 0;
    onSessionExpired = () => {
      expiredCalls += 1;
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setAuthHooks({
      getAccessToken: () => null,
      refreshSession: async () => false,
      onSessionExpired: () => {},
    });
  });

  /** Simula um refresh que leva um tempo e troca o token, como o de verdade. */
  function installHooks(succeeds: boolean, delayMs = 10) {
    let inFlight: Promise<boolean> | null = null;

    setAuthHooks({
      getAccessToken: () => token,
      onSessionExpired,
      refreshSession: () => {
        // Mesma estratégia do módulo de sessão: compartilha a requisição em voo.
        inFlight ??= new Promise<boolean>((resolve) => {
          refreshCalls += 1;
          setTimeout(() => {
            if (succeeds) token = 'token-novo';
            resolve(succeeds);
          }, delayMs);
        }).finally(() => {
          inFlight = null;
        });

        return inFlight;
      },
    });
  }

  it('repete a requisição com o token renovado', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(json({ name: 'Ana' }));
    vi.stubGlobal('fetch', fetchMock);
    installHooks(true);

    await expect(apiFetch('/me', { auth: true })).resolves.toEqual({ name: 'Ana' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryInit = fetchMock.mock.calls[1]?.[1] as { headers: Headers };
    expect(retryInit.headers.get('Authorization')).toBe('Bearer token-novo');
    expect(expiredCalls).toBe(0);
  });

  // O caso que justifica a trava: sem ela, cada requisição rotacionaria o token e
  // a segunda pareceria reuso, derrubando a sessão do usuário.
  it('faz uma única renovação para várias requisições que expiram juntas', async () => {
    const fetchMock = vi.fn((_url: string, init: { headers: Headers }) => {
      const authorization = init.headers.get('Authorization');
      return Promise.resolve(
        authorization === 'Bearer token-novo' ? json({ ok: true }) : unauthorized(),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    installHooks(true);

    const responses = await Promise.all([
      apiFetch('/me', { auth: true }),
      apiFetch('/bookings/me', { auth: true }),
      apiFetch('/admin/bookings', { auth: true }),
    ]);

    expect(responses).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(refreshCalls).toBe(1);
  });

  it('não tenta renovar mais de uma vez na mesma requisição', async () => {
    // Renovação "bem-sucedida" que não resolve o problema: a segunda resposta
    // ainda é 401. A requisição precisa desistir, não entrar em laço.
    const fetchMock = vi.fn().mockResolvedValue(unauthorized());
    vi.stubGlobal('fetch', fetchMock);
    installHooks(true);

    await expect(apiFetch('/me', { auth: true })).rejects.toBeInstanceOf(ApiError);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refreshCalls).toBe(1);
  });

  it('avisa que a sessão acabou quando a renovação falha', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(unauthorized()));
    installHooks(false);

    const error = await apiFetch('/me', { auth: true }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(expiredCalls).toBe(1);
  });

  it('não tenta renovar em rota pública', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(unauthorized()));
    installHooks(true);

    await apiFetch('/public/venue').catch(() => {});

    expect(refreshCalls).toBe(0);
    expect(expiredCalls).toBe(0);
  });

  it('não tenta renovar em erro que não é 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          json({ error: { code: 'FORBIDDEN', message: 'Você não tem acesso.' } }, 403),
        ),
    );
    installHooks(true);

    const error = (await apiFetch('/admin/bookings', { auth: true }).catch(
      (caught: unknown) => caught,
    )) as ApiError;

    expect(error.code).toBe('FORBIDDEN');
    expect(refreshCalls).toBe(0);
  });

  it('repete o corpo da requisição na segunda tentativa', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(json({ id: 'reserva-1' }, 201));
    vi.stubGlobal('fetch', fetchMock);
    installHooks(true);

    await apiFetch('/bookings', { method: 'POST', body: { guestCount: 40 }, auth: true });

    const retryInit = fetchMock.mock.calls[1]?.[1] as { body: string };
    expect(retryInit.body).toBe(JSON.stringify({ guestCount: 40 }));
  });
});
