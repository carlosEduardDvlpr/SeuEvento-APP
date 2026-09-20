/**
 * Dinheiro (§7.2).
 *
 * Tudo em inteiro de centavos. Não existe `float` nem `Decimal` no caminho do
 * cálculo, e a formatação em reais acontece só na borda da UI.
 */

/** Soma valores em centavos. */
export function sumCents(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/**
 * Desconto percentual sobre um valor em centavos.
 *
 * O arredondamento acontece aqui, no desconto, e nunca no total: arredondar o
 * total mudaria o valor que o cliente já viu no resumo (§7.2).
 */
export function percentOfCents(cents: number, percent: number): number {
  return Math.round((cents * percent) / 100);
}

/** Desconto nunca é negativo: combo de preço fechado acima da soma vale zero (§9.6). */
export function clampToZero(cents: number): number {
  return Math.max(0, cents);
}
