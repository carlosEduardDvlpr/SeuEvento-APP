/**
 * Conversão entre o dia de reserva ('YYYY-MM-DD') e o `Date` do calendário.
 *
 * O `react-day-picker` trabalha com `Date` em **meia-noite local**: é isso que ele
 * entrega no `onSelect` e é isso que ele espera em `selected` e `month`. Por isso
 * as duas pontas usam componentes locais.
 *
 * Ancorar em UTC aqui seria a armadilha da §7.3 ao contrário. Em fuso positivo, a
 * meia-noite local de 10/12 é 09/12 em UTC: a pessoa clicaria num dia e
 * reservaria o anterior. Em fuso negativo o engano acontece na volta, ao mandar
 * uma data UTC para o calendário.
 *
 * Vive num arquivo próprio para ser testável com o fuso trocado, que é a única
 * forma de provar que a conversão não depende de onde o navegador está.
 */

/** 'YYYY-MM-DD' → meia-noite local, como o calendário espera. */
export function toCalendarDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number];
  return new Date(year, month - 1, day);
}

/** `Date` local → 'YYYY-MM-DD', pelo dia que a pessoa vê na tela. */
export function toISODate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Primeiro dia do mês em que a data cai, em 'YYYY-MM-DD'. */
export function firstDayOfMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Último dia do mês em que a data cai. Dia 0 do mês seguinte é o último do atual. */
export function lastDayOfMonth(date: Date): string {
  return toISODate(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

/** Mesmo dia, `months` meses à frente. */
export function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

/**
 * Dias entre as pontas, contando as duas: de 05 a 06 são dois (§7.3).
 *
 * A conta é feita sobre as strings ancoradas em UTC, e não sobre os `Date` locais
 * do calendário: assim o resultado não muda num dia de troca de horário de verão,
 * em que a diferença entre duas meia-noites locais é de 23 ou 25 horas.
 */
export function dayCount(startISO: string, endISO: string): number {
  const start = Date.parse(`${startISO}T00:00:00.000Z`);
  const end = Date.parse(`${endISO}T00:00:00.000Z`);
  return (end - start) / 86_400_000 + 1;
}
