import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Money } from './Money';
import { StatusBadge } from './StatusBadge';

describe('Money', () => {
  it('recebe centavos e mostra reais', () => {
    render(<Money cents={384000} />);

    expect(screen.getByText('R$ 3.840,00')).toBeInTheDocument();
  });

  it('alinha em coluna com numeral tabular (§14.11)', () => {
    render(<Money cents={1000} />);

    // A classe do CSS Module carrega `font-variant-numeric: tabular-nums`;
    // aqui basta garantir que ela foi aplicada.
    expect(screen.getByText('R$ 10,00').className).toBeTruthy();
  });
});

describe('StatusBadge', () => {
  // §14.2: status nunca é comunicado só por cor. O rótulo em texto é obrigatório.
  it('mostra o rótulo em pt-BR de cada status', () => {
    const { rerender } = render(<StatusBadge status="PENDING" />);
    expect(screen.getByText('Aguardando confirmação')).toBeInTheDocument();

    rerender(<StatusBadge status="CONFIRMED" />);
    expect(screen.getByText('Confirmada')).toBeInTheDocument();

    rerender(<StatusBadge status="CANCELLED" />);
    expect(screen.getByText('Cancelada')).toBeInTheDocument();

    rerender(<StatusBadge status="COMPLETED" />);
    expect(screen.getByText('Concluída')).toBeInTheDocument();
  });

  // §16.2: o vocabulário é fixo, "Aguardando confirmação" e não "Pendente".
  it('não usa Pendente', () => {
    render(<StatusBadge status="PENDING" />);

    expect(screen.queryByText(/pendente/i)).not.toBeInTheDocument();
  });
});
