import type { PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { activeBookingsFilter } from '../availability/service.js';

/**
 * Anonimização da conta (§10.8).
 *
 * A §10.8 pede remoção dos dados pessoais **mantendo as reservas**, por razão
 * fiscal e histórica. Por isso a linha de `User` não é apagada: ela é o destino
 * da chave estrangeira de `Booking`, e apagá-la levaria o histórico junto (ou
 * seria recusada pelo `onDelete: RESTRICT`). O que sai são os dados que
 * identificam a pessoa.
 *
 * Fora nome, e-mail e telefone, somem também as credenciais. Isso não é zelo
 * extra: com `googleId` preservado, quem apagou a conta voltaria a entrar nela
 * pelo botão do Google e encontraria o histórico — a remoção não teria valido
 * nada.
 */
const ANONYMIZED_NAME = 'Conta removida';

/**
 * Reserva em andamento impede a remoção.
 *
 * O motivo é concreto: apagar o telefone de quem tem festa marcada deixa a
 * chácara sem como avisar de chuva, mudança de horário ou qualquer imprevisto —
 * e deixa a pessoa sem como ser avisada. A LGPD reconhece a guarda de dado
 * necessário para executar o contrato (art. 16), e uma reserva confirmada é
 * exatamente isso.
 *
 * A recusa é temporária e sai com o caminho: cancelar pelo site (§9.2) ou falar
 * com a chácara. Não é "você não pode apagar", é "ainda não".
 */
export async function anonymizeOwnAccount(
  prisma: PrismaClient,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });

  // Token válido de conta que já não existe — ou que já foi anonimizada.
  if (!user) {
    throw new AppError('UNAUTHORIZED', 401, 'Sua sessão expirou. Entre de novo para continuar.');
  }

  const active = await prisma.booking.count({
    where: { userId, ...activeBookingsFilter(now) },
  });

  if (active > 0) {
    /*
     * `INVALID_TRANSITION` e não um código novo: a lista da §11.1 é fechada, e
     * o teste de contrato em `packages/shared` guarda isso de propósito. A
     * leitura que sustenta a escolha é que a conta não pode passar para
     * "removida" neste estado. Se um dia a lista for reaberta, um
     * `ACCOUNT_HAS_ACTIVE_BOOKINGS` diria isso melhor.
     */
    throw new AppError(
      'INVALID_TRANSITION',
      422,
      active === 1
        ? 'Você tem uma reserva em andamento. Cancele pelo site ou fale com a chácara antes de apagar a conta.'
        : `Você tem ${active} reservas em andamento. Cancele pelo site ou fale com a chácara antes de apagar a conta.`,
      { activeBookings: active },
    );
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        name: ANONYMIZED_NAME,
        email: null,
        phone: null,
        passwordHash: null,
        googleId: null,
        /*
         * Sem e-mail, "e-mail verificado" não quer dizer nada — e deixar a marca
         * faria a linha afirmar algo sobre um endereço que não está mais ali.
         */
        emailVerifiedAt: null,
      },
    }),

    /*
     * As sessões abertas morrem na hora, em todos os aparelhos: enquanto houver
     * refresh token válido, a conta continua acessível depois de "apagada".
     * Apagar as linhas em vez de revogar porque elas não servem a mais nada —
     * nem a auditoria, já que a conta não tem mais dono.
     */
    prisma.refreshToken.deleteMany({ where: { userId } }),

    /*
     * Token de confirmação ou de redefinição pendente também sai: um link antigo
     * na caixa de entrada de alguém não pode reabrir o caminho para a conta.
     */
    prisma.authToken.deleteMany({ where: { userId } }),
  ]);
}
