import type { ApiErrorCode } from '@chacara/shared';
import type { FastifyError, FastifyInstance, FastifyReply } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from 'fastify-type-provider-zod';
import { AppError } from '../lib/errors.js';

/**
 * Mensagens dos erros que o próprio framework gera. Os erros de domínio trazem
 * a própria mensagem, escrita no tom da §16.4 por quem conhece o contexto
 * ("O dia 24/12 acabou de ser reservado" diz mais que "conflito").
 */
const FRAMEWORK_MESSAGES: Record<ApiErrorCode, string> = {
  VALIDATION_ERROR: 'Confira os campos destacados e tente de novo.',
  INVALID_CREDENTIALS: 'E-mail ou senha incorretos. Confira e tente de novo.',
  UNAUTHORIZED: 'Sua sessão expirou. Entre de novo para continuar.',
  EMAIL_NOT_VERIFIED: 'Confirme seu e-mail para entrar.',
  FORBIDDEN: 'Você não tem acesso a esta área.',
  NOT_FOUND: 'Não encontramos o que você procura.',
  DATE_UNAVAILABLE: 'Uma ou mais datas escolhidas não estão mais disponíveis.',
  STOCK_INSUFFICIENT: 'Um dos itens não tem unidades suficientes nessas datas.',
  PRICE_CHANGED: 'O valor mudou. Confira o novo total antes de enviar.',
  EMAIL_IN_USE: 'Este e-mail já está em uso.',
  INVALID_TOKEN: 'Este link expirou ou já foi usado. Peça um novo.',
  INVALID_TRANSITION: 'Esta reserva não pode mudar para esse status.',
  CANCEL_WINDOW_CLOSED: 'O prazo para cancelar pelo site terminou. Fale com a gente pelo WhatsApp.',
  TOO_MANY_PENDING: 'Você já tem pedidos aguardando confirmação. Espere a resposta da chácara.',
  RATE_LIMITED: 'Muitas tentativas. Tente de novo em alguns minutos.',
  INTERNAL: 'Algo deu errado do nosso lado. Tente de novo em instantes.',
};

/** Erros que o Fastify levanta antes de qualquer handler nosso rodar. */
const STATUS_TO_CODE: Record<number, ApiErrorCode> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'NOT_FOUND',
  413: 'VALIDATION_ERROR',
  415: 'VALIDATION_ERROR',
  429: 'RATE_LIMITED',
};

/**
 * Onde a mensagem genérica do código enganaria o usuário. "Confira os campos
 * destacados" não ajuda quem mandou um texto de 200 KB: não há campo destacado.
 */
const STATUS_MESSAGES: Record<number, string> = {
  413: 'O envio é grande demais. Reduza o texto das observações e tente de novo.',
  415: 'Formato de conteúdo não suportado.',
};

function sendError(
  reply: FastifyReply,
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: unknown,
) {
  return reply
    .status(status)
    .type('application/json')
    .send({
      error: details === undefined ? { code, message } : { code, message, details },
    });
}

/** `/email` (JSON pointer) vira `email`, que é o nome do campo no formulário. */
function toFieldName(instancePath: string): string {
  return instancePath.replace(/^\//, '').replace(/\//g, '.');
}

/**
 * Um único error handler converte tudo no formato da §11.1.
 *
 * Nenhuma rota monta corpo de erro à mão, e nada de stack trace ou mensagem
 * interna do Prisma sai para o cliente (§10.7).
 */
export async function registerErrorHandler(app: FastifyInstance) {
  app.setNotFoundHandler((request, reply) =>
    sendError(reply, 404, 'NOT_FOUND', FRAMEWORK_MESSAGES.NOT_FOUND, {
      method: request.method,
      url: request.url,
    }),
  );

  app.setErrorHandler((error: FastifyError, request, reply) => {
    // Erro de domínio: esperado, já vem com código, status e mensagem prontos.
    if (error instanceof AppError) {
      request.log.info({ errorCode: error.code }, 'Requisição recusada pela regra de negócio');
      return sendError(reply, error.status, error.code, error.message, error.details);
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      return sendError(reply, 400, 'VALIDATION_ERROR', FRAMEWORK_MESSAGES.VALIDATION_ERROR, {
        // `validationContext` diz se o problema estava no corpo, na rota ou na query.
        context: error.validationContext ?? 'body',
        fields: error.validation.map((issue) => ({
          field: toFieldName(issue.instancePath),
          message: issue.message ?? 'Valor inválido.',
        })),
      });
    }

    // Resposta fora do schema declarado é bug nosso, não erro do cliente.
    if (isResponseSerializationError(error)) {
      request.log.error({ err: error }, 'Resposta fora do schema declarado');
      return sendError(reply, 500, 'INTERNAL', FRAMEWORK_MESSAGES.INTERNAL);
    }

    const status = error.statusCode ?? 500;
    const mapped = STATUS_TO_CODE[status];
    if (mapped && status < 500) {
      request.log.warn({ err: error, statusCode: status }, 'Requisição recusada');
      return sendError(
        reply,
        status,
        mapped,
        STATUS_MESSAGES[status] ?? FRAMEWORK_MESSAGES[mapped],
      );
    }

    // Só aqui o log carrega o erro inteiro; a resposta continua genérica.
    request.log.error({ err: error }, 'Erro não tratado');
    return sendError(reply, 500, 'INTERNAL', FRAMEWORK_MESSAGES.INTERNAL);
  });
}

export { FRAMEWORK_MESSAGES };
