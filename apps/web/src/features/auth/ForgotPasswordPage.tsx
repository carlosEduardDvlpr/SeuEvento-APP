import { forgotPasswordBodySchema } from '@chacara/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { useForgotPassword } from '@/api/auth';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { apiFieldErrors, formErrorMessage, validateForm, type FieldErrors } from '@/lib/form';
import { AuthCard, FormError, authStyles } from './AuthCard';

/**
 * Pedir link de redefinição (§10.5).
 *
 * A confirmação não diz se o endereço tem conta: a API responde igual nos dois
 * casos, e a tela mantém esse cuidado (§10.2).
 */
export function ForgotPasswordPage() {
  const forgot = useForgotPassword();
  const [email, setEmail] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const validation = validateForm(forgotPasswordBodySchema, { email });
    setFieldErrors(validation.errors ?? {});
    if (!validation.data) return;

    try {
      await forgot.mutateAsync(validation.data);
      setSent(true);
    } catch (error) {
      setFieldErrors(apiFieldErrors(error));
    }
  }

  if (sent) {
    return (
      <AuthCard
        title="Confira seu e-mail"
        lead={`Se houver uma conta em ${email}, o link de redefinição chega em instantes. Ele vale por 1 hora.`}
        footer={<Link to="/entrar">Voltar para entrar</Link>}
      >
        <p className={authStyles.lead}>
          Depois de trocar a senha, as sessões abertas em outros aparelhos são encerradas.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Esqueci minha senha"
      lead="Informe seu e-mail e enviamos um link para você escolher uma nova."
      footer={<Link to="/entrar">Voltar para entrar</Link>}
    >
      <form className={authStyles.form} onSubmit={handleSubmit} noValidate>
        <FormError message={formErrorMessage(forgot.error)} />

        <Field
          label="E-mail"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          error={fieldErrors.email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <div className={authStyles.actions}>
          <Button
            type="submit"
            variant="primary"
            loading={forgot.isPending}
            loadingLabel="Enviando…"
          >
            Enviar link
          </Button>
        </div>
      </form>
    </AuthCard>
  );
}
