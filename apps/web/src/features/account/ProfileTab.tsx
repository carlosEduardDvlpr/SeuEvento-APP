import { type SessionUser, changePasswordBodySchema, updateMeBodySchema } from '@chacara/shared';
import { type FormEvent, useState } from 'react';
import { useChangePassword, useUpdateMe } from '@/api/me';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Skeleton } from '@/components/Skeleton';
import { useAuth } from '@/features/auth/AuthProvider';
import { type FieldErrors, apiFieldErrors, formErrorMessage, validateForm } from '@/lib/form';
import { formatAddress } from '@/lib/format';
import { AddressDialog } from './AddressDialog';
import { DeleteAccountSection } from './DeleteAccountSection';
import styles from './ProfileTab.module.css';

/**
 * "Meu perfil", a segunda aba de Minhas reservas (novembro de 2026).
 *
 * Reúne o que é da conta e não de uma reserva: os dados de contato, o endereço
 * de entrega da decoração (§9.12), a senha e, no fim, a remoção da conta
 * (§10.8). Cada bloco salva sozinho, com o próprio botão: mudar o WhatsApp não
 * pode depender de digitar a senha, e um botão só para tudo esconderia qual
 * parte deu erro.
 *
 * Os botões são secundários de propósito. Com três blocos na mesma tela, três
 * botões dourados disputariam a atenção (§14.2); quem salva sabe qual bloco
 * acabou de preencher.
 */
export function ProfileTab() {
  const { user } = useAuth();

  // A área do cliente só abre com sessão; até ela chegar, o formato do conteúdo.
  if (!user) return <Skeleton rows={6} />;

  return (
    <div className={styles.tab}>
      <ContactSection user={user} />
      <AddressSection user={user} />
      <PasswordSection hasPassword={user.hasPassword} />
      <DeleteAccountSection />
    </div>
  );
}

/**
 * Nome e WhatsApp. O e-mail aparece, mas não se edita: a troca vai exigir um
 * código enviado para o endereço novo, que ainda não existe.
 *
 * Monta com o usuário já carregado, então o formulário começa preenchido.
 */
function ContactSection({ user }: { user: SessionUser }) {
  const { setUser } = useAuth();
  const updateMe = useUpdateMe();

  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saved, setSaved] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaved(false);

    /*
     * A API não apaga o WhatsApp, só troca. Campo vazio de quem nunca informou
     * um fica de fora do pedido; de quem já tinha, é recusado aqui com a mesma
     * mensagem da API, em vez de o número antigo continuar valendo calado.
     */
    const body = phone.trim() === '' && user.phone === null ? { name } : { name, phone };

    const { data, errors: invalid } = validateForm(updateMeBodySchema, body);
    setErrors(invalid ?? {});
    if (!data) return;

    try {
      const updated = await updateMe.mutateAsync(data);
      setUser(updated);
      setName(updated.name);
      setPhone(updated.phone ?? '');
      setSaved(true);
    } catch (error) {
      setErrors(apiFieldErrors(error));
    }
  }

  const problem = formErrorMessage(updateMe.error);

  return (
    <section className={styles.section} aria-labelledby="titulo-dados">
      <h2 className={styles.title} id="titulo-dados">
        Seus dados
      </h2>

      <form className={styles.form} onSubmit={save} noValidate>
        {problem ? (
          <p className={styles.formError} role="alert">
            {problem}
          </p>
        ) : null}

        <Field
          label="Nome"
          autoComplete="name"
          value={name}
          error={errors.name}
          onChange={(event) => {
            setName(event.target.value);
            setSaved(false);
          }}
        />

        <div className={styles.readonly}>
          <span className={styles.readonlyLabel}>E-mail</span>
          <span className={styles.readonlyValue}>{user.email ?? 'não informado'}</span>
          <span className={styles.note}>
            A troca de e-mail vai pedir um código enviado por e-mail, e chega em breve.
          </span>
        </div>

        <Field
          label="WhatsApp"
          type="tel"
          autoComplete="tel"
          help="Com DDD, como (11) 99999-0000."
          value={phone}
          error={errors.phone}
          onChange={(event) => {
            setPhone(event.target.value);
            setSaved(false);
          }}
        />

        <div className={styles.actions}>
          <Button type="submit" loading={updateMe.isPending} loadingLabel="Salvando…">
            Salvar dados
          </Button>
        </div>

        {/* Existe sempre, vazio ou não: região viva que nasce com o texto nem sempre é lida. */}
        <p className={styles.status} role="status">
          {saved ? 'Dados salvos.' : ''}
        </p>
      </form>
    </section>
  );
}

/**
 * Endereço de entrega da decoração (§9.12). Lê o usuário da sessão a cada
 * desenho: depois de salvar no diálogo, o endereço novo aparece na hora.
 */
function AddressSection({ user }: { user: SessionUser }) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  return (
    <section className={styles.section} aria-labelledby="titulo-endereco">
      <h2 className={styles.title} id="titulo-endereco">
        Endereço de entrega
      </h2>

      <p className={user.address ? styles.address : styles.empty}>
        {user.address
          ? formatAddress(user.address)
          : 'Nenhum endereço cadastrado. Ele é usado quando a decoração vai até você.'}
      </p>

      <div className={styles.actions}>
        <Button
          onClick={() => {
            setSaved(false);
            setEditing(true);
          }}
        >
          {user.address ? 'Alterar endereço' : 'Cadastrar endereço'}
        </Button>
      </div>

      <p className={styles.status} role="status">
        {saved ? 'Endereço salvo.' : ''}
      </p>

      {/* Montado só enquanto aberto: cada abertura começa do endereço salvo. */}
      {editing ? (
        <AddressDialog onClose={() => setEditing(false)} onSaved={() => setSaved(true)} />
      ) : null}
    </section>
  );
}

/**
 * Troca de senha (§10.5). Pede a senha atual, e a resposta é uma sessão nova: a
 * API encerra as outras sessões da conta, e esta continua aberta.
 */
function PasswordSection({ hasPassword }: { hasPassword: boolean }) {
  const { signIn } = useAuth();
  const changePassword = useChangePassword();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [changed, setChanged] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setChanged(false);

    const { data, errors: invalid } = validateForm(changePasswordBodySchema, {
      currentPassword,
      newPassword,
    });
    setErrors(invalid ?? {});
    if (!data) return;

    try {
      signIn(await changePassword.mutateAsync(data));
      setCurrentPassword('');
      setNewPassword('');
      setChanged(true);
    } catch (error) {
      setErrors(apiFieldErrors(error));
    }
  }

  const problem = formErrorMessage(changePassword.error);

  return (
    <section className={styles.section} aria-labelledby="titulo-senha">
      <h2 className={styles.title} id="titulo-senha">
        Senha
      </h2>

      {hasPassword ? (
        <form className={styles.form} onSubmit={save} noValidate>
          {problem ? (
            <p className={styles.formError} role="alert">
              {problem}
            </p>
          ) : null}

          <Field
            label="Senha atual"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            error={errors.currentPassword}
            onChange={(event) => {
              setCurrentPassword(event.target.value);
              setChanged(false);
            }}
          />

          <Field
            label="Nova senha"
            type="password"
            autoComplete="new-password"
            help="De 8 a 128 caracteres."
            value={newPassword}
            error={errors.newPassword}
            onChange={(event) => {
              setNewPassword(event.target.value);
              setChanged(false);
            }}
          />

          <div className={styles.actions}>
            <Button type="submit" loading={changePassword.isPending} loadingLabel="Trocando…">
              Trocar senha
            </Button>
          </div>

          <p className={styles.status} role="status">
            {changed ? 'Senha trocada. As outras sessões foram encerradas.' : ''}
          </p>
        </form>
      ) : (
        <p className={styles.empty}>Sua conta entra com o Google, sem senha.</p>
      )}
    </section>
  );
}
