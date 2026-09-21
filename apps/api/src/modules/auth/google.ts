import { OAuth2Client } from 'google-auth-library';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';

/**
 * Validação do `id_token` do Google (§10.3).
 *
 * O SPA obtém o token pelo Google Identity Services e manda para cá; a API
 * confere assinatura, emissor e audience. Não há redirect de OAuth no servidor,
 * então todo o fluxo cabe numa rota — e trocar de provedor no futuro significa
 * trocar só este arquivo.
 */

/** O que a API aproveita do token, depois de validado. */
export type GoogleIdentity = {
  /** O `sub` do Google: identificador estável, que não muda se a pessoa trocar de e-mail. */
  googleId: string;
  email: string;
  name: string;
};

let client: OAuth2Client | null = null;

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  /*
   * Sem `GOOGLE_CLIENT_ID` o login com Google fica desligado, e o resto da
   * autenticação segue funcionando. No SPA o botão só aparece quando
   * `VITE_GOOGLE_CLIENT_ID` existe, então este caminho só é alcançado se as duas
   * pontas estiverem desalinhadas.
   */
  const clientId = env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new AppError('INTERNAL', 503, 'O login com Google não está disponível agora.');
  }

  client ??= new OAuth2Client(clientId);

  let payload;
  try {
    // Passar `audience` é o que impede aceitar um token emitido para outro app:
    // sem isso, qualquer id_token válido do Google entraria aqui.
    const ticket = await client.verifyIdToken({ idToken, audience: clientId });
    payload = ticket.getPayload();
  } catch {
    throw new AppError(
      'INVALID_CREDENTIALS',
      401,
      'Não conseguimos confirmar sua conta do Google. Tente de novo.',
    );
  }

  if (!payload?.sub || !payload.email) {
    throw new AppError(
      'INVALID_CREDENTIALS',
      401,
      'Não conseguimos confirmar sua conta do Google. Tente de novo.',
    );
  }

  /*
   * §10.3 exige `email_verified`. É o que sustenta a vinculação por e-mail: sem
   * essa garantia, alguém poderia criar uma conta no Google com o endereço de
   * outra pessoa e assumir a conta dela aqui.
   */
  if (payload.email_verified !== true) {
    throw new AppError(
      'INVALID_CREDENTIALS',
      401,
      'Sua conta do Google não tem o e-mail confirmado. Confirme no Google e tente de novo.',
    );
  }

  return {
    googleId: payload.sub,
    // Normaliza igual ao resto do sistema (§10.1), senão a busca por e-mail falha.
    email: payload.email.trim().toLowerCase(),
    name: payload.name?.trim() || payload.email,
  };
}
