import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { API_ERROR_CODES } from '@chacara/shared';

// Espelho do teste da API: prova que o SPA compila JSX, roda em jsdom e enxerga
// o mesmo packages/shared que o servidor usa.
describe('ambiente de teste do SPA', () => {
  it('renderiza JSX em jsdom', () => {
    render(<p>Aguardando confirmação</p>);
    expect(screen.getByText('Aguardando confirmação')).toBeInTheDocument();
  });

  it('importa o contrato de erro compartilhado', () => {
    expect(API_ERROR_CODES).toContain('PRICE_CHANGED');
  });
});
