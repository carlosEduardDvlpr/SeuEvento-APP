import { useId } from 'react';
import { MinusIcon, PlusIcon } from './icons';
import styles from './QuantityStepper.module.css';

/**
 * Seletor de quantidade (§12.6, §14.11).
 *
 * Botões de 44 px em volta de um campo numérico, e não um `select`: no celular o
 * ajuste de uma unidade é um toque, e digitar continua possível para quem quer
 * dez de uma vez.
 *
 * O campo é o dono do valor para leitor de tela; os botões têm `aria-label`
 * próprio e o rótulo visível fica fora do componente, junto do nome do item.
 */
export type QuantityStepperProps = {
  value: number;
  onChange: (value: number) => void;
  /** Zero é válido: significa "não quero este item". */
  min?: number;
  max: number;
  /** Nome do item, usado nos rótulos dos botões. */
  label: string;
  disabled?: boolean;
};

export function QuantityStepper({
  value,
  onChange,
  min = 0,
  max,
  label,
  disabled = false,
}: QuantityStepperProps) {
  const id = useId();

  // O teto vem do estoque, então pode ser menor que o valor já escolhido se o
  // catálogo mudou; `clamp` evita oferecer um botão que não faz nada.
  const clamp = (next: number) => Math.min(max, Math.max(min, next));

  return (
    <div className={styles.stepper}>
      <button
        type="button"
        className={styles.button}
        onClick={() => onChange(clamp(value - 1))}
        disabled={disabled || value <= min}
        aria-label={`Diminuir ${label}`}
      >
        <MinusIcon size={20} />
      </button>

      <input
        id={id}
        className={styles.value}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(event) =>
          onChange(event.target.value === '' ? min : clamp(Number(event.target.value)))
        }
        aria-label={`Quantidade de ${label}`}
      />

      <button
        type="button"
        className={styles.button}
        onClick={() => onChange(clamp(value + 1))}
        disabled={disabled || value >= max}
        aria-label={`Aumentar ${label}`}
      >
        <PlusIcon size={20} />
      </button>
    </div>
  );
}
