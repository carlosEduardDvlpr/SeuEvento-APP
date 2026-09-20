import { createTransport, type Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from './logger.js';
import type { Email } from './mail/render.js';

/**
 * Envio de e-mail (§17 e §20.1).
 *
 * Duas regras governam este arquivo:
 *
 * 1. **Falha ao enviar não desfaz nada.** Se o SMTP cair, o cadastro e a reserva
 *    continuam valendo: o erro vai para o log e a pessoa sempre pode pedir
 *    reenvio. Derrubar a transação por causa do e-mail seria trocar um problema
 *    pequeno por um grande.
 * 2. **Em desenvolvimento não se envia nada.** Com `MAIL_TRANSPORT=log` o e-mail
 *    é registrado com os links à mostra, que é como se testa o fluxo de
 *    confirmação sem caixa de entrada de verdade.
 */

export type SendMailInput = Email & { to: string };

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    if (!env.SMTP_URL) {
      // O env.ts já barra esta combinação no start; aqui é só a garantia de tipo.
      throw new Error('MAIL_TRANSPORT=smtp exige SMTP_URL.');
    }
    transporter = createTransport(env.SMTP_URL);
  }
  return transporter;
}

/** Extrai os endereços do corpo em texto, para o modo log mostrar no terminal. */
function extractLinks(text: string): string[] {
  return text.match(/https?:\/\/\S+/g) ?? [];
}

export async function sendMail({ to, subject, html, text }: SendMailInput): Promise<void> {
  try {
    if (env.MAIL_TRANSPORT === 'log') {
      // Os links aparecem de propósito: é o único jeito de concluir o cadastro
      // em desenvolvimento. Nunca acontece com transporte `smtp`.
      logger.info({ to, subject, links: extractLinks(text) }, 'E-mail (modo log, não enviado)');
      return;
    }

    await getTransporter().sendMail({ from: env.MAIL_FROM, to, subject, html, text });
    // Só metadado no log: o corpo carrega token e dado pessoal (§10.7).
    logger.info({ to, subject }, 'E-mail enviado');
  } catch (error) {
    logger.error({ err: error, to, subject }, 'Falha ao enviar e-mail');
  }
}

/** Usado pelos testes para trocar o transporte sem tocar em rede. */
export function resetMailerForTests(): void {
  transporter = null;
}
