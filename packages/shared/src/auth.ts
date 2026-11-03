import { z } from 'zod';
import { addressInputSchema, addressSchema } from './address.js';
import { roleSchema } from './schemas.js';
import { emailSchema, nameSchema, passwordSchema, phoneSchema } from './schemas.js';

/**
 * Contratos de autenticação (§10).
 *
 * Os mesmos schemas validam a requisição na API e o formulário no SPA (§12.5),
 * então as duas pontas nunca discordam do que é aceitável.
 */

export const registerBodySchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  // Opcional no cadastro; obrigatório para reservar (§23, suposição 12).
  phone: phoneSchema.optional(),
  // §10.8: o aceite dos Termos e da Política é registrado em termsAcceptedAt.
  acceptTerms: z.literal(true, { error: 'É preciso aceitar os termos para criar a conta.' }),
});

export const verifyEmailBodySchema = z.object({
  token: z.string().min(1, { error: 'Link inválido.' }),
});

export const loginBodySchema = z.object({
  email: emailSchema,
  // Sem as regras de tamanho do cadastro: senha antiga e curta ainda deve poder
  // entrar, e recusar aqui por tamanho seria dizer que a senha está errada por
  // um motivo que não é o certo.
  password: z.string().min(1, { error: 'Informe sua senha.' }),
});

/** O `credential` que o Google Identity Services devolve no navegador (§10.3). */
export const googleLoginBodySchema = z.object({
  idToken: z.string().min(1, { error: 'Não recebemos a credencial do Google.' }),
});

export const forgotPasswordBodySchema = z.object({
  email: emailSchema,
});

export const resetPasswordBodySchema = z.object({
  token: z.string().min(1, { error: 'Link inválido.' }),
  // Aqui a senha é nova, então vale a faixa completa do cadastro.
  password: passwordSchema,
});

/**
 * Perfil editável pelo próprio cliente (§11.2). E-mail e papel não entram: a
 * troca de e-mail vai exigir um código enviado por e-mail, que ainda não existe.
 *
 * `address: null` apaga o endereço; ausente, não mexe (§9.12).
 */
export const updateMeBodySchema = z
  .object({
    name: nameSchema.optional(),
    phone: phoneSchema.optional(),
    address: addressInputSchema.nullable().optional(),
  })
  .refine(
    (body) => body.name !== undefined || body.phone !== undefined || body.address !== undefined,
    { error: 'Informe o que você quer mudar.' },
  );

/**
 * Troca de senha por quem está logado (§10.5, novembro de 2026).
 *
 * Pede a senha atual: um computador esquecido aberto não pode virar a conta de
 * outra pessoa. A confirmação por código enviado por e-mail entra quando o envio
 * de código existir.
 */
export const changePasswordBodySchema = z
  .object({
    currentPassword: z.string().min(1, { error: 'Informe a senha atual.' }),
    // Aqui a senha é nova, então vale a faixa completa do cadastro.
    newPassword: passwordSchema,
  })
  .refine((body) => body.newPassword !== body.currentPassword, {
    error: 'A senha nova precisa ser diferente da atual.',
    path: ['newPassword'],
  });

export const resendVerificationBodySchema = z.object({
  email: emailSchema,
});

/**
 * Resposta dos fluxos que não podem revelar se o e-mail existe (§10.2).
 *
 * `register`, `resend-verification` e `forgot-password` devolvem 202 com a mesma
 * mensagem em todos os casos.
 */
export const acceptedResponseSchema = z.object({
  message: z.string(),
});

/** Usuário logado, do jeito que a interface precisa. Nunca inclui hash de senha. */
export const sessionUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  role: roleSchema,
  emailVerified: z.boolean(),
  /** Endereço de entrega da decoração (§9.12). Nulo até a pessoa cadastrar. */
  address: addressSchema.nullable(),
  /**
   * A conta tem senha. Falso na conta que só entra com o Google e na criada pelo
   * painel: para elas, "Meu perfil" não oferece trocar uma senha que não existe.
   */
  hasPassword: z.boolean(),
});

/**
 * Sessão aberta.
 *
 * O access token vai no corpo porque o SPA o guarda **só em memória** (§10.1). O
 * refresh token não aparece aqui: viaja em cookie `httpOnly` restrito a
 * `/api/auth`, fora do alcance de JavaScript.
 */
export const sessionResponseSchema = z.object({
  accessToken: z.string(),
  user: sessionUserSchema,
});

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type ChangePasswordBody = z.infer<typeof changePasswordBodySchema>;
export type SessionUser = z.infer<typeof sessionUserSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
