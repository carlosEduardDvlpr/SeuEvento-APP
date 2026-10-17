import { z } from 'zod';
import { adminBookingSummarySchema } from './admin-overview.js';
import { emailSchema, nameSchema, phoneSchema } from './schemas.js';

/**
 * Clientes no painel (§11.2, §13.4).
 *
 * O cadastro aqui é **sem senha** (§9.8): o dono registra quem fechou pelo
 * WhatsApp, e essa pessoa pode nunca usar o site. Se mais tarde ela se cadastrar
 * com o mesmo e-mail, o fluxo de cadastro assume a conta depois da confirmação —
 * o que já está feito na autenticação.
 */

export const adminCustomerSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  /**
   * Se a pessoa já pode entrar sozinha no site.
   *
   * Falso para quem o dono cadastrou: a conta existe, mas não tem senha nem
   * Google. A tela usa isso para não prometer um acesso que não existe.
   */
  hasAccess: z.boolean(),
  emailVerified: z.boolean(),
  createdAt: z.string(),
  /** Quantas reservas ativas ou passadas a pessoa tem. */
  bookingCount: z.number().int(),
});

/** Detalhe com o histórico, que é o que a §13.4 pede da tela de clientes. */
export const adminCustomerDetailSchema = adminCustomerSchema.extend({
  bookings: z.array(adminBookingSummarySchema),
});

/**
 * Cliente criado pelo painel.
 *
 * Nome e telefone, e o e-mail é opcional (§9.8): quem fecha por WhatsApp às vezes
 * não tem e-mail à mão, e exigir um inventado sujaria o cadastro — além de
 * bloquear o endereço de verdade no dia em que a pessoa se cadastrar.
 */
export const createCustomerBodySchema = z.object({
  name: nameSchema,
  phone: phoneSchema,
  email: emailSchema.optional(),
});

export const adminCustomersQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const adminCustomersPageSchema = z.object({
  items: z.array(adminCustomerSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});

export type AdminCustomer = z.infer<typeof adminCustomerSchema>;
export type AdminCustomerDetail = z.infer<typeof adminCustomerDetailSchema>;
export type CreateCustomerBody = z.infer<typeof createCustomerBodySchema>;
export type AdminCustomersQuery = z.infer<typeof adminCustomersQuerySchema>;
export type AdminCustomersPage = z.infer<typeof adminCustomersPageSchema>;
