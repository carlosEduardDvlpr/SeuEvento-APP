import { Field, type FieldProps } from './Field';

/**
 * Campo de dinheiro (§7.2).
 *
 * O dono digita em reais, o sistema guarda centavos. A conversão fica aqui e não
 * em cada formulário, porque é o ponto onde um `parseFloat` esquecido viraria um
 * preço cem vezes errado.
 *
 * `Math.round` na multiplicação é obrigatório: `19.99 * 100` dá 1998.9999... em
 * ponto flutuante, e truncar cobraria um centavo menos.
 */
export type MoneyFieldProps = Omit<FieldProps, 'value' | 'onChange' | 'type'> & {
  /** Valor em centavos. */
  valueCents: number | null;
  onChangeCents: (cents: number | null) => void;
};

export function toCents(reais: string): number | null {
  if (reais.trim() === '') return null;

  const value = Number(reais);
  if (Number.isNaN(value)) return null;

  return Math.round(value * 100);
}

export function toReais(cents: number | null): string {
  if (cents === null) return '';

  // `toFixed(2)` e não divisão crua: 1/3 de real não existe, e o campo não deve
  // mostrar dízima.
  return (cents / 100).toFixed(2);
}

export function MoneyField({ valueCents, onChangeCents, ...props }: MoneyFieldProps) {
  return (
    <Field
      type="number"
      min={0}
      step="0.01"
      inputMode="decimal"
      value={toReais(valueCents)}
      onChange={(event) => onChangeCents(toCents(event.target.value))}
      {...props}
    />
  );
}
