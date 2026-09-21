import { registerBodySchema } from '@chacara/shared';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useGoogleLogin, useRegister } from '@/api/auth';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { apiFieldErrors, formErrorMessage, validateForm, type FieldErrors } from '@/lib/form';
import { AuthCard, FormError, authStyles } from './AuthCard';
import { GoogleSignInButton, isGoogleSignInAvailable } from './GoogleSignInButton';
import { useAuth } from './AuthProvider';

/**
 * Criar conta (§10.2 e §10.8).
 *
 * Depois do envio, a tela **não** diz se o e-mail já tinha conta: a API responde
 * igual nos dois casos, e a interface precisa manter esse cuidado. Quem já tem
 * conta descobre pelo e-mail que recebe.
 */
export function RegisterPage() {
  const navigate = useNavigate();
  const { signIn } = useAuth();

  const register = useRegister();
  const googleLogin = useGoogleLogin();

  const [values, setValues] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    acceptTerms: false,
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const validation = validateForm(registerBodySchema, {
      ...values,
      // Telefone é opcional no cadastro; vazio não deve virar erro de formato.
      phone: values.phone.trim() === '' ? undefined : values.phone,
    });
    setFieldErrors(validation.errors ?? {});
    if (!validation.data) return;

    try {
      await register.mutateAsync(validation.data);
      setSent(true);
    } catch (error) {
      setFieldErrors(apiFieldErrors(error));
    }
  }

  async function handleGoogleCredential(idToken: string) {
    try {
      const session = await googleLogin.mutateAsync(idToken);
      signIn(session);
      navigate('/', { replace: true });
    } catch {
      // A mensagem aparece pelo `googleLogin.error`.
    }
  }

  if (sent) {
    return (
      <AuthCard
        title="Confira seu e-mail"
        lead={`Enviamos um link de confirmação para ${values.email}. Ele vale por 24 horas.`}
        footer={<Link to="/entrar">Voltar para entrar</Link>}
      >
        <p className={authStyles.lead}>
          Depois de confirmar, você já entra direto e pode enviar pedidos de reserva.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Criar conta"
      lead="Leva um minuto. Você precisa dela para enviar o pedido de reserva."
      footer={<Link to="/entrar">Já tenho conta</Link>}
    >
      <form className={authStyles.form} onSubmit={handleSubmit} noValidate>
        <FormError message={formErrorMessage(register.error ?? googleLogin.error)} />

        <Field
          label="Nome"
          autoComplete="name"
          value={values.name}
          error={fieldErrors.name}
          onChange={(event) => setValues({ ...values, name: event.target.value })}
        />

        <Field
          label="E-mail"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={values.email}
          error={fieldErrors.email}
          onChange={(event) => setValues({ ...values, email: event.target.value })}
        />

        <Field
          label="WhatsApp"
          help="Opcional agora, necessário para reservar."
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(11) 99999-0000"
          value={values.phone}
          error={fieldErrors.phone}
          onChange={(event) => setValues({ ...values, phone: event.target.value })}
        />

        <Field
          label="Senha"
          help="De 8 a 128 caracteres."
          type="password"
          autoComplete="new-password"
          value={values.password}
          error={fieldErrors.password}
          onChange={(event) => setValues({ ...values, password: event.target.value })}
        />

        {/* §10.8: o aceite fica registrado em termsAcceptedAt. */}
        <label className={authStyles.checkbox}>
          <input
            type="checkbox"
            checked={values.acceptTerms}
            aria-invalid={fieldErrors.acceptTerms ? true : undefined}
            onChange={(event) => setValues({ ...values, acceptTerms: event.target.checked })}
          />
          <span>
            Li e aceito os <Link to="/termos">Termos de uso</Link> e a{' '}
            <Link to="/privacidade">Política de privacidade</Link>.
          </span>
        </label>
        {fieldErrors.acceptTerms ? <FormError message={fieldErrors.acceptTerms} /> : null}

        <div className={authStyles.actions}>
          <Button
            type="submit"
            variant="primary"
            loading={register.isPending}
            loadingLabel="Criando conta…"
          >
            Criar conta
          </Button>
        </div>
      </form>

      {isGoogleSignInAvailable() ? (
        <>
          <p className={authStyles.divider}>ou</p>
          <GoogleSignInButton onCredential={handleGoogleCredential} />
        </>
      ) : null}
    </AuthCard>
  );
}
