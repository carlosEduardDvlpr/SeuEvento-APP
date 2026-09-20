import { type Email, renderEmail } from './render.js';

/**
 * E-mails transacionais (§17).
 *
 * Assunto direto e específico, nunca em caixa-alta. O texto segue a voz da §16.1:
 * fala com a pessoa por "você", em frases curtas, sem pedir desculpa e sem termo
 * técnico.
 */

/**
 * Confirmação de cadastro (§10.2).
 *
 * O link aponta para a rota do SPA, que faz `POST /auth/verify-email`. Não é um
 * GET que confirma: pré-visualizador de e-mail abre links, e isso confirmaria a
 * conta sem a pessoa clicar.
 */
export function verifyEmailTemplate({
  name,
  verifyUrl,
}: {
  name: string;
  verifyUrl: string;
}): Email {
  return renderEmail('Confirme seu e-mail para acessar sua conta', {
    preheader: 'Falta um clique para você poder reservar a chácara.',
    // Saudação neutra: o cadastro não pergunta gênero e não cabe adivinhar.
    heading: 'Confirme seu e-mail',
    paragraphs: [
      `Olá, ${name}. Confirme seu e-mail para entrar na sua conta e enviar pedidos de reserva.`,
      'O link vale por 24 horas.',
    ],
    action: { label: 'Confirmar meu e-mail', url: verifyUrl },
    note: 'Se não foi você que criou esta conta, ignore esta mensagem.',
  });
}

/**
 * Aviso de que a conta já existe (§10.2).
 *
 * É a peça que permite o cadastro responder igual para e-mail novo e existente:
 * quem tenta se cadastrar recebe sempre a mesma resposta na tela, e só o dono da
 * caixa de entrada descobre qual dos dois casos aconteceu.
 */
export function accountExistsTemplate({
  signInUrl,
  resetPasswordUrl,
  hasGoogle,
}: {
  signInUrl: string;
  resetPasswordUrl: string;
  hasGoogle: boolean;
}): Email {
  return renderEmail('Você já tem conta na chácara', {
    preheader: 'Alguém tentou criar uma conta com este e-mail.',
    heading: 'Você já tem conta',
    paragraphs: [
      'Recebemos um cadastro com este e-mail, mas ele já tem uma conta. Não criamos nada novo.',
      hasGoogle
        ? 'Para entrar, use o botão "Continuar com o Google".'
        : 'Se você não lembra a senha, pode definir uma nova.',
    ],
    action: { label: 'Entrar na minha conta', url: signInUrl },
    note: hasGoogle
      ? 'Se não foi você que tentou, ignore esta mensagem.'
      : `Para trocar a senha: ${resetPasswordUrl}`,
  });
}
