import { resetPasswordBodySchema } from '@chacara/shared';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useResetPassword } from '@/api/auth';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { apiFieldErrors, formErrorMessage, validateForm, type FieldErrors } from '@/lib/form';
import { AuthCard, FormError, authStyles } from './AuthCard';

/**
 * Definir nova senha (§10.5).
 *
 * Não abre sessão ao terminar: a pessoa entra com a senha nova, o que confirma que
 * ela a guardou. A API também não devolve sessão aqui.
 */
export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const reset = useResetPassword();

  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const validation = validateForm(resetPasswordBodySchema, { token, password });
    setFieldErrors(validation.errors ?? {});
    if (!validation.data) return;

    try {
      await reset.mutateAsync(validation.data);
      navigate('/entrar?senha-redefinida=1', { replace: true });
    } catch (error) {
      setFieldErrors(apiFieldErrors(error));
    }
  }

  if (!token) {
    return (
      <AuthCard
        title="Link incompleto"
        lead="O endereço não trouxe o código de redefinição. Abra o link direto do e-mail."
        footer={<Link to="/esqueci-senha">Pedir um link novo</Link>}
      >
        <p className={authStyles.lead}>Os links de redefinição valem por 1 hora.</p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Escolha uma senha nova"
      lead="Depois de salvar, as sessões abertas em outros aparelhos são encerradas."
      footer={<Link to="/esqueci-senha">Pedir um link novo</Link>}
    >
      <form className={authStyles.form} onSubmit={handleSubmit} noValidate>
        <FormError message={formErrorMessage(reset.error)} />

        <Field
          label="Nova senha"
          help="De 8 a 128 caracteres."
          type="password"
          autoComplete="new-password"
          value={password}
          error={fieldErrors.password}
          onChange={(event) => setPassword(event.target.value)}
        />

        <div className={authStyles.actions}>
          <Button
            type="submit"
            variant="primary"
            loading={reset.isPending}
            loadingLabel="Salvando…"
          >
            Salvar nova senha
          </Button>
        </div>
      </form>
    </AuthCard>
  );
}
