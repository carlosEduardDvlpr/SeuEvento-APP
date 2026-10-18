import type { PublicVenue } from '@chacara/shared';
import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorResponse, jsonResponse, renderWithProviders } from '../../../test/helpers/render';
import { PrivacyPage } from './PrivacyPage';
import { TermsPage } from './TermsPage';

/**
 * Páginas legais da §10.8.
 *
 * O que está sob teste é a mesma regra da FAQ (§13.1): **o texto sai da
 * configuração, não de constante escrita à mão**. Prazo de cancelamento,
 * capacidade, horário e contato precisam ser os mesmos que a API aplica, senão a
 * página passa a contradizer o sistema na primeira mudança do painel.
 *
 * A espera é sempre por um título de seção, nunca pelo `h1`: o estado de
 * carregamento também renderiza o `h1` (de propósito, para a página não ficar sem
 * título), então ele não serve de sinal de que os dados chegaram.
 */

const VENUE: PublicVenue = {
  name: 'Chácara Seu Evento',
  maxGuests: 120,
  checkInTime: '08:00',
  checkOutTime: '22:00',
  whatsapp: '(11) 98888-7777',
  address: 'Estrada do Sol, 100 — Zona Rural',
  mapsUrl: 'https://maps.exemplo.com/chacara',
  houseRules: 'Som até as 22h.\nAnimais com coleira.',
  minDays: 1,
  maxDays: 3,
  minLeadDays: 2,
  freeCancelUntilDays: 7,
  holdHours: 48,
};

function stubVenue(venue: PublicVenue | null = VENUE) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.startsWith('/api/public/venue')) {
        return Promise.resolve(
          venue
            ? jsonResponse(venue)
            : errorResponse(500, 'INTERNAL', 'Algo deu errado do nosso lado.'),
        );
      }

      return Promise.resolve(jsonResponse([]));
    }),
  );
}

/** Monta a página e espera os dados da chácara chegarem. */
async function renderTerms(venue: PublicVenue | null = VENUE) {
  stubVenue(venue);
  renderWithProviders(<TermsPage />, { route: '/termos', withAuth: false });

  await screen.findByRole('heading', { name: 'O que este site faz' });
}

async function renderPrivacy(venue: PublicVenue | null = VENUE) {
  stubVenue(venue);
  renderWithProviders(<PrivacyPage />, { route: '/privacidade', withAuth: false });

  await screen.findByRole('heading', { name: 'Quem trata seus dados' });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Termos de uso', () => {
  it('tem um h1 e usa os prazos e limites da configuração', async () => {
    await renderTerms();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Termos de uso');

    expect(screen.getByText(/48 horas/)).toBeInTheDocument();
    expect(screen.getByText(/De 1 a 3 dias seguidos/)).toBeInTheDocument();
    expect(screen.getByText(/Até 120 convidados/)).toBeInTheDocument();
    expect(screen.getByText(/Entrada a partir das 08:00/)).toBeInTheDocument();
  });

  it('usa o prazo de cancelamento da chácara, não um número fixo', async () => {
    await renderTerms({ ...VENUE, freeCancelUntilDays: 15 });

    expect(screen.getByText(/até 15 dias antes do início/)).toBeInTheDocument();
  });

  it('muda o texto de duração quando a chácara aceita um dia só', async () => {
    await renderTerms({ ...VENUE, minDays: 1, maxDays: 1 });

    expect(screen.getByText('Reserva de 1 dia.')).toBeInTheDocument();
  });

  // §16.6: sem regras cadastradas, a seção não existe — não se inventa política.
  it('esconde as regras da casa quando o painel não tem nenhuma', async () => {
    await renderTerms({ ...VENUE, houseRules: null });

    expect(screen.queryByRole('heading', { name: 'Regras da casa' })).not.toBeInTheDocument();
  });

  it('mostra as regras da casa quando existem', async () => {
    await renderTerms();

    expect(screen.getByRole('heading', { name: 'Regras da casa' })).toBeInTheDocument();
    expect(screen.getByText(/Som até as 22h/)).toBeInTheDocument();
  });

  it('diz que o site não cobra nada', async () => {
    await renderTerms();

    expect(screen.getByText(/não cobra nada e não processa pagamento/)).toBeInTheDocument();
  });
});

describe('Política de privacidade', () => {
  it('identifica quem trata os dados com o nome e o endereço cadastrados', async () => {
    await renderPrivacy();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText(/é responsável pelos dados coletados/)).toHaveTextContent(
      'Chácara Seu Evento',
    );
    expect(screen.getByText(/Estrada do Sol, 100/)).toBeInTheDocument();
  });

  it('explica a remoção da conta e o bloqueio por reserva em andamento', async () => {
    await renderPrivacy();

    expect(screen.getByText(/reserva em andamento a remoção fica bloqueada/)).toBeInTheDocument();
  });

  /*
   * As afirmações sobre cookie são verificáveis no código (§10.1: só o
   * `refresh_token`, `httpOnly`, restrito a `/api/auth`), e são as que mais
   * estragam se a página virar texto genérico copiado.
   */
  it('descreve o único cookie e a ausência de rastreador', async () => {
    await renderPrivacy();

    expect(screen.getByText(/não pode ser lido por JavaScript/)).toBeInTheDocument();
    expect(
      screen.getByText(/Não há cookie de publicidade nem de medição de audiência/),
    ).toBeInTheDocument();
  });

  it('cai no contato genérico quando o WhatsApp não está cadastrado', async () => {
    await renderPrivacy({ ...VENUE, whatsapp: null });

    expect(screen.queryByText(/WhatsApp \(11\)/)).not.toBeInTheDocument();
    expect(screen.getByText(/canal de contato informado no site/)).toBeInTheDocument();
  });

  // Página legal com lacuna é pior que página que não carregou.
  it('avisa quando não conseguiu carregar, em vez de mostrar texto incompleto', async () => {
    stubVenue(null);
    renderWithProviders(<PrivacyPage />, { route: '/privacidade', withAuth: false });

    expect(await screen.findByRole('alert')).toHaveTextContent('Algo deu errado do nosso lado.');
    expect(screen.queryByRole('heading', { name: 'Seus direitos' })).not.toBeInTheDocument();
  });
});
