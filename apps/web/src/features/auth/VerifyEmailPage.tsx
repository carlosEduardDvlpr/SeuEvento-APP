import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useResendVerification, useVerifyEmail } from '@/api/auth';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { formErrorMessage } from '@/lib/form';
import { AuthCard, FormError, authStyles } from './AuthCard';
import { useAuth } from './AuthProvider';

/**
 * Confirmação de e-mail (§10.2, passo 4).
 *
 * O link do e-mail abre **esta página**, que então faz `POST /auth/verify-email`.
 * O link não é um GET que confirma: pré-visualizador de e-mail segue endereços, e
 * isso confirmaria a conta sem ninguém clicar.
 */
export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { signIn } = useAuth();

  const verify = useVerifyEmail();
  const resend = useResendVerification();

  const token = searchParams.get('token');
  const [email, setEmail] = useState('');

  /*
   * O token é de uso único, então confirmar duas vezes mostraria erro depois de um
   * sucesso. O StrictMode executa o efeito duas vezes em desenvolvimento, e por
   * isso a trava não pode ser só a dependência do efeito.
   */
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;

    void verify
      .mutateAsync(token)
      .then((session) => {
        signIn(session);
        navigate('/', { replace: true });
      })
      .catch(() => {
        // A mensagem aparece pelo `verify.error`.
      });
  }, [token, verify, signIn, navigate]);

  if (!token) {
    return (
      <AuthCard
        title="Link incompleto"
        lead="O endereço não trouxe o código de confirmação. Abra o link direto do e-mail."
        footer={<Link to="/entrar">Ir para entrar</Link>}
      >
        <p className={authStyles.lead}>
          Se o link não funcionar, peça um novo informando seu e-mail abaixo.
        </p>
      </AuthCard>
    );
  }

  if (verify.isPending || verify.isSuccess) {
    return (
      <AuthCard title="Confirmando seu e-mail" lead="Só um instante.">
        <p className={authStyles.lead} role="status">
          Estamos confirmando seu e-mail…
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Não conseguimos confirmar"
      lead="Peça um link novo e tente de novo."
      footer={<Link to="/entrar">Ir para entrar</Link>}
    >
      <form
        className={authStyles.form}
        onSubmit={(event) => {
          event.preventDefault();
          resend.mutate(email);
        }}
        noValidate
      >
        <FormError message={formErrorMessage(verify.error)} />

        {resend.isSuccess ? (
          <p className={authStyles.notice} role="status">
            Enviamos um link novo. Confira sua caixa de entrada.
          </p>
        ) : null}

        <Field
          label="E-mail"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <div className={authStyles.actions}>
          <Button
            type="submit"
            variant="primary"
            loading={resend.isPending}
            loadingLabel="Enviando…"
          >
            Enviar link novo
          </Button>
        </div>
      </form>
    </AuthCard>
  );
}
