import { phoneSchema } from '@chacara/shared';
import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useGoogleLogin, useResendVerification } from '@/api/auth';
import { useMe, useUpdateMe } from '@/api/me';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { useAuth } from '@/features/auth/AuthProvider';
import { GoogleSignInButton, isGoogleSignInAvailable } from '@/features/auth/GoogleSignInButton';
import { formErrorMessage } from '@/lib/form';
import styles from './SubmitGate.module.css';

/**
 * O que falta para a pessoa poder enviar o pedido (§13.2).
 *
 * São três condições, e cada uma tem uma tela própria em vez de um erro: entrar,
 * ter o e-mail confirmado e ter telefone no perfil (§11.3). Recusar o envio por
 * um campo que a pessoa nem sabia que faltava é o pior desfecho possível depois
 * de montar o pedido inteiro.
 *
 * O rascunho **não se perde** em nenhum caminho: o Google entra sem sair da
 * página, e os links para entrar e se cadastrar levam `next` com a URL atual.
 * Esta tela só aparece na revisão, e é a partir dela que o pedido fica guardado
 * no `sessionStorage` até o envio (§12.2).
 */

export type SubmitGateProps = {
  /** Mostrado quando a API recusou o envio por um motivo desta tela. */
  error?: string | null;
  isSubmitting: boolean;
  onSubmit: () => void;
};

export function SubmitGate({ error, isSubmitting, onSubmit }: SubmitGateProps) {
  const { status, user, signIn, setUser } = useAuth();
  const location = useLocation();

  const googleLogin = useGoogleLogin();
  const resend = useResendVerification();
  const updateMe = useUpdateMe();
  const me = useMe();

  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | undefined>(undefined);

  // Volta para o wizard exatamente onde a pessoa estava, inclusive o passo.
  const next = encodeURIComponent(`${location.pathname}${location.search}`);

  async function handleGoogleCredential(idToken: string) {
    try {
      signIn(await googleLogin.mutateAsync(idToken));
    } catch {
      // A mensagem aparece pelo `googleLogin.error`.
    }
  }

  async function handleSavePhone(event: React.FormEvent) {
    event.preventDefault();

    /*
     * `safeParse` direto, e não o `validateForm`: aqui o schema é de um valor
     * solto, não de um objeto, então o caminho do erro é vazio e o helper por
     * campo não teria onde creditar a mensagem.
     */
    const validation = phoneSchema.safeParse(phone);

    if (!validation.success) {
      setPhoneError(validation.error.issues[0]?.message ?? 'Informe um telefone com DDD.');
      return;
    }

    setPhoneError(undefined);

    try {
      setUser(await updateMe.mutateAsync({ phone: validation.data }));
    } catch {
      // A mensagem aparece pelo `updateMe.error`.
    }
  }

  if (status === 'loading') {
    return (
      <p className={styles.waiting} role="status">
        Carregando sua conta…
      </p>
    );
  }

  if (status === 'anonymous') {
    return (
      <section className={styles.gate}>
        <h2 className={styles.title}>Falta só entrar</h2>
        <p className={styles.lead}>
          Seu pedido está montado e guardado. Entre ou crie uma conta para enviar — nada do que você
          escolheu se perde.
        </p>

        {formErrorMessage(googleLogin.error) ? (
          <p className={styles.problem} role="alert">
            {formErrorMessage(googleLogin.error)}
          </p>
        ) : null}

        <div className={styles.actions}>
          <Link className={styles.primaryLink} to={`/entrar?next=${next}`}>
            Entrar
          </Link>
          <Link className={styles.secondaryLink} to={`/cadastro?next=${next}`}>
            Criar uma conta
          </Link>
        </div>

        {isGoogleSignInAvailable() ? (
          <>
            <p className={styles.divider}>ou entre sem sair daqui</p>
            <GoogleSignInButton onCredential={handleGoogleCredential} />
          </>
        ) : null}
      </section>
    );
  }

  /*
   * Conta criada por cadastro próprio precisa confirmar o e-mail antes de enviar
   * (§13.2). Sem e-mail no cadastro — conta que o admin criou para uma reserva de
   * WhatsApp (§9.8) — não há link para reenviar, então o caminho é falar com a
   * chácara.
   */
  if (user && !user.emailVerified) {
    return (
      <section className={styles.gate}>
        <h2 className={styles.title}>Confirme seu e-mail</h2>

        {user.email ? (
          <>
            <p className={styles.lead}>
              Enviamos um link para <strong>{user.email}</strong>. Confirme para poder enviar
              pedidos. Seu pedido fica guardado aqui.
            </p>

            <div className={styles.actions}>
              {/*
                O link do e-mail abre numa aba nova, e esta aba continua achando
                que a conta não foi confirmada. Reconsultar o perfil resolve sem
                recarregar a página, que é o que arriscaria o rascunho.
              */}
              <Button
                variant="primary"
                loading={me.isFetching}
                loadingLabel="Verificando…"
                onClick={() => {
                  void me.refetch().then((result) => {
                    if (result.data) setUser(result.data);
                  });
                }}
              >
                Já confirmei, verificar
              </Button>

              <Button
                loading={resend.isPending}
                loadingLabel="Enviando…"
                onClick={() => resend.mutate(user.email!)}
              >
                {resend.isSuccess ? 'Link reenviado' : 'Reenviar o link'}
              </Button>
            </div>

            {me.isFetched && !me.data?.emailVerified ? (
              <p className={styles.lead} role="status">
                Ainda não consta como confirmado. Abra o link do e-mail e tente de novo.
              </p>
            ) : null}
          </>
        ) : (
          <p className={styles.lead}>
            Sua conta ainda não tem e-mail confirmado. Fale com a chácara para liberar o envio de
            pedidos pelo site.
          </p>
        )}
      </section>
    );
  }

  if (user && !user.phone) {
    return (
      <section className={styles.gate}>
        <h2 className={styles.title}>Qual é o seu WhatsApp?</h2>
        <p className={styles.lead}>
          É por aí que a chácara fala com você sobre a reserva. Peça uma vez, vale para sempre.
        </p>

        <form className={styles.phoneForm} onSubmit={handleSavePhone} noValidate>
          <Field
            label="WhatsApp"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(11) 99999-9999"
            value={phone}
            error={phoneError ?? formErrorMessage(updateMe.error) ?? undefined}
            onChange={(event) => setPhone(event.target.value)}
          />

          <Button
            type="submit"
            variant="primary"
            loading={updateMe.isPending}
            loadingLabel="Salvando…"
          >
            Salvar e continuar
          </Button>
        </form>
      </section>
    );
  }

  return (
    <section className={styles.gate}>
      {error ? (
        <p className={styles.problem} role="alert">
          {error}
        </p>
      ) : null}

      <Button
        variant="primary"
        onClick={onSubmit}
        loading={isSubmitting}
        loadingLabel="Enviando pedido…"
      >
        Solicitar reserva
      </Button>

      <p className={styles.fine}>
        Enviar não cobra nada. A chácara confirma e combina o pagamento com você.
      </p>
    </section>
  );
}
