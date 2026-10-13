import { useState } from 'react';
import {
  DAY_OF_WEEK_LABELS,
  type PriceRule,
  SIMULATION_MAX_DAYS,
  createPriceRuleBodySchema,
  simulatePriceQuerySchema,
} from '@chacara/shared';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { EmptyState } from '@/components/EmptyState';
import { Field } from '@/components/Field';
import { Money } from '@/components/Money';
import { MoneyField } from '@/components/MoneyField';
import { Select } from '@/components/Select';
import { Skeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import { PencilIcon, PlusIcon, TrashIcon } from '@/components/icons';
import {
  useAdminPriceRules,
  useCreatePriceRule,
  useDeletePriceRule,
  usePriceSimulation,
  useUpdatePriceRule,
} from '@/api/pricing';
import { formatDateShort, formatWeekdayAndDay } from '@/lib/format';
import { type FieldErrors, apiFieldErrors, formErrorMessage, validateForm } from '@/lib/form';
import { ConfirmDialog } from '../ConfirmDialog';
import styles from '../admin.module.css';
import priceStyles from './PricesPage.module.css';

/**
 * Regras de preço da diária e o simulador (§13).
 *
 * O simulador é o que torna a prioridade compreensível: duas regras podem pegar o
 * mesmo dia, e ver "02/01 — R$ 3.500 — Réveillon" é mais claro que qualquer
 * explicação de como o desempate funciona.
 */

type FormState = {
  name: string;
  dayOfWeek: string;
  startDate: string;
  endDate: string;
  priceCents: number | null;
  priority: string;
  active: boolean;
};

const EMPTY_FORM: FormState = {
  name: '',
  dayOfWeek: '',
  startDate: '',
  endDate: '',
  priceCents: null,
  priority: '0',
  active: true,
};

export function PricesPage() {
  const { showToast } = useToast();

  const rules = useAdminPriceRules();
  const createRule = useCreatePriceRule();
  const updateRule = useUpdatePriceRule();
  const deleteRule = useDeletePriceRule();

  const [editing, setEditing] = useState<PriceRule | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<PriceRule | null>(null);

  const [range, setRange] = useState({ from: '', to: '' });
  const [committedRange, setCommittedRange] = useState<{ from: string; to: string } | null>(null);
  const [rangeError, setRangeError] = useState<FieldErrors>({});
  const simulation = usePriceSimulation(committedRange);

  const saving = createRule.isPending || updateRule.isPending;

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(rule: PriceRule) {
    setEditing(rule);
    setForm({
      name: rule.name,
      dayOfWeek: rule.dayOfWeek === null ? '' : String(rule.dayOfWeek),
      startDate: rule.startDate ?? '',
      endDate: rule.endDate ?? '',
      priceCents: rule.priceCents,
      priority: String(rule.priority),
      active: rule.active,
    });
    setErrors({});
    setFormError(null);
    setFormOpen(true);
  }

  async function submit() {
    const { data, errors: invalid } = validateForm(createPriceRuleBodySchema, {
      name: form.name,
      dayOfWeek: form.dayOfWeek === '' ? null : Number(form.dayOfWeek),
      startDate: form.startDate === '' ? null : form.startDate,
      endDate: form.endDate === '' ? null : form.endDate,
      priceCents: form.priceCents ?? Number.NaN,
      priority: form.priority === '' ? 0 : Number(form.priority),
      active: form.active,
    });

    setErrors(invalid ?? {});
    setFormError(null);
    if (!data) return;

    try {
      if (editing) {
        await updateRule.mutateAsync({ id: editing.id, body: data });
      } else {
        await createRule.mutateAsync(data);
      }

      setFormOpen(false);
      showToast(editing ? 'Regra salva.' : 'Regra criada.');
    } catch (error) {
      setErrors(apiFieldErrors(error));
      setFormError(formErrorMessage(error));
    }
  }

  async function confirmRemove() {
    if (!removing) return;

    try {
      await deleteRule.mutateAsync(removing.id);
      setRemoving(null);
      showToast('Regra excluída.');
    } catch (error) {
      setRemoving(null);
      showToast(formErrorMessage(error) ?? 'Não foi possível excluir.', 'error');
    }
  }

  function simulate() {
    const { data, errors: invalid } = validateForm(simulatePriceQuerySchema, range);

    setRangeError(invalid ?? {});
    if (!data) return;

    setCommittedRange(data);
  }

  /** "Todo sábado", "de 28/12 a 02/01", "todo dia" — como o dono leria em voz alta. */
  function describeRule(rule: PriceRule): string {
    const day =
      rule.dayOfWeek === null ? null : `todo ${DAY_OF_WEEK_LABELS[rule.dayOfWeek]?.toLowerCase()}`;

    const period =
      rule.startDate && rule.endDate
        ? `de ${formatDateShort(rule.startDate)} a ${formatDateShort(rule.endDate)}`
        : rule.startDate
          ? `a partir de ${formatDateShort(rule.startDate)}`
          : rule.endDate
            ? `até ${formatDateShort(rule.endDate)}`
            : null;

    const parts = [day, period].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : 'todo dia, sem período';
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>Preços</h1>
          <p className={styles.subtitle}>
            A diária varia por dia da semana, por período, ou os dois. Quando duas regras pegam o
            mesmo dia, vence a de maior prioridade.
          </p>
        </div>

        <Button variant="primary" onClick={openCreate}>
          <PlusIcon size={20} />
          Nova regra
        </Button>
      </header>

      {rules.isPending ? <Skeleton rows={4} /> : null}

      {rules.isError ? <p className={styles.formError}>{formErrorMessage(rules.error)}</p> : null}

      {rules.data?.length === 0 ? (
        <EmptyState
          title="Nenhuma regra de preço"
          description="Sem regra, todo dia custa a diária base das configurações. Crie uma regra para cobrar diferente em fim de semana, feriado ou temporada."
          action={
            <Button variant="primary" onClick={openCreate}>
              Nova regra
            </Button>
          }
        />
      ) : null}

      {rules.data && rules.data.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className="sr-only">Regras de preço da diária</caption>
            <thead>
              <tr>
                <th scope="col">Regra</th>
                <th scope="col">Quando vale</th>
                <th scope="col" className={styles.numeric}>
                  Diária
                </th>
                <th scope="col" className={styles.numeric}>
                  Prioridade
                </th>
                <th scope="col">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rules.data.map((rule) => (
                <tr key={rule.id}>
                  <td>
                    <strong>{rule.name}</strong>
                    {rule.active ? null : (
                      <>
                        {' '}
                        <span className={[styles.badge, styles.badgeOff].join(' ')}>
                          Desativada
                        </span>
                      </>
                    )}
                  </td>
                  <td>{describeRule(rule)}</td>
                  <td className={styles.numeric}>
                    <Money cents={rule.priceCents} />
                  </td>
                  <td className={styles.numeric}>{rule.priority}</td>
                  <td>
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.iconButton}
                        onClick={() => openEdit(rule)}
                        aria-label={`Editar ${rule.name}`}
                      >
                        <PencilIcon size={20} />
                      </button>
                      <button
                        type="button"
                        className={[styles.iconButton, styles.iconButtonDanger].join(' ')}
                        onClick={() => setRemoving(rule)}
                        aria-label={`Excluir ${rule.name}`}
                      >
                        <TrashIcon size={20} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <section className={priceStyles.simulator}>
        <div>
          <h2 className={priceStyles.simulatorTitle}>Simulador</h2>
          <p className={styles.subtitle}>
            Escolha um período e veja o valor de cada dia e qual regra venceu. No máximo{' '}
            {SIMULATION_MAX_DAYS} dias por consulta.
          </p>
        </div>

        <div className={priceStyles.simulatorForm}>
          <Field
            label="De"
            type="date"
            value={range.from}
            onChange={(event) => setRange({ ...range, from: event.target.value })}
            error={rangeError.from}
          />
          <Field
            label="Até"
            type="date"
            value={range.to}
            onChange={(event) => setRange({ ...range, to: event.target.value })}
            error={rangeError.to}
          />
          <Button onClick={simulate} loading={simulation.isFetching} loadingLabel="Calculando…">
            Simular
          </Button>
        </div>

        {simulation.isError ? (
          <p className={styles.formError} role="alert">
            {formErrorMessage(simulation.error)}
          </p>
        ) : null}

        {simulation.data ? (
          <>
            <ul className={priceStyles.dayList}>
              {simulation.data.days.map((day) => (
                <li key={day.date} className={priceStyles.day}>
                  <span className={priceStyles.dayDate}>
                    {/* O dia da semana é o que explica a regra que venceu. */}
                    {formatWeekdayAndDay(day.date)}
                    {day.ruleName ? (
                      <span className={priceStyles.ruleName}>{day.ruleName}</span>
                    ) : (
                      <span className={priceStyles.baseName}>diária base</span>
                    )}
                  </span>
                  <span className={priceStyles.dayPrice}>
                    <Money cents={day.priceCents} />
                  </span>
                </li>
              ))}
            </ul>

            <p className={priceStyles.total}>
              <span>
                Total do período
                <span className={priceStyles.period}>
                  {' '}
                  ({simulation.data.days.length}{' '}
                  {simulation.data.days.length === 1 ? 'dia' : 'dias'})
                </span>
              </span>
              <Money cents={simulation.data.totalCents} />
            </p>
          </>
        ) : null}
      </section>

      <Dialog
        open={formOpen}
        title={editing ? 'Editar regra' : 'Nova regra'}
        onClose={() => setFormOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={submit} loading={saving} loadingLabel="Salvando…">
              Salvar
            </Button>
          </>
        }
      >
        <div className={styles.form}>
          {formError ? (
            <p className={styles.formError} role="alert">
              {formError}
            </p>
          ) : null}

          <Field
            label="Nome"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            error={errors.name}
            help="Aparece no orçamento do cliente e no simulador. Ex.: Sábado, Réveillon."
            autoComplete="off"
          />

          <MoneyField
            label="Valor da diária"
            valueCents={form.priceCents}
            onChangeCents={(cents) => setForm({ ...form, priceCents: cents })}
            error={errors.priceCents}
          />

          <Select
            label="Dia da semana"
            value={form.dayOfWeek}
            onChange={(event) => setForm({ ...form, dayOfWeek: event.target.value })}
            error={errors.dayOfWeek}
            help="Deixe em “qualquer dia” para a regra valer pela data."
          >
            <option value="">Qualquer dia</option>
            {DAY_OF_WEEK_LABELS.map((label, index) => (
              <option key={label} value={index}>
                {label}
              </option>
            ))}
          </Select>

          <div className={styles.formRow}>
            <Field
              label="Início do período"
              type="date"
              value={form.startDate}
              onChange={(event) => setForm({ ...form, startDate: event.target.value })}
              error={errors.startDate}
              help="Vazio = sem início."
            />
            <Field
              label="Fim do período"
              type="date"
              value={form.endDate}
              onChange={(event) => setForm({ ...form, endDate: event.target.value })}
              error={errors.endDate}
              help="Vazio = sem fim."
            />
          </div>

          <div className={styles.formRow}>
            <Field
              label="Prioridade"
              type="number"
              min={0}
              value={form.priority}
              onChange={(event) => setForm({ ...form, priority: event.target.value })}
              error={errors.priority}
              help="Maior vence quando duas regras pegam o mesmo dia."
            />

            <div className={styles.checkRow}>
              <input
                id="rule-active"
                type="checkbox"
                checked={form.active}
                onChange={(event) => setForm({ ...form, active: event.target.checked })}
              />
              <label htmlFor="rule-active">Regra em uso</label>
            </div>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={removing !== null}
        title="Excluir regra"
        message={`A regra "${removing?.name}" deixa de valer.`}
        detail="As reservas já feitas não mudam: elas guardam o valor e o nome da regra que valeu no dia. Se quiser apenas parar de usar, edite a regra e desmarque “Regra em uso”."
        confirmLabel="Excluir regra"
        loading={deleteRule.isPending}
        onConfirm={confirmRemove}
        onClose={() => setRemoving(null)}
      />
    </div>
  );
}
