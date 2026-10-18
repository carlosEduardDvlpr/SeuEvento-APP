/**
 * Formatação da interface.
 *
 * A implementação mora em `packages/shared/src/format.ts`, porque o e-mail
 * transacional renderizado pela API precisa formatar exatamente igual (§7.3). Os
 * componentes continuam importando daqui para não precisarem saber disso.
 */
export {
  capitalizeFirst,
  describeItems,
  formatBRL,
  formatDateLong,
  formatDateRange,
  formatDateShort,
  formatDeadline,
  formatTimeUntil,
  formatWeekdayAndDay,
} from '@chacara/shared';
