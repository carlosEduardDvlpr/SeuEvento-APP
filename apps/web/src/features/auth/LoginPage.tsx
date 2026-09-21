import { loginBodySchema } from '@chacara/shared';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ApiError } from '@/api/client';
import { useGoogleLogin, useLogin, useResendVerification } from '@/api/auth';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { apiFieldErrors, formErrorMessage, validateForm, type FieldErrors } from '@/lib/form';
import { AuthCard, FormError, FormNotice, authStyles } from './AuthCard';
import { GoogleSignInButton, isGoogleSignInAvailable } from './GoogleSignInButton';
import { useAuth } from './AuthProvider';

/**
 * Entrar (§13.1 e §12.5).
 *
 * O `next` da query traz a pessoa de volta ao que ela estava fazendo — é o que
 * permite o wizard mandar para cá sem perder o rascunho da reserva.
 */
export function LoginPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { signIn } = useAuth();

  const login = useLogin();
  const googleLogin = useGoogleLogin();
  const resend = useResendVerification();

  const [values, setValues] = useState({ email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const next = searchParams.get('next');
  const justResetPassword = searchParams.get('senha-redefinida') === '1';

  const failure = login.error ?? googleLogin.error;
  const needsVerification = failure instanceof ApiError && failure.code === 'EMAIL_NOT_VERIFIED';

  function goToNext() {
    // `next` vem da própria aplicação, mas só caminho interno é aceito: uma URL
    // absoluta aqui viraria redirecionamento aberto para fora do site.
    navigate(next?.startsWith('/') ? next : '/', { replace: true });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const validation = validateForm(loginBodySchema, values);
    setFieldErrors(validation.errors ?? {});
    if (!validation.data) return;

    try {
      const session = await login.mutateAsync(validation.data);
      signIn(session);
      goToNext();
    } catch (error) {
      setFieldErrors(apiFieldErrors(error));
    }
  }

  async function handleGoogleCredential(idToken: string) {
    try {
      const session = await googleLogin.mutateAsync(idToken);
      signIn(session);
      goToNext();
    } catch {
      // A mensagem aparece pelo `googleLogin.error`.
    }
  }

  const pending = login.isPending || googleLogin.isPending;

  return (
    <AuthCard
      title="Entrar"
      lead="Acesse sua conta para enviar pedidos de reserva e acompanhar as suas."
      footer={
        <>
          <Link to="/cadastro">Criar uma conta</Link>
          <Link to="/esqueci-senha">Esqueci minha senha</Link>
        </>
      }
    >
      {justResetPassword ? <FormNotice>Senha alterada. Entre com a nova senha.</FormNotice> : null}

      <form className={authStyles.form} onSubmit={handleSubmit} noValidate>
        <FormError message={formErrorMessage(failure)} />

        {needsVerification ? (
          <Button
            variant="secondary"
            loading={resend.isPending}
            loadingLabel="Enviando…"
            onClick={() => resend.mutate(values.email)}
          >
            {resend.isSuccess ? 'Link reenviado' : 'Reenviar o link de confirmação'}
          </Button>
        ) : null}

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
          label="Senha"
          type="password"
          autoComplete="current-password"
          value={values.password}
          error={fieldErrors.password}
          onChange={(event) => setValues({ ...values, password: event.target.value })}
        />

        <div className={authStyles.actions}>
          <Button type="submit" variant="primary" loading={pending} loadingLabel="Entrando…">
            Entrar
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
