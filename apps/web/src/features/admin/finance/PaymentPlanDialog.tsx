import type { PaymentPlan, SavePaymentPlanBody } from '@chacara/shared';
import {
  MAX_INSTALLMENTS,
  paymentLabel,
  savePaymentPlanBodySchema,
  todayInSaoPaulo,
} from '@chacara/shared';
import { useId, useState } from 'react';
import { useSavePaymentPlan } from '@/api/admin-finance';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { Field } from '@/components/Field';
import { Money } from '@/components/Money';
import { MoneyField } from '@/components/MoneyField';
import { Select } from '@/components/Select';
import { useToast } from '@/components/Toast';
import { formErrorMessage, type FieldErrors } from '@/lib/form';
import { formatBRL, formatDateShort } from '@/lib/format';
import adminStyles from '../admin.module.css';
import { defaultFirstDueDate, monthlyInstallments, splitCents } from './plan';
import styles from './payments.module.css';

/**
 * Editor do plano de pagamento (§9.11).
 *
 * O dono anota o sinal e divide o que falta em até 12 vezes. O editor sugere as
 * parcelas (valores iguais, um vencimento por mês) e deixa mudar a data e o
 * valor de cada uma; mudar o número de vezes, a primeira data ou o sinal refaz
 * a sugestão, e mexer numa parcela não refaz nada.
 *
 * O que já foi recebido quando o editor abriu fica travado: é registro de
 * dinheiro que entrou, e corrigir isso é desfazer o recebimento no cartão, à
 * vista de quem está olhando o plano.
 *
 * A soma é conferida aqui para o dono ver na hora o que falta, mas quem decide é
 * a API, contra o total que a reserva guardou.
 *
 * Quem usa monta o diálogo só enquanto ele está aberto: o rascunho nasce do
 * plano salvo a cada abertura.
 */
export type PaymentPlanDialogProps = {
  booking: { id: string; startDate: string; totalCents: number };
  plan: PaymentPlan;
  onClose: () => void;
};

type RowDraft = { key: string; dueDate: string; amountCents: number | null };

type Draft = {
  depositCents: number | null;
  depositDate: string;
  depositReceived: boolean;
  /** Parcelas em aberto que o plano vai ter. */
  count: number;
  /** Vencimento da primeira parcela em aberto; com uma só, é o dela. */
  firstDueDate: string;
  /** As parcelas em aberto, editáveis uma a uma. Só existem a partir de duas. */
  rows: RowDraft[];
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const LOCKED_HINT =
  'O que já foi recebido fica como está. Para mudar, desfaça o recebimento no cartão de pagamento.';

function countLabel(count: number): string {
  if (count === 0) return 'Nenhuma parcela';

  return count === 1 ? '1 vez' : `${count} vezes`;
}

function sumOf(values: (number | null)[]): number {
  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function initialDraft(plan: PaymentPlan, startDate: string, today: string): Draft {
  const openDeposit = plan.payments.find((p) => p.kind === 'DEPOSIT' && p.paidOn === null);
  const open = plan.payments.filter((p) => p.kind === 'INSTALLMENT' && p.paidOn === null);
  const fresh = plan.payments.length === 0;

  return {
    depositCents: openDeposit?.amountCents ?? null,
    depositDate: openDeposit?.dueDate ?? today,
    // Num plano novo, o sinal costuma ser anotado quando o dinheiro já entrou.
    depositReceived: openDeposit === undefined,
    // Plano novo começa à vista: um clique em salvar já registra o caso mais simples.
    count: fresh ? 1 : open.length,
    firstDueDate: open[0]?.dueDate ?? defaultFirstDueDate(startDate, today),
    rows:
      open.length >= 2
        ? open.map((p) => ({ key: p.id, dueDate: p.dueDate, amountCents: p.amountCents }))
        : [],
  };
}

export function PaymentPlanDialog({ booking, plan, onClose }: PaymentPlanDialogProps) {
  const today = todayInSaoPaulo();
  const save = useSavePaymentPlan();
  const { showToast } = useToast();
  const receivedId = useId();

  const lockedDeposit =
    plan.payments.find((p) => p.kind === 'DEPOSIT' && p.paidOn !== null) ?? null;
  const lockedRows = plan.payments.filter((p) => p.kind === 'INSTALLMENT' && p.paidOn !== null);
  const lockedCents = sumOf(lockedRows.map((p) => p.amountCents));
  const maxCount = MAX_INSTALLMENTS - lockedRows.length;

  const [draft, setDraft] = useState<Draft>(() => initialDraft(plan, booking.startDate, today));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  function remainingFor(next: Draft): number {
    return (
      booking.totalCents - (lockedDeposit?.amountCents ?? next.depositCents ?? 0) - lockedCents
    );
  }

  /** Refaz as parcelas em aberto: um vencimento por mês a partir da primeira data. */
  function withRows(next: Draft): Draft {
    if (next.count < 2) return { ...next, rows: [] };

    const firstDueDate = ISO_DATE.test(next.firstDueDate) ? next.firstDueDate : today;

    return {
      ...next,
      firstDueDate,
      rows: monthlyInstallments(remainingFor(next), next.count, firstDueDate).map((row, index) => ({
        key: `new-${index}`,
        ...row,
      })),
    };
  }

  /** Refaz só os valores: as datas que o dono escolheu continuam. */
  function withAmounts(next: Draft): Draft {
    const amounts = splitCents(remainingFor(next), next.rows.length);

    return {
      ...next,
      rows: next.rows.map((row, index) => ({ ...row, amountCents: amounts[index] ?? 0 })),
    };
  }

  const depositCents = lockedDeposit?.amountCents ?? draft.depositCents ?? 0;
  const hasDeposit = depositCents > 0;
  const remaining = remainingFor(draft);
  const label = (number: number) =>
    paymentLabel(
      { kind: 'INSTALLMENT', number },
      { installments: lockedRows.length + draft.count, hasDeposit },
    );

  function buildBody(): SavePaymentPlanBody {
    const typedDeposit = draft.depositCents ?? 0;

    const deposit = lockedDeposit
      ? {
          dueDate: lockedDeposit.dueDate,
          amountCents: lockedDeposit.amountCents,
          paidOn: lockedDeposit.paidOn,
        }
      : typedDeposit > 0
        ? {
            dueDate: draft.depositDate,
            amountCents: typedDeposit,
            paidOn: draft.depositReceived ? draft.depositDate : null,
          }
        : null;

    const open =
      draft.count === 0
        ? []
        : draft.count === 1
          ? [{ dueDate: draft.firstDueDate, amountCents: Math.max(0, remaining), paidOn: null }]
          : draft.rows.map((row) => ({
              dueDate: row.dueDate,
              amountCents: row.amountCents ?? 0,
              paidOn: null,
            }));

    return {
      deposit,
      installments: [
        ...lockedRows.map((p) => ({
          dueDate: p.dueDate,
          amountCents: p.amountCents,
          paidOn: p.paidOn,
        })),
        ...open,
      ],
    };
  }

  const body = buildBody();
  const sum = sumOf([
    body.deposit?.amountCents ?? 0,
    ...body.installments.map((row) => row.amountCents),
  ]);
  const diff = booking.totalCents - sum;

  /**
   * Os erros saem com o caminho do corpo (`installments.2.amountCents`), que é
   * também o que a API usaria. A §12.5 pede o erro ao lado do campo, e o
   * `validateForm` só guarda o campo de primeiro nível, então aqui a conta é à mão.
   */
  function validate(): { errors: FieldErrors; formError: string | null } | null {
    const found: FieldErrors = {};
    let message: string | null = null;

    // Antes do schema: "Use o formato AAAA-MM-DD" não diz nada a quem usa o seletor de data.
    if (body.deposit?.dueDate === '') found['deposit.dueDate'] = 'Informe a data.';
    body.installments.forEach((row, index) => {
      if (row.dueDate === '') found[`installments.${index}.dueDate`] = 'Informe a data.';
    });

    if (body.deposit?.paidOn && body.deposit.paidOn > today) {
      found['deposit.dueDate'] ??= 'A data do recebimento não pode ser depois de hoje.';
    }

    if (remaining < 0) message = 'O sinal passa do total da reserva.';
    else if (remaining === 0 && draft.count > 0) {
      message = 'Não falta nada a dividir: escolha “Nenhuma parcela”.';
    }

    const parsed = savePaymentPlanBodySchema.safeParse(body);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        if (issue.path.length < 2) {
          message ??= issue.message;
          continue;
        }
        found[issue.path.map(String).join('.')] ??= issue.message;
      }
    }

    if (diff !== 0) {
      message ??= `A soma do sinal e das parcelas (${formatBRL(sum)}) precisa ser igual ao total da reserva (${formatBRL(booking.totalCents)}).`;
    }

    return Object.keys(found).length > 0 || message ? { errors: found, formError: message } : null;
  }

  async function submit() {
    const problems = validate();
    setErrors(problems?.errors ?? {});
    setFormError(problems?.formError ?? null);
    if (problems) return;

    try {
      await save.mutateAsync({ bookingId: booking.id, body });
      showToast('Pagamento salvo.');
      onClose();
    } catch (failure) {
      setFormError(formErrorMessage(failure) ?? 'Não conseguimos salvar o pagamento.');
    }
  }

  const typedDeposit = (draft.depositCents ?? 0) > 0;
  const singleDateError = errors[`installments.${lockedRows.length}.dueDate`];

  return (
    <Dialog
      open
      title={plan.payments.length > 0 ? 'Editar pagamento' : 'Registrar pagamento'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={save.isPending}
            loadingLabel="Salvando…"
            onClick={() => void submit()}
          >
            Salvar pagamento
          </Button>
        </>
      }
    >
      <div className={adminStyles.form}>
        {formError ? (
          <p className={adminStyles.formError} role="alert">
            {formError}
          </p>
        ) : null}

        <p className={styles.planTotal}>
          <span>Total da reserva</span>
          <strong>
            <Money cents={booking.totalCents} />
          </strong>
        </p>

        <fieldset className={adminStyles.fieldset}>
          <legend className={adminStyles.legend}>Sinal</legend>

          {lockedDeposit ? (
            <p className={styles.lockedLine}>
              <Money cents={lockedDeposit.amountCents} />, recebido em{' '}
              {formatDateShort(lockedDeposit.paidOn ?? lockedDeposit.dueDate)}.
            </p>
          ) : (
            <>
              <p className={styles.hint}>Deixe o valor vazio se não houve sinal.</p>

              <div className={adminStyles.formRow}>
                <MoneyField
                  label="Valor do sinal"
                  valueCents={draft.depositCents}
                  onChangeCents={(cents) =>
                    setDraft((current) => withAmounts({ ...current, depositCents: cents }))
                  }
                  error={errors['deposit.amountCents']}
                />

                {typedDeposit ? (
                  <Field
                    label={draft.depositReceived ? 'Recebido em' : 'Vence em'}
                    type="date"
                    max={draft.depositReceived ? today : undefined}
                    value={draft.depositDate}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, depositDate: event.target.value }))
                    }
                    error={errors['deposit.dueDate']}
                  />
                ) : null}
              </div>

              {typedDeposit ? (
                <div className={adminStyles.checkRow}>
                  <input
                    id={receivedId}
                    type="checkbox"
                    checked={draft.depositReceived}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, depositReceived: event.target.checked }))
                    }
                  />
                  <label htmlFor={receivedId}>Já recebido</label>
                </div>
              ) : null}
            </>
          )}
        </fieldset>

        <fieldset className={adminStyles.fieldset}>
          <legend className={adminStyles.legend}>Parcelas</legend>

          {lockedRows.length > 0 ? (
            <ul className={styles.lockedList}>
              {lockedRows.map((payment, index) => (
                <li key={payment.id} className={styles.lockedLine}>
                  <strong>{label(index + 1)}</strong>: <Money cents={payment.amountCents} />,
                  recebido em {formatDateShort(payment.paidOn ?? payment.dueDate)}.
                </li>
              ))}
            </ul>
          ) : null}

          <p className={styles.hint}>
            Falta dividir <Money cents={Math.max(0, remaining)} />.
          </p>

          <div className={adminStyles.formRow}>
            <Select
              label="Dividir o que falta em"
              value={draft.count}
              onChange={(event) => {
                const count = Number(event.target.value);
                setDraft((current) => withRows({ ...current, count }));
              }}
            >
              {Array.from({ length: maxCount + 1 }, (_, count) => (
                <option key={count} value={count}>
                  {countLabel(count)}
                </option>
              ))}
            </Select>

            {draft.count > 0 ? (
              <Field
                label={draft.count === 1 ? 'Vencimento' : 'Primeira parcela em'}
                type="date"
                value={draft.firstDueDate}
                onChange={(event) => {
                  const value = event.target.value;
                  // Campo apagado não refaz nada: refazer com data vazia não teria de onde contar.
                  setDraft((current) =>
                    ISO_DATE.test(value)
                      ? withRows({ ...current, firstDueDate: value })
                      : { ...current, firstDueDate: value },
                  );
                }}
                error={draft.count === 1 ? singleDateError : undefined}
              />
            ) : null}
          </div>

          {draft.count === 1 ? (
            <p className={styles.single}>
              <strong>{label(lockedRows.length + 1)}</strong>:{' '}
              <Money cents={Math.max(0, remaining)} />
            </p>
          ) : null}

          {draft.count >= 2 ? (
            <ol className={styles.rows}>
              {draft.rows.map((row, index) => {
                const position = lockedRows.length + index;

                return (
                  <li key={row.key}>
                    <fieldset className={styles.row}>
                      <legend className={styles.rowLegend}>{label(position + 1)}</legend>

                      <Field
                        label="Vencimento"
                        type="date"
                        value={row.dueDate}
                        onChange={(event) => {
                          const dueDate = event.target.value;
                          setDraft((current) => ({
                            ...current,
                            rows: current.rows.map((item, i) =>
                              i === index ? { ...item, dueDate } : item,
                            ),
                          }));
                        }}
                        error={errors[`installments.${position}.dueDate`]}
                      />

                      <MoneyField
                        label="Valor"
                        valueCents={row.amountCents}
                        onChangeCents={(cents) =>
                          setDraft((current) => ({
                            ...current,
                            rows: current.rows.map((item, i) =>
                              i === index ? { ...item, amountCents: cents } : item,
                            ),
                          }))
                        }
                        error={errors[`installments.${position}.amountCents`]}
                      />
                    </fieldset>
                  </li>
                );
              })}
            </ol>
          ) : null}
        </fieldset>

        {lockedDeposit || lockedRows.length > 0 ? (
          <p className={styles.hint}>{LOCKED_HINT}</p>
        ) : null}

        <p className={diff === 0 ? styles.sumOk : styles.sumOff} aria-live="polite">
          {diff === 0
            ? 'A soma bate com o total da reserva.'
            : diff > 0
              ? `Faltam ${formatBRL(diff)} para fechar o total.`
              : `A soma passa ${formatBRL(-diff)} do total.`}
        </p>
      </div>
    </Dialog>
  );
}
