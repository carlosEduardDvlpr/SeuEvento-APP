import { pino } from 'pino';
import { isTest } from '../config/env.js';

/**
 * Logger para o que roda fora do ciclo de requisição: seed e jobs.
 *
 * Dentro de uma rota o certo é `request.log`, que carrega o `reqId`. Aqui não há
 * requisição, mas `console` continua proibido (§2.2): script chamado por cron
 * precisa de log estruturado para a plataforma coletar.
 *
 * Sem formatador bonito de propósito: seria uma dependência a mais só para o
 * olho humano, e a saída em JSON funciona igual no terminal e no coletor.
 */
export const logger = pino({
  level: isTest ? 'silent' : 'info',
});
