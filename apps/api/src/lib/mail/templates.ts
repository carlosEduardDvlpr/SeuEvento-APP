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
 * Redefinição de senha (§10.5).
 *
 * A validade curta é o que limita o dano de um link que fique esquecido numa
 * caixa de entrada compartilhada.
 */
export function resetPasswordTemplate({
  name,
  resetUrl,
}: {
  name: string;
  resetUrl: string;
}): Email {
  return renderEmail('Redefinir a senha da sua conta', {
    preheader: 'Um link para você escolher uma senha nova.',
    heading: 'Escolha uma senha nova',
    paragraphs: [
      `Olá, ${name}. Recebemos um pedido para trocar a senha da sua conta.`,
      'O link vale por 1 hora. Depois de trocar, as sessões abertas em outros aparelhos são encerradas.',
    ],
    action: { label: 'Definir nova senha', url: resetUrl },
    note: 'Se não foi você que pediu, ignore esta mensagem: sua senha continua a mesma.',
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

/**
 * Pedido de reserva recebido (§17).
 *
 * O prazo do bloqueio é a informação mais importante aqui, e por isso aparece no
 * assunto e no primeiro parágrafo: é o que define quanto tempo a pessoa tem até
 * a data voltar a ficar disponível para outra.
 *
 * Chamamos de "pedido", não de "reserva": enquanto está `PENDING` nada está
 * confirmado, e a §1.4 pede exatamente essa palavra na interface.
 */
export function bookingReceivedTemplate({
  name,
  dates,
  totalFormatted,
  holdHours,
  bookingUrl,
}: {
  name: string;
  /** Período em linguagem natural, ex.: "5 a 6 de dezembro de 2026". */
  dates: string;
  totalFormatted: string;
  holdHours: number;
  bookingUrl: string;
}): Email {
  return renderEmail('Recebemos seu pedido de reserva', {
    preheader: `Seguramos as datas por ${holdHours} horas enquanto confirmamos.`,
    heading: 'Recebemos seu pedido',
    paragraphs: [
      `Olá, ${name}. Seu pedido para ${dates} chegou, e as datas estão seguras por ${holdHours} horas enquanto a gente confirma.`,
      `Total do pedido: ${totalFormatted}.`,
      'Você recebe um e-mail assim que a reserva for confirmada. Se preferir, pode acompanhar pelo site.',
    ],
    action: { label: 'Ver meu pedido', url: bookingUrl },
    note: 'Nada foi cobrado ainda. O pagamento é combinado direto com a chácara.',
  });
}

/**
 * Prazo do pedido vencido (§9.2, §9.9).
 *
 * Avisa **o que fazer agora**, porque a pessoa não fez nada de errado: o pedido
 * simplesmente não foi confirmado no prazo, e as datas voltaram para o calendário.
 */
export function holdExpiredTemplate({
  name,
  dates,
  holdHours,
  bookingUrl,
}: {
  name: string;
  dates: string;
  holdHours: number;
  bookingUrl: string;
}): Email {
  return renderEmail('Seu pedido de reserva expirou', {
    preheader: 'As datas voltaram a ficar disponíveis.',
    heading: 'O prazo do seu pedido terminou',
    paragraphs: [
      `Olá, ${name}. Seu pedido para ${dates} ficou ${holdHours} horas sem confirmação, então as datas voltaram para o calendário.`,
      'Se ainda quer essas datas, dá para enviar um pedido novo: elas podem estar livres.',
    ],
    action: { label: 'Ver datas livres', url: bookingUrl },
    note: 'Se você já desistiu, não precisa fazer nada.',
  });
}
