import type { AdminCustomer } from '@chacara/shared';
import { createCustomerBodySchema } from '@chacara/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { useAdminCustomers, useCreateCustomer } from '@/api/admin-customers';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { EmptyState } from '@/components/EmptyState';
import { Field } from '@/components/Field';
import { Skeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import { PlusIcon } from '@/components/icons';
import { useDebouncedValue } from '@/features/booking/useDebouncedValue';
import { apiFieldErrors, formErrorMessage, validateForm, type FieldErrors } from '@/lib/form';
import { formatDateShort } from '@/lib/format';
import { whatsappUrl } from '@/lib/whatsapp';
import adminStyles from '../admin.module.css';
import styles from './CustomersPage.module.css';

/**
 * Clientes (§13.4).
 *
 * Lista com busca, contato e o cadastro sem senha da §9.8 — quem fechou pelo
 * WhatsApp e talvez nunca use o site.
 */

const EMPTY_FORM = { name: '', phone: '', email: '' };

function CustomerCard({ customer }: { customer: AdminCustomer }) {
  return (
    <li className={styles.card}>
      <div className={styles.cardMain}>
        <Link className={styles.name} to={`/admin/clientes/${customer.id}`}>
          {customer.name}
        </Link>

        <p className={styles.contact}>
          {customer.phone ?? 'sem telefone'}
          {customer.email ? ` · ${customer.email}` : ''}
        </p>

        <p className={styles.meta}>
          {customer.bookingCount === 0
            ? 'nenhuma reserva'
            : `${customer.bookingCount} ${customer.bookingCount === 1 ? 'reserva' : 'reservas'}`}
          {' · desde '}
          {formatDateShort(customer.createdAt.slice(0, 10))}
        </p>

        {/*
          §9.8: a conta que o dono criou não tem senha nem Google. Dizer isso
          evita a promessa de um acesso que a pessoa não consegue fazer.
        */}
        {customer.hasAccess ? null : (
          <p className={styles.tag}>cadastrado por você, sem acesso ao site</p>
        )}
      </div>

      {customer.phone ? (
        <a
          className={styles.whatsapp}
          href={whatsappUrl(customer.phone, `Olá, ${customer.name}!`)}
          target="_blank"
          rel="noreferrer"
        >
          WhatsApp
        </a>
      ) : null}
    </li>
  );
}

export function CustomersPage() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const debouncedQ = useDebouncedValue(q);
  const customers = useAdminCustomers({
    ...(debouncedQ.trim() ? { q: debouncedQ.trim() } : {}),
    page,
  });
  const create = useCreateCustomer();
  const { showToast } = useToast();

  const total = customers.data?.total ?? 0;
  const pageSize = customers.data?.pageSize ?? 20;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  function openForm() {
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setCreating(true);
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();

    const validation = validateForm(createCustomerBodySchema, {
      name: form.name,
      phone: form.phone,
      // E-mail é opcional (§9.8); vazio não deve virar erro de formato.
      ...(form.email.trim() === '' ? {} : { email: form.email }),
    });

    setFieldErrors(validation.errors ?? {});
    if (!validation.data) return;

    try {
      const customer = await create.mutateAsync(validation.data);
      showToast(`${customer.name} entrou no cadastro.`);
      setCreating(false);
    } catch (error) {
      setFieldErrors(apiFieldErrors(error));
    }
  }

  return (
    <div className={adminStyles.page}>
      <header className={adminStyles.header}>
        <div className={adminStyles.heading}>
          <h1 className={adminStyles.title}>Clientes</h1>
          <p className={adminStyles.subtitle}>
            Quem já reservou pelo site e quem você cadastrou para fechar por fora.
          </p>
        </div>

        <Button variant="primary" onClick={openForm}>
          <PlusIcon size={20} />
          Novo cliente
        </Button>
      </header>

      <div className={styles.filters}>
        <Field
          label="Buscar"
          type="search"
          placeholder="Nome, e-mail ou telefone"
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
            setPage(1);
          }}
        />
      </div>

      {customers.isError ? (
        <p role="alert">{formErrorMessage(customers.error) ?? 'Tente de novo em instantes.'}</p>
      ) : null}

      {customers.isPending ? <Skeleton rows={5} /> : null}

      {customers.data ? (
        <>
          <p className={styles.count} role="status">
            {total === 0
              ? 'Nenhum cliente encontrado'
              : `${total} ${total === 1 ? 'cliente' : 'clientes'}`}
          </p>

          {total === 0 ? (
            <EmptyState
              title={q.trim() ? 'Ninguém com esse nome' : 'Nenhum cliente ainda'}
              description={
                q.trim()
                  ? 'Tente outro nome, e-mail ou telefone.'
                  : 'Quem reservar pelo site entra aqui. Você também pode cadastrar quem fechou pelo WhatsApp.'
              }
              action={
                q.trim() ? undefined : <Button onClick={openForm}>Cadastrar um cliente</Button>
              }
            />
          ) : (
            <ul className={styles.list}>
              {customers.data.items.map((customer) => (
                <CustomerCard key={customer.id} customer={customer} />
              ))}
            </ul>
          )}

          {lastPage > 1 ? (
            <nav className={styles.pager} aria-label="Páginas de clientes">
              <Button onClick={() => setPage((current) => current - 1)} disabled={page <= 1}>
                Anterior
              </Button>
              <span className={styles.pageInfo}>
                Página {page} de {lastPage}
              </span>
              <Button onClick={() => setPage((current) => current + 1)} disabled={page >= lastPage}>
                Próxima
              </Button>
            </nav>
          ) : null}
        </>
      ) : null}

      <Dialog
        open={creating}
        title="Novo cliente"
        onClose={() => setCreating(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Voltar
            </Button>
            <Button
              variant="primary"
              form="novo-cliente"
              type="submit"
              loading={create.isPending}
              loadingLabel="Salvando…"
            >
              Cadastrar
            </Button>
          </>
        }
      >
        <form id="novo-cliente" className={styles.form} onSubmit={handleCreate} noValidate>
          {formErrorMessage(create.error) ? (
            <p className={styles.problem} role="alert">
              {formErrorMessage(create.error)}
            </p>
          ) : null}

          <Field
            label="Nome"
            autoComplete="off"
            value={form.name}
            error={fieldErrors.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />

          <Field
            label="WhatsApp"
            type="tel"
            inputMode="tel"
            placeholder="(11) 99999-0000"
            value={form.phone}
            error={fieldErrors.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
          />

          {/* §9.8: o e-mail é opcional; quem fecha por WhatsApp às vezes não tem. */}
          <Field
            label="E-mail"
            help="Opcional. Sem ele, a pessoa não recebe aviso por e-mail."
            type="email"
            inputMode="email"
            value={form.email}
            error={fieldErrors.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />

          <p className={styles.note}>
            A conta é criada sem senha. Se a pessoa se cadastrar depois com o mesmo e-mail, ela
            assume este cadastro e mantém o histórico.
          </p>
        </form>
      </Dialog>
    </div>
  );
}
