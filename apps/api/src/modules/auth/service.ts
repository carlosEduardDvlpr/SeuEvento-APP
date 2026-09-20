import type { RegisterBody } from '@chacara/shared';
import { env } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { UserModel } from '../../generated/prisma/models.js';
import { AppError } from '../../lib/errors.js';
import { accountExistsTemplate, verifyEmailTemplate } from '../../lib/mail/templates.js';
import { sendMail } from '../../lib/mailer.js';
import { hashPassword } from '../../lib/password.js';
import { consumeAuthToken, issueAuthToken } from '../../lib/tokens.js';

/**
 * Cadastro e confirmação de e-mail (§10.2).
 *
 * A regra que molda todo este arquivo é **não vazar quais e-mails têm conta**
 * (§10.2). `register` e `resendVerification` sempre devolvem a mesma coisa; o que
 * muda é o e-mail que chega, e só o dono da caixa de entrada vê a diferença.
 */

/** Mensagem única de `register` e `resendVerification`, em todos os casos. */
export const ACCEPTED_MESSAGE =
  'Enviamos um e-mail com o próximo passo. Confira sua caixa de entrada.';

function verifyUrl(token: string): string {
  return `${env.APP_URL}/verificar-email?token=${encodeURIComponent(token)}`;
}

async function sendVerification(prisma: PrismaClient, user: UserModel): Promise<void> {
  if (!user.email) return;

  const token = await issueAuthToken(prisma, { userId: user.id, type: 'EMAIL_VERIFY' });
  const email = verifyEmailTemplate({ name: user.name, verifyUrl: verifyUrl(token) });

  await sendMail({ to: user.email, ...email });
}

async function sendAccountExists(user: UserModel): Promise<void> {
  if (!user.email) return;

  const email = accountExistsTemplate({
    signInUrl: `${env.APP_URL}/entrar`,
    resetPasswordUrl: `${env.APP_URL}/esqueci-senha`,
    hasGoogle: user.googleId !== null,
  });

  await sendMail({ to: user.email, ...email });
}

export async function register(prisma: PrismaClient, body: RegisterBody): Promise<void> {
  // O e-mail já chega normalizado pelo schema compartilhado (§10.1).
  const existing = await prisma.user.findUnique({ where: { email: body.email } });

  if (!existing) {
    const created = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        phone: body.phone ?? null,
        passwordHash: await hashPassword(body.password),
        termsAcceptedAt: new Date(),
      },
    });

    await sendVerification(prisma, created);
    return;
  }

  /*
   * §9.8: conta criada pelo admin (sem senha e sem Google) é **assumida** por
   * quem se cadastra com o mesmo e-mail, depois de confirmar.
   *
   * Só a senha e o aceite dos termos são gravados agora. Nome e telefone ficam
   * como o admin registrou: sem confirmar o e-mail, ninguém provou ser o dono da
   * conta, e deixar sobrescrever esses campos daria a um estranho o poder de
   * alterar o cadastro de um cliente real. A pessoa ajusta depois em `/me`.
   */
  const canBeClaimed = existing.passwordHash === null && existing.googleId === null;

  if (canBeClaimed) {
    const claimed = await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash: await hashPassword(body.password),
        termsAcceptedAt: new Date(),
      },
    });

    await sendVerification(prisma, claimed);
    return;
  }

  // Conta com senha ou com Google: nada muda, e o dono é avisado da tentativa.
  await sendAccountExists(existing);
}

export async function resendVerification(prisma: PrismaClient, email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });

  // Sem conta, ou já confirmada: nada a fazer, e a resposta é a mesma de sempre.
  if (!user || user.emailVerifiedAt !== null) return;

  await sendVerification(prisma, user);
}

/**
 * Confirma o e-mail e devolve o usuário para a sessão ser aberta (§10.2, passo 5).
 *
 * Confirmar já autentica porque quem clicou no link provou ter acesso à caixa de
 * entrada; pedir a senha em seguida seria atrito sem ganho.
 */
export async function verifyEmail(prisma: PrismaClient, token: string): Promise<UserModel> {
  const { userId } = await consumeAuthToken(prisma, { token, type: 'EMAIL_VERIFY' });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError('INVALID_TOKEN', 400, 'Este link expirou ou já foi usado. Peça um novo.');
  }

  // Confirmar de novo não é erro: o token de uso único já barrou a repetição.
  if (user.emailVerifiedAt !== null) return user;

  return prisma.user.update({
    where: { id: user.id },
    data: { emailVerifiedAt: new Date() },
  });
}
