import type { BookingKind } from '@chacara/shared';
import { type Email, renderEmail } from './render.js';

/*
 * Os e-mails de reserva recebem `kind` (T32), e o padrão é a chácara.
 *
 * A decoração sozinha muda o que cada e-mail promete: não há "datas seguras"
 * nem "a chácara é sua nesses dias", e sim **itens separados** para um dia, com
 * a retirada combinada direto com a dona. O texto da chácara ficou exatamente
 * como era.
 */

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
  kind = 'VENUE',
}: {
  name: string;
  /** Período em linguagem natural, ex.: "5 a 6 de dezembro de 2026". */
  dates: string;
  totalFormatted: string;
  holdHours: number;
  bookingUrl: string;
  kind?: BookingKind;
}): Email {
  if (kind === 'DECORATION') {
    return renderEmail('Recebemos seu pedido de decoração', {
      preheader: `Separamos os itens por ${holdHours} horas enquanto confirmamos.`,
      heading: 'Recebemos seu pedido',
      paragraphs: [
        `Olá, ${name}. Seu pedido de decoração para ${dates} chegou, e os itens ficam separados para você por ${holdHours} horas enquanto a gente confirma.`,
        `Total do pedido: ${totalFormatted}.`,
        'Você recebe um e-mail assim que a reserva for confirmada. Se preferir, pode acompanhar pelo site.',
      ],
      action: { label: 'Ver meu pedido', url: bookingUrl },
      note: 'Nada foi cobrado ainda. O pagamento e a retirada dos itens são combinados direto com a gente.',
    });
  }

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
  kind = 'VENUE',
}: {
  name: string;
  dates: string;
  holdHours: number;
  bookingUrl: string;
  kind?: BookingKind;
}): Email {
  if (kind === 'DECORATION') {
    return renderEmail('Seu pedido de decoração expirou', {
      preheader: 'Os itens voltaram a ficar disponíveis.',
      heading: 'O prazo do seu pedido terminou',
      paragraphs: [
        `Olá, ${name}. Seu pedido de decoração para ${dates} ficou ${holdHours} horas sem confirmação, então os itens voltaram a ficar disponíveis.`,
        'Se ainda quer a decoração, dá para enviar um pedido novo: os itens podem estar livres.',
      ],
      action: { label: 'Fazer um pedido novo', url: bookingUrl },
      note: 'Se você já desistiu, não precisa fazer nada.',
    });
  }

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

/**
 * Novo pedido para o dono (§17).
 *
 * O e-mail do cliente diz "aguarde"; este é o que faz a espera terminar. Sem ele
 * o dono só descobriria o pedido abrindo o painel por conta própria, e o prazo de
 * bloqueio correria sozinho.
 *
 * Vai direto para o detalhe no painel, onde estão os botões de confirmar e
 * recusar: o dono normalmente lê isso no celular e não deveria ter de navegar.
 */
export function newBookingForAdminTemplate({
  customerName,
  customerPhone,
  dates,
  guestCount,
  totalFormatted,
  adminUrl,
  kind = 'VENUE',
}: {
  customerName: string;
  customerPhone: string | null;
  dates: string;
  /** Nulo na decoração, que não recebe convidados. */
  guestCount: number | null;
  totalFormatted: string;
  adminUrl: string;
  kind?: BookingKind;
}): Email {
  const phone = customerPhone
    ? `WhatsApp do cliente: ${customerPhone}.`
    : 'O cliente não deixou telefone no perfil.';

  if (kind === 'DECORATION' || guestCount === null) {
    return renderEmail(`Novo pedido de decoração: ${dates}`, {
      preheader: `${customerName} pediu decoração para ${dates}. Confirme ou recuse pelo painel.`,
      heading: 'Chegou um pedido de decoração',
      paragraphs: [
        `${customerName} pediu só a decoração (pegue e monte, sem a chácara) para ${dates}.`,
        `Total do pedido: ${totalFormatted}.`,
        phone,
      ],
      action: { label: 'Ver o pedido no painel', url: adminUrl },
      // A dona precisa saber que este pedido não mexeu na agenda da chácara.
      note: 'A data continua livre para a chácara. Os itens ficam separados até você responder ou o prazo terminar.',
    });
  }

  return renderEmail(`Novo pedido de reserva: ${dates}`, {
    preheader: `${customerName} pediu ${dates}. Confirme ou recuse pelo painel.`,
    heading: 'Chegou um pedido de reserva',
    paragraphs: [
      `${customerName} pediu a chácara para ${dates}, para ${guestCount} ${guestCount === 1 ? 'pessoa' : 'pessoas'}.`,
      `Total do pedido: ${totalFormatted}.`,
      phone,
    ],
    action: { label: 'Ver o pedido no painel', url: adminUrl },
    note: 'As datas ficam seguras até você responder ou o prazo terminar.',
  });
}

/**
 * Reserva cancelada (§17).
 *
 * Serve para os dois lados do cancelamento — o que o cliente faz e o que o dono
 * faz — então o motivo só aparece quando existe, e o caminho para conversar vem
 * sempre. Cancelamento é quando a pessoa mais precisa saber como falar com
 * alguém.
 */
export function bookingCancelledTemplate({
  name,
  dates,
  reason,
  whatsapp,
  kind = 'VENUE',
}: {
  name: string;
  dates: string;
  reason: string | null;
  whatsapp: string | null;
  kind?: BookingKind;
}): Email {
  const decoration = kind === 'DECORATION';

  const paragraphs = [
    decoration
      ? `Olá, ${name}. A reserva da decoração para ${dates} foi cancelada.`
      : `Olá, ${name}. A reserva de ${dates} foi cancelada.`,
  ];

  if (reason) paragraphs.push(`Motivo: ${reason}`);

  paragraphs.push(
    whatsapp
      ? `Se ficou alguma dúvida, fale com a chácara pelo WhatsApp ${whatsapp}.`
      : 'Se ficou alguma dúvida, responda este e-mail que a gente ajuda.',
  );

  return renderEmail('Sua reserva foi cancelada', {
    preheader: decoration
      ? 'Os itens voltaram a ficar disponíveis.'
      : 'As datas voltaram a ficar disponíveis.',
    heading: 'Reserva cancelada',
    paragraphs,
    note: decoration
      ? 'Os itens voltaram a ficar disponíveis. Se quiser tentar de novo, eles podem estar livres.'
      : 'As datas voltaram para o calendário. Se quiser tentar de novo, elas podem estar livres.',
  });
}

/**
 * Reserva confirmada (§17).
 *
 * É o e-mail que encerra a espera, então ele carrega o que a pessoa vai precisar
 * no dia: horário de entrada e saída, endereço e as regras da casa. Quem recebe
 * isto arquiva o e-mail e volta a ele na véspera da festa — por isso os dados
 * vêm no corpo, e não só num link para o site.
 */
export function bookingConfirmedTemplate({
  name,
  dates,
  checkInTime,
  checkOutTime,
  totalFormatted,
  address,
  houseRules,
  whatsapp,
  bookingUrl,
  kind = 'VENUE',
}: {
  name: string;
  dates: string;
  checkInTime: string;
  checkOutTime: string;
  totalFormatted: string;
  address: string | null;
  houseRules: string | null;
  whatsapp: string | null;
  bookingUrl: string;
  kind?: BookingKind;
}): Email {
  /*
   * Decoração confirmada não carrega horário de entrada nem regras da casa: são
   * da chácara, e a pessoa não vai estar lá. Também não leva o endereço — onde a
   * retirada acontece é combinado com a dona, e o e-mail não deveria inventar.
   */
  if (kind === 'DECORATION') {
    return renderEmail('Sua reserva está confirmada', {
      preheader: `Decoração para ${dates} confirmada.`,
      heading: 'Reserva confirmada',
      paragraphs: [
        `Olá, ${name}. Sua reserva da decoração para ${dates} está confirmada.`,
        `Valor combinado: ${totalFormatted}.`,
        whatsapp
          ? `Para combinar a retirada e a devolução dos itens, fale com a gente pelo WhatsApp ${whatsapp}.`
          : 'Para combinar a retirada e a devolução dos itens, responda este e-mail.',
      ],
      action: { label: 'Ver minha reserva', url: bookingUrl },
      note: 'O pagamento é combinado direto com a gente.',
    });
  }

  const paragraphs = [
    `Olá, ${name}. Sua reserva de ${dates} está confirmada. A chácara é sua nesses dias.`,
    `Entrada a partir das ${checkInTime} e saída até as ${checkOutTime}.`,
    `Valor combinado: ${totalFormatted}.`,
  ];

  if (address) paragraphs.push(`Endereço: ${address}`);
  if (houseRules) paragraphs.push(`Regras da casa: ${houseRules}`);

  paragraphs.push(
    whatsapp
      ? `Qualquer dúvida até lá, fale com a gente pelo WhatsApp ${whatsapp}.`
      : 'Qualquer dúvida até lá, responda este e-mail.',
  );

  return renderEmail('Sua reserva está confirmada', {
    preheader: `${dates}, das ${checkInTime} às ${checkOutTime}.`,
    heading: 'Reserva confirmada',
    paragraphs,
    action: { label: 'Ver minha reserva', url: bookingUrl },
    note: 'O pagamento é combinado direto com a chácara.',
  });
}
