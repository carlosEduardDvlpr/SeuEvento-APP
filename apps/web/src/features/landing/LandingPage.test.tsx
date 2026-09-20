import type { PublicVenue } from '@chacara/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LandingPage } from './LandingPage';

const VENUE: PublicVenue = {
  name: 'Chácara Seu Evento',
  maxGuests: 120,
  checkInTime: '08:00',
  checkOutTime: '22:00',
  whatsapp: null,
  address: null,
  mapsUrl: null,
  houseRules: null,
  minDays: 1,
  maxDays: 3,
  minLeadDays: 2,
  freeCancelUntilDays: 7,
  holdHours: 48,
};

function renderLanding(venue: Partial<PublicVenue> = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ...VENUE, ...venue }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LandingPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mostra capacidade, horários e período vindos da API', async () => {
    renderLanding();

    expect(await screen.findByText('120 pessoas')).toBeInTheDocument();
    expect(screen.getByText('08:00 às 22:00')).toBeInTheDocument();
    expect(screen.getByText('de 1 a 3 dias')).toBeInTheDocument();
  });

  it('diz por quanto tempo as datas ficam seguras, com o valor configurado', async () => {
    renderLanding({ holdHours: 24 });

    expect(await screen.findByText(/24 horas/)).toBeInTheDocument();
  });

  it('usa singular quando o período é de um único dia', async () => {
    renderLanding({ minDays: 1, maxDays: 1 });

    expect(await screen.findByText('1 dia')).toBeInTheDocument();
  });

  // §16.6: o seed não inventa endereço nem regra da casa, então a interface
  // precisa simplesmente não mostrar a seção em vez de exibir vazio.
  it('omite endereço e regras da casa quando não estão preenchidos', async () => {
    renderLanding();

    await screen.findByText('120 pessoas');
    expect(screen.queryByText('Regras da casa')).not.toBeInTheDocument();
  });

  it('mostra as regras da casa quando o admin preenche', async () => {
    renderLanding({ houseRules: 'Som liberado até as 22h.' });

    expect(await screen.findByText('Regras da casa')).toBeInTheDocument();
    expect(screen.getByText('Som liberado até as 22h.')).toBeInTheDocument();
  });

  it('tem um único h1 e ele descreve a página (§18.1)', async () => {
    renderLanding();

    await screen.findByText('120 pessoas');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('mostra a mensagem da API quando a carga falha', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: 'INTERNAL', message: 'Algo deu errado do nosso lado.' },
          }),
          { status: 500, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <LandingPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Algo deu errado do nosso lado.')).toBeInTheDocument();
  });
});
