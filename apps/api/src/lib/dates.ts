/**
 * Datas do negócio (§7.3).
 *
 * Dia de reserva é data sem fuso: trafega como 'YYYY-MM-DD' e vive em coluna
 * `date` no Postgres. Timestamp (createdAt, holdExpiresAt) é outra coisa —
 * instante em UTC — e não passa por aqui.
 */

/** Dia do calendário no formato em que a API o expõe. */
export type ISODate = string;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Converte 'YYYY-MM-DD' no Date que o driver grava em coluna `date`.
 *
 * A âncora em meia-noite UTC é obrigatória: montar a data no fuso local
 * (`new Date(2026, 11, 24)`) faria o driver gravar o dia anterior em qualquer
 * fuso negativo, e o do negócio é America/Sao_Paulo (UTC-3).
 */
export function parseISODate(value: ISODate): Date {
  if (!ISO_DATE.test(value)) {
    throw new Error(`Data fora do formato YYYY-MM-DD: ${value}`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Data inexistente no calendário: ${value}`);
  }
  // Rejeita o que o JS "conserta" sozinho (31/04 vira 01/05).
  if (date.toISOString().slice(0, 10) !== value) {
    throw new Error(`Data inexistente no calendário: ${value}`);
  }
  return date;
}

/** Volta para 'YYYY-MM-DD'. Lê os componentes em UTC, nunca no fuso da máquina. */
export function toISODate(date: Date): ISODate {
  return date.toISOString().slice(0, 10);
}
