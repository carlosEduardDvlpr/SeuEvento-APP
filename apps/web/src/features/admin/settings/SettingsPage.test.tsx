import type { VenueSettings } from '@chacara/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/Toast';
import { errorResponse, jsonResponse, renderWithProviders } from '../../../../test/helpers/render';
import { SettingsPage } from './SettingsPage';

/**
 * Configurações da chácara (§13.4).
 *
 * São os números que governam o site, então o que está sob teste é o cuidado: o
 * botão só liga depois de uma mudança, dinheiro vai em centavos, e campo vazio
 * não vira zero em silêncio.
 */

const SETTINGS: VenueSettings = {
  name: 'Chácara Seu Evento',
  baseDailyPriceCents: 150_000,
  maxGuests: 120,
  minDays: 1,
  maxDays: 3,
  minLeadDays: 2,
  freeCancelUntilDays: 7,
  holdHours: 48,
  maxPendingPerUser: 3,
  checkInTime: '08:00',
  checkOutTime: '22:00',
  whatsapp: '11988887777',
  address: 'Estrada do Sol, 100',
  mapsUrl: null,
  houseRules: 'Som até 22h.',
};

type Call = { url: string; method: string; body: unknown };
type Handler = (call: Call) => Response;

function stubFetch(routes: Record<string, Handler> = {}) {
  const calls: Call[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: { method?: string; body?: string }) => {
      const call = {
        url,
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(init.body) : undefined,
      };
      calls.push(call);

      const handler = routes[`${call.method} ${url.split('?')[0]!}`];
      if (handler) return Promise.resolve(handler(call));

      return Promise.resolve(jsonResponse([]));
    }),
  );

  return calls;
}

function renderSettings(routes: Record<string, Handler> = {}) {
  const calls = stubFetch({
    'GET /api/admin/settings': () => jsonResponse(SETTINGS),
    'PUT /api/admin/settings': (call) => jsonResponse({ ...SETTINGS, ...(call.body as object) }),
    ...routes,
  });

  renderWithProviders(
    <ToastProvider>
      <SettingsPage />
    </ToastProvider>,
    { route: '/admin/configuracoes', withAuth: false },
  );

  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SettingsPage', () => {
  it('carrega os valores atuais nos campos', async () => {
    renderSettings();

    expect(await screen.findByLabelText('Nome')).toHaveValue('Chácara Seu Evento');
    expect(screen.getByLabelText('Capacidade')).toHaveValue(120);
    expect(screen.getByLabelText('Entrada')).toHaveValue('08:00');
    expect(screen.getByLabelText('Regras da casa')).toHaveValue('Som até 22h.');
  });

  /* §7.2: o dono digita em reais, o sistema guarda centavos. */
  it('mostra a diária em reais', async () => {
    renderSettings();

    expect(await screen.findByLabelText('Diária base')).toHaveValue(1500);
  });

  it('manda a diária de volta em centavos', async () => {
    const user = userEvent.setup();
    const calls = renderSettings();

    const price = await screen.findByLabelText('Diária base');
    await user.clear(price);
    await user.type(price, '1800');
    await user.click(screen.getByRole('button', { name: 'Salvar configurações' }));

    await waitFor(() => {
      expect(
        (calls.find((call) => call.method === 'PUT')?.body as VenueSettings).baseDailyPriceCents,
      ).toBe(180_000);
    });
  });

  /* Diz o efeito, não só o nome: "antecedência mínima" sozinho não informa nada. */
  it('explica o efeito de cada regra', async () => {
    renderSettings();

    expect(await screen.findByText(/só reserva com essa folga/)).toBeVisible();
    expect(screen.getByText(/Quanto tempo as datas ficam seguras/)).toBeVisible();
    expect(screen.getByText(/Depois disso, só você cancela/)).toBeVisible();
  });

  it('o botão de salvar começa inativo e liga com a primeira mudança', async () => {
    const user = userEvent.setup();
    renderSettings();

    const save = await screen.findByRole('button', { name: 'Salvar configurações' });
    expect(save).toBeDisabled();

    await user.type(screen.getByLabelText('Nome'), '!');

    expect(save).toBeEnabled();
  });

  it('oferece desfazer e volta aos valores do servidor', async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.type(await screen.findByLabelText('Nome'), '!');
    await user.click(screen.getByRole('button', { name: 'Desfazer alterações' }));

    expect(screen.getByLabelText('Nome')).toHaveValue('Chácara Seu Evento');
    expect(screen.getByRole('button', { name: 'Salvar configurações' })).toBeDisabled();
  });

  it('salva e avisa', async () => {
    const user = userEvent.setup();
    const calls = renderSettings();

    const guests = await screen.findByLabelText('Capacidade');
    await user.clear(guests);
    await user.type(guests, '90');
    await user.click(screen.getByRole('button', { name: 'Salvar configurações' }));

    expect(await screen.findByText('Configurações salvas.')).toBeVisible();
    expect((calls.find((call) => call.method === 'PUT')?.body as VenueSettings).maxGuests).toBe(90);
  });

  /*
   * Mínimo acima do máximo deixaria nenhuma duração válida: o site recusaria
   * toda reserva. A recusa é local, sem chamar a API.
   */
  it('recusa mínimo de dias maior que o máximo', async () => {
    const user = userEvent.setup();
    const calls = renderSettings();

    const min = await screen.findByLabelText('Mínimo de dias');
    await user.clear(min);
    await user.type(min, '5');
    await user.click(screen.getByRole('button', { name: 'Salvar configurações' }));

    await waitFor(() => {
      expect(screen.getByText(/não pode ser maior que o máximo/)).toBeVisible();
    });
    expect(calls.some((call) => call.method === 'PUT')).toBe(false);
  });

  /*
   * Campo vazio não vira zero: zero é válido em alguns destes campos, e mandar
   * zero por "deixei em branco" mudaria a regra sem o dono pedir.
   */
  it('recusa campo numérico vazio em vez de mandar zero', async () => {
    const user = userEvent.setup();
    const calls = renderSettings();

    await user.clear(await screen.findByLabelText('Capacidade'));
    await user.click(screen.getByRole('button', { name: 'Salvar configurações' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Capacidade')).toHaveAttribute('aria-invalid', 'true');
    });
    expect(calls.some((call) => call.method === 'PUT')).toBe(false);
  });

  it('aceita zero onde zero faz sentido', async () => {
    const user = userEvent.setup();
    const calls = renderSettings();

    const lead = await screen.findByLabelText('Antecedência mínima');
    await user.clear(lead);
    await user.type(lead, '0');
    await user.click(screen.getByRole('button', { name: 'Salvar configurações' }));

    await waitFor(() => {
      expect((calls.find((call) => call.method === 'PUT')?.body as VenueSettings).minLeadDays).toBe(
        0,
      );
    });
  });

  it('recusa horário fora do formato', async () => {
    const user = userEvent.setup();
    const calls = renderSettings();

    // O campo `time` não aceita texto livre, então o teste parte de um valor
    // limpo, que é o caso real de quem apaga o horário.
    await user.clear(await screen.findByLabelText('Entrada'));
    await user.click(screen.getByRole('button', { name: 'Salvar configurações' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Entrada')).toHaveAttribute('aria-invalid', 'true');
    });
    expect(calls.some((call) => call.method === 'PUT')).toBe(false);
  });

  /* O link vai para a landing; `http` ali viraria aviso de conteúdo misto. */
  it('recusa link de mapa que não seja https', async () => {
    const user = userEvent.setup();
    const calls = renderSettings();

    await user.type(await screen.findByLabelText('Link do mapa'), 'http://maps.exemplo.com/x');
    await user.click(screen.getByRole('button', { name: 'Salvar configurações' }));

    await waitFor(() => {
      expect(screen.getByText(/precisa começar com https/)).toBeVisible();
    });
    expect(calls.some((call) => call.method === 'PUT')).toBe(false);
  });

  it('deixa limpar os campos opcionais', async () => {
    const user = userEvent.setup();
    const calls = renderSettings();

    await user.clear(await screen.findByLabelText('WhatsApp'));
    await user.click(screen.getByRole('button', { name: 'Salvar configurações' }));

    // O schema troca texto vazio por nulo antes de enviar, para o banco não
    // guardar string em branco onde o significado é "não tem".
    await waitFor(() => {
      expect(
        (calls.find((call) => call.method === 'PUT')?.body as VenueSettings).whatsapp,
      ).toBeNull();
    });
  });

  it('conta o problema quando a API recusa', async () => {
    const user = userEvent.setup();
    renderSettings({
      'PUT /api/admin/settings': () => errorResponse(500, 'INTERNAL', 'Algo deu errado.'),
    });

    await user.type(await screen.findByLabelText('Nome'), '!');
    await user.click(screen.getByRole('button', { name: 'Salvar configurações' }));

    // Aparece no resumo do formulário e no aviso; dois `role="alert"`.
    expect((await screen.findAllByText('Algo deu errado.')).length).toBeGreaterThan(0);
  });

  it('explica a falha de carregamento', async () => {
    renderSettings({
      'GET /api/admin/settings': () => errorResponse(500, 'INTERNAL', 'Algo deu errado.'),
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Algo deu errado.');
  });
});
