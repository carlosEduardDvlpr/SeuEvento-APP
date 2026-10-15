import { useEffect, useState } from 'react';

/**
 * Valor que só se assenta depois de `delay` sem alteração.
 *
 * Serve ao orçamento da revisão, que a §13.2 manda chamar com debounce de 300 ms.
 * Sem isso, cada toque no seletor de quantidade dispararia uma requisição e o
 * total piscaria valores intermediários que a pessoa nunca escolheu.
 *
 * A comparação é por **referência**, então quem chama precisa passar um valor
 * memoizado — é o que mantém o hook simples e deixa a decisão de "o que conta
 * como mudança" com quem conhece os dados.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return settled;
}
