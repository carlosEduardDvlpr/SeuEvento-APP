/**
 * Datas do negócio (§7.3).
 *
 * A implementação mora em `packages/shared/src/dates.ts`, porque o SPA também
 * precisa saber que dia é hoje **na chácara**: a tela de reservas separa próximas
 * de passadas, e o relógio do visitante pode estar em outro fuso. Duas
 * implementações de "hoje" divergiriam justamente na virada do dia, que é quando
 * a diferença aparece.
 *
 * Os imports da API continuam vindo daqui para não precisarem saber disso.
 */
export {
  BUSINESS_TIMEZONE,
  type ISODate,
  addDays,
  dayOfWeek,
  daysBetweenInclusive,
  eachDay,
  parseISODate,
  toISODate,
  todayInSaoPaulo,
} from '@chacara/shared';
