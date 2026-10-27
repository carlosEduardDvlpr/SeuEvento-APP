import type {
  AdminCustomer,
  BookingKind,
  CreateAdminBookingBody,
  QuoteRequest,
} from '@chacara/shared';
import { createAdminBookingBodySchema } from '@chacara/shared';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAdminCustomers, useCreateManualBooking } from '@/api/admin-customers';
import { useQuote } from '@/api/bookings';
import { useItems } from '@/api/storefront';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Money } from '@/components/Money';
import { QuantityStepper } from '@/components/QuantityStepper';
import { Textarea } from '@/components/Textarea';
import { useToast } from '@/components/Toast';
import { ArrowLeftIcon } from '@/components/icons';
import { useDebouncedValue } from '@/features/booking/useDebouncedValue';
import { apiFieldErrors, formErrorMessage, validateForm, type FieldErrors } from '@/lib/form';
import { formatWeekdayAndDay } from '@/lib/format';
import adminStyles from '../admin.module.css';
import styles from './NewBookingPage.module.css';

/**
 * Reserva manual (§9.8, §13.4).
 *
 * O dono lança o que já foi fechado por fora. O cálculo é **o mesmo** do cliente:
 * a tela pede o orçamento ao servidor e manda de volta o total que viu (§9.7).
 * Nada é somado aqui.
 *
 * O cliente pode ser escolhido da lista ou cadastrado na hora, e os dois caminhos
 * ficam visíveis ao mesmo tempo porque o dono nem sempre sabe de cabeça se a
 * pessoa já está no cadastro.
 *
 * A dona também lança decoração sozinha (T32): o mesmo formulário, com um dia só,
 * sem convidados e com pelo menos um item. As regras são as do site — o painel
 * não tem atalho.
 */

type Mode = 'existing' | 'new';

const EMPTY_NEW_CUSTOMER = { name: '', phone: '', email: '' };

export function NewBookingPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [mode, setMode] = useState<Mode>('existing');
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState<AdminCustomer | null>(null);
  const [newCustomer, setNewCustomer] = useState(EMPTY_NEW_CUSTOMER);

  const [kind, setKind] = useState<BookingKind>('VENUE');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [guestCount, setGuestCount] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [customerNotes, setCustomerNotes] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [confirmed, setConfirmed] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const decoration = kind === 'DECORATION';
  // Decoração é um dia só: a saída é sempre o próprio dia, e o campo some.
  const lastDay = decoration ? startDate : endDate;

  const debouncedSearch = useDebouncedValue(search);
  const customers = useAdminCustomers(
    debouncedSearch.trim() ? { q: debouncedSearch.trim(), page: 1 } : { page: 1 },
  );
  const catalog = useItems();
  const create = useCreateManualBooking();

  const items = useMemo(
    () =>
      Object.entries(quantities)
        .filter(([, quantity]) => quantity > 0)
        .map(([itemId, quantity]) => ({ itemId, quantity })),
    [quantities],
  );

  /*
   * Orçamento só com as duas datas, e com a saída não antes da entrada: sem isso
   * a rota responderia 400 a cada tecla enquanto o dono preenche. Na decoração,
   * também só com pelo menos um item — sem item, o pedido não existe.
   */
  const quoteRequest = useMemo<QuoteRequest | null>(() => {
    if (!startDate || !lastDay || lastDay < startDate) return null;
    if (decoration && items.length === 0) return null;
    return { kind, startDate, endDate: lastDay, items };
  }, [kind, decoration, startDate, lastDay, items]);

  const debouncedRequest = useDebouncedValue(quoteRequest);
  const quote = useQuote(debouncedRequest);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!quote.data) {
      showToast(
        decoration
          ? 'Escolha o dia e os itens, e espere o valor calcular.'
          : 'Escolha as datas e espere o valor calcular.',
        'error',
      );
      return;
    }

    const body = {
      ...(mode === 'existing'
        ? { customerId: chosen?.id }
        : {
            customer: {
              name: newCustomer.name,
              phone: newCustomer.phone,
              ...(newCustomer.email.trim() === '' ? {} : { email: newCustomer.email }),
            },
          }),
      kind,
      startDate,
      endDate: lastDay,
      // Na decoração não há convidados; na chácara, vazio vira NaN e o schema avisa.
      guestCount: decoration ? null : guestCount.trim() === '' ? Number.NaN : Number(guestCount),
      items,
      customerNotes,
      adminNotes,
      expectedTotalCents: quote.data.totalCents,
      confirmed,
    };

    const validation = validateForm(createAdminBookingBodySchema, body);
    setFieldErrors(validation.errors ?? {});
    if (!validation.data) return;

    try {
      const booking = await create.mutateAsync(validation.data as CreateAdminBookingBody);
      showToast(
        confirmed ? 'Reserva lançada e confirmada.' : 'Reserva lançada, aguardando confirmação.',
      );
      void navigate(`/admin/reservas/${booking.id}`);
    } catch (error) {
      setFieldErrors(apiFieldErrors(error));
      showToast(formErrorMessage(error) ?? 'Não conseguimos lançar a reserva.', 'error');
    }
  }

  return (
    <div className={adminStyles.page}>
      <Link className={styles.back} to="/admin/reservas">
        <ArrowLeftIcon size={20} />
        Reservas
      </Link>

      <header className={adminStyles.header}>
        <div className={adminStyles.heading}>
          <h1 className={adminStyles.title}>Nova reserva</h1>
          <p className={adminStyles.subtitle}>
            Para quem fechou por fora. Vale as mesmas regras de data, estoque e preço do site.
          </p>
        </div>
      </header>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        {formErrorMessage(create.error) ? (
          <p className={styles.problem} role="alert">
            {formErrorMessage(create.error)}
          </p>
        ) : null}

        <fieldset className={styles.group}>
          <legend className={styles.legend}>De quem é a reserva</legend>

          <div className={styles.switch} role="group" aria-label="Origem do cliente">
            <button
              type="button"
              className={[
                styles.switchOption,
                mode === 'existing' ? styles.switchOptionActive : null,
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setMode('existing')}
              aria-pressed={mode === 'existing'}
            >
              Cliente já cadastrado
            </button>
            <button
              type="button"
              className={[styles.switchOption, mode === 'new' ? styles.switchOptionActive : null]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setMode('new')}
              aria-pressed={mode === 'new'}
            >
              Cadastrar agora
            </button>
          </div>

          {mode === 'existing' ? (
            <>
              {chosen ? (
                <div className={styles.chosen}>
                  <span>
                    <strong>{chosen.name}</strong>
                    {chosen.phone ? ` · ${chosen.phone}` : ''}
                  </span>
                  <Button variant="ghost" onClick={() => setChosen(null)}>
                    Trocar
                  </Button>
                </div>
              ) : (
                <>
                  <Field
                    label="Procurar cliente"
                    type="search"
                    placeholder="Nome, e-mail ou telefone"
                    value={search}
                    error={fieldErrors.customerId}
                    onChange={(event) => setSearch(event.target.value)}
                  />

                  {customers.data && customers.data.items.length > 0 ? (
                    <ul className={styles.results}>
                      {customers.data.items.map((customer) => (
                        <li key={customer.id} className={styles.result}>
                          <button
                            type="button"
                            className={styles.resultButton}
                            onClick={() => setChosen(customer)}
                          >
                            <span className={styles.resultName}>{customer.name}</span>
                            <span className={styles.resultMeta}>
                              {customer.phone ?? 'sem telefone'}
                              {customer.email ? ` · ${customer.email}` : ''}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className={styles.hint}>
                      {customers.isPending
                        ? 'Carregando…'
                        : 'Ninguém encontrado. Tente outro termo ou cadastre agora.'}
                    </p>
                  )}
                </>
              )}
            </>
          ) : (
            <div className={styles.grid}>
              <Field
                label="Nome"
                value={newCustomer.name}
                error={fieldErrors.customer ?? fieldErrors.name}
                onChange={(event) => setNewCustomer({ ...newCustomer, name: event.target.value })}
              />
              <Field
                label="WhatsApp"
                type="tel"
                inputMode="tel"
                placeholder="(11) 99999-0000"
                value={newCustomer.phone}
                error={fieldErrors.phone}
                onChange={(event) => setNewCustomer({ ...newCustomer, phone: event.target.value })}
              />
              <Field
                label="E-mail"
                help="Opcional. Sem ele, a pessoa não recebe aviso por e-mail."
                type="email"
                inputMode="email"
                value={newCustomer.email}
                error={fieldErrors.email}
                onChange={(event) => setNewCustomer({ ...newCustomer, email: event.target.value })}
              />
            </div>
          )}
        </fieldset>

        <fieldset className={styles.group}>
          <legend className={styles.legend}>A festa</legend>

          {/* Mesmo padrão da origem do cliente: dois botões, um ativo (T32). */}
          <div className={styles.switch} role="group" aria-label="O que a reserva contrata">
            <button
              type="button"
              className={[styles.switchOption, !decoration ? styles.switchOptionActive : null]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setKind('VENUE')}
              aria-pressed={!decoration}
            >
              A chácara
            </button>
            <button
              type="button"
              className={[styles.switchOption, decoration ? styles.switchOptionActive : null]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setKind('DECORATION')}
              aria-pressed={decoration}
            >
              Só a decoração
            </button>
          </div>

          {decoration ? (
            <p className={styles.hint}>
              Decoração para festa em outro lugar: um dia, sem convidados. A data continua livre
              para a chácara, e os itens saem do mesmo estoque.
            </p>
          ) : null}

          <div className={styles.grid}>
            <Field
              label={decoration ? 'Dia da festa' : 'Entrada'}
              type="date"
              value={startDate}
              error={fieldErrors.startDate}
              onChange={(event) => {
                setStartDate(event.target.value);
                // A saída acompanha a entrada quando ficaria antes dela.
                if (endDate === '' || endDate < event.target.value) setEndDate(event.target.value);
              }}
            />

            {decoration ? null : (
              <Field
                label="Saída"
                help="Igual à entrada numa festa de um dia."
                type="date"
                min={startDate || undefined}
                value={endDate}
                error={fieldErrors.endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            )}

            {decoration ? null : (
              <Field
                label="Convidados"
                type="number"
                min={1}
                inputMode="numeric"
                value={guestCount}
                error={fieldErrors.guestCount}
                onChange={(event) => setGuestCount(event.target.value)}
              />
            )}
          </div>
        </fieldset>

        <fieldset className={styles.group}>
          <legend className={styles.legend}>Itens do pegue e monte</legend>

          <p className={styles.hint}>
            {decoration
              ? 'Escolha pelo menos um item: é o que a pessoa vai levar.'
              : 'Opcional. Deixe tudo em zero para alugar só a chácara.'}
          </p>

          {catalog.data?.map((item) => (
            <div key={item.id} className={styles.itemRow}>
              <span className={styles.itemName}>
                <strong>{item.name}</strong>
                <span className={styles.itemPrice}>
                  <Money cents={item.priceCents} /> · {item.stock} em estoque
                </span>
              </span>

              <QuantityStepper
                value={quantities[item.id] ?? 0}
                max={item.stock}
                label={item.name}
                onChange={(quantity) => setQuantities({ ...quantities, [item.id]: quantity })}
              />
            </div>
          ))}

          {fieldErrors.items ? (
            <p className={styles.problem} role="alert">
              {fieldErrors.items}
            </p>
          ) : null}
        </fieldset>

        {/* O total é o do servidor, como no wizard do cliente (§9.7). */}
        {quote.data ? (
          <div className={styles.quote}>
            {quote.data.days.map((day) => (
              <p key={day.date} className={styles.quoteLine}>
                <span>
                  {formatWeekdayAndDay(day.date)}
                  {day.ruleName ? ` · ${day.ruleName}` : ''}
                </span>
                <span className={styles.quoteValue}>
                  <Money cents={day.priceCents} />
                </span>
              </p>
            ))}

            {quote.data.lines.map((line) => (
              <p key={line.itemId} className={styles.quoteLine}>
                <span>
                  {line.quantity}× {line.name}
                </span>
                <span className={styles.quoteValue}>
                  <Money cents={line.totalCents} />
                </span>
              </p>
            ))}

            {quote.data.combos.map((combo) => (
              <p key={combo.comboId} className={styles.quoteLine}>
                <span>{combo.name}</span>
                <span className={styles.quoteValue}>
                  −<Money cents={combo.discountCents} />
                </span>
              </p>
            ))}

            <p className={styles.quoteTotal}>
              <span>Total{quote.isFetching ? ' (calculando…)' : ''}</span>
              <span className={styles.quoteValue}>
                <Money cents={quote.data.totalCents} />
              </span>
            </p>

            {quote.data.issues.map((issue) => (
              <p
                key={issue.code === 'DATE_UNAVAILABLE' ? issue.dates.join(',') : issue.itemId}
                className={styles.problem}
                role="alert"
              >
                {issue.code === 'DATE_UNAVAILABLE'
                  ? decoration
                    ? 'Este dia está fechado para a decoração ou fora do prazo de antecedência.'
                    : 'Alguma dessas datas já está ocupada ou bloqueada.'
                  : 'Falta estoque de um dos itens nessas datas.'}
              </p>
            ))}
          </div>
        ) : (
          <p className={styles.hint}>
            {decoration
              ? 'Escolha o dia e os itens para ver o valor.'
              : 'Escolha as datas para ver o valor.'}
          </p>
        )}

        <fieldset className={styles.group}>
          <legend className={styles.legend}>Observações</legend>

          <Textarea
            label="O que o cliente pediu"
            help="Vai no detalhe da reserva, como se ele tivesse escrito."
            rows={2}
            maxLength={600}
            value={customerNotes}
            onChange={(event) => setCustomerNotes(event.target.value)}
          />

          <Textarea
            label="Sua anotação"
            help="Só você vê."
            rows={2}
            maxLength={2000}
            value={adminNotes}
            onChange={(event) => setAdminNotes(event.target.value)}
          />

          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>
              Já confirmar esta reserva.
              {confirmed
                ? ' O cliente recebe o e-mail de confirmação, se tiver e-mail.'
                : ' Fica aguardando, com prazo correndo, e ninguém é avisado.'}
            </span>
          </label>
        </fieldset>

        <div className={styles.actions}>
          <Button
            type="submit"
            variant="primary"
            loading={create.isPending}
            loadingLabel="Lançando…"
            disabled={!quote.data}
          >
            Lançar reserva
          </Button>
        </div>
      </form>
    </div>
  );
}
