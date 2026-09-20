import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as EnvModule from '../config/env.js';

/**
 * O transporte SMTP é substituído por um que sempre falha, para exercitar a
 * regra da §17: **falha ao enviar não desfaz cadastro nem reserva**.
 */
const sendMailMock = vi.fn();

vi.mock('nodemailer', () => ({
  createTransport: () => ({ sendMail: sendMailMock }),
}));

vi.mock('../config/env.js', async (importOriginal) => {
  const actual = await importOriginal<typeof EnvModule>();
  return {
    ...actual,
    env: { ...actual.env, MAIL_TRANSPORT: 'smtp', SMTP_URL: 'smtps://usuario:senha@smtp.exemplo' },
  };
});

const { resetMailerForTests, sendMail } = await import('./mailer.js');

const EMAIL = {
  to: 'ana@exemplo.com',
  subject: 'Confirme seu e-mail',
  html: '<p>Olá</p>',
  text: 'Olá\nhttps://exemplo.com/verificar-email?token=abc',
};

describe('sendMail com transporte SMTP', () => {
  beforeEach(() => {
    sendMailMock.mockReset();
    resetMailerForTests();
  });

  it('entrega quando o servidor aceita', async () => {
    sendMailMock.mockResolvedValue({ messageId: '1' });

    await expect(sendMail(EMAIL)).resolves.toBeUndefined();
    expect(sendMailMock).toHaveBeenCalledOnce();
  });

  it('usa o remetente configurado', async () => {
    sendMailMock.mockResolvedValue({ messageId: '1' });

    await sendMail(EMAIL);

    expect(sendMailMock.mock.calls[0]?.[0]).toMatchObject({
      to: EMAIL.to,
      subject: EMAIL.subject,
      from: expect.any(String),
    });
  });

  // A regra que mais importa: quem chama não precisa de try/catch, e uma queda do
  // SMTP não pode abortar a transação que criou a conta.
  it('não propaga erro quando o servidor recusa', async () => {
    sendMailMock.mockRejectedValue(new Error('SMTP fora do ar'));

    await expect(sendMail(EMAIL)).resolves.toBeUndefined();
  });

  it('não propaga erro quando a conexão nem abre', async () => {
    sendMailMock.mockImplementation(() => {
      throw new Error('ECONNREFUSED');
    });

    await expect(sendMail(EMAIL)).resolves.toBeUndefined();
  });
});
