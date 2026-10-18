import { useMemo, useState } from 'react';
import {
  type AdminCombo,
  type ComboPreviewBody,
  DISCOUNT_TYPES,
  type DiscountType,
  createComboBodySchema,
} from '@chacara/shared';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { EmptyState } from '@/components/EmptyState';
import { Field } from '@/components/Field';
import { Money } from '@/components/Money';
import { MoneyField } from '@/components/MoneyField';
import { Select } from '@/components/Select';
import { Skeleton } from '@/components/Skeleton';
import { Textarea } from '@/components/Textarea';
import { useToast } from '@/components/Toast';
import { PencilIcon, PlusIcon, TrashIcon } from '@/components/icons';
import { useAdminItems, useAdminThemes } from '@/api/catalog';
import {
  useAdminCombos,
  useComboPreview,
  useCreateCombo,
  useDeleteCombo,
  useUpdateCombo,
} from '@/api/pricing';
import { type FieldErrors, apiFieldErrors, formErrorMessage, validateForm } from '@/lib/form';
import { ConfirmDialog } from '../ConfirmDialog';
import styles from '../admin.module.css';
import comboStyles from './CombosPage.module.css';

/**
 * Combos (§13).
 *
 * A prévia da economia vem da API (`POST /admin/combos/preview`) em vez de ser
 * calculada aqui. Fazer a conta no front duplicaria a regra da §9.6 — o
 * arredondamento do percentual e o piso do preço fechado — e deixaria a prévia
 * prometer uma economia diferente da que o cliente receberia no orçamento.
 */

type ComboLineForm = { itemId: string; quantity: number };

type FormState = {
  name: string;
  description: string;
  imageUrl: string;
  themeId: string;
  discountType: DiscountType;
  discountValue: number | null;
  items: ComboLineForm[];
  active: boolean;
};

const EMPTY_FORM: FormState = {
  name: '',
  description: '',
  imageUrl: '',
  themeId: '',
  discountType: 'PERCENT',
  discountValue: null,
  items: [],
  active: true,
};

const DISCOUNT_TYPE_LABELS: Record<DiscountType, string> = {
  PERCENT: 'Porcentagem de desconto',
  FIXED_PRICE: 'Preço fechado do combo',
};

/** Todos os itens para o seletor: o combo pode misturar categoria e estilo. */
const PICKER_PAGE_SIZE = 100;

export function CombosPage() {
  const { showToast } = useToast();

  const combos = useAdminCombos();
  const themes = useAdminThemes();
  const catalog = useAdminItems({ page: 1, pageSize: PICKER_PAGE_SIZE });

  const createCombo = useCreateCombo();
  const updateCombo = useUpdateCombo();
  const deleteCombo = useDeleteCombo();

  const [editing, setEditing] = useState<AdminCombo | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<AdminCombo | null>(null);

  const saving = createCombo.isPending || updateCombo.isPending;

  /*
   * Só pede a prévia quando o combo está completo o bastante para valer um
   * número. Sem o `useMemo`, o objeto novo a cada render viraria chave de query
   * nova e pediria a prévia sem parar.
   */
  const previewBody = useMemo<ComboPreviewBody | null>(() => {
    if (!formOpen || form.items.length === 0 || form.discountValue === null) return null;

    return {
      discountType: form.discountType,
      discountValue: form.discountValue,
      items: form.items,
    };
  }, [formOpen, form.items, form.discountType, form.discountValue]);

  const preview = useComboPreview(previewBody);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(combo: AdminCombo) {
    setEditing(combo);
    setForm({
      name: combo.name,
      description: combo.description ?? '',
      imageUrl: combo.imageUrl ?? '',
      themeId: combo.themeId ?? '',
      discountType: combo.discountType,
      discountValue: combo.discountValue,
      items: combo.items.map((line) => ({ itemId: line.itemId, quantity: line.quantity })),
      active: combo.active,
    });
    setErrors({});
    setFormError(null);
    setFormOpen(true);
  }

  function toggleItem(itemId: string) {
    setForm((current) => ({
      ...current,
      items: current.items.some((line) => line.itemId === itemId)
        ? current.items.filter((line) => line.itemId !== itemId)
        : [...current.items, { itemId, quantity: 1 }],
    }));
  }

  function setQuantity(itemId: string, quantity: number) {
    setForm((current) => ({
      ...current,
      items: current.items.map((line) => (line.itemId === itemId ? { ...line, quantity } : line)),
    }));
  }

  async function submit() {
    const { data, errors: invalid } = validateForm(createComboBodySchema, {
      name: form.name,
      description: form.description,
      imageUrl: form.imageUrl,
      themeId: form.themeId === '' ? null : form.themeId,
      discountType: form.discountType,
      discountValue: form.discountValue ?? Number.NaN,
      items: form.items,
      active: form.active,
    });

    setErrors(invalid ?? {});
    setFormError(null);
    if (!data) return;

    try {
      if (editing) {
        await updateCombo.mutateAsync({ id: editing.id, body: data });
      } else {
        await createCombo.mutateAsync(data);
      }

      setFormOpen(false);
      showToast(editing ? 'Combo salvo.' : 'Combo criado.');
    } catch (error) {
      setErrors(apiFieldErrors(error));
      setFormError(formErrorMessage(error));
    }
  }

  async function confirmRemove() {
    if (!removing) return;

    try {
      const result = await deleteCombo.mutateAsync(removing.id);
      setRemoving(null);

      showToast(
        result.outcome === 'deleted'
          ? 'Combo excluído.'
          : 'Combo desativado: ele já foi aplicado em alguma reserva e some da vitrine, mas continua no histórico.',
      );
    } catch (error) {
      setRemoving(null);
      showToast(formErrorMessage(error) ?? 'Não foi possível excluir.', 'error');
    }
  }

  const themeName = (id: string | null) =>
    id === null ? null : (themes.data?.find((theme) => theme.id === id)?.name ?? id);

  const noItems = catalog.data?.items.length === 0;
  /*
   * Em porcentagem o campo é de 1 a 100, não de dinheiro. Os dois valores dividem
   * a coluna `discountValue` no banco (§9.6), e o formulário tem de deixar claro
   * qual deles está sendo digitado.
   */
  const isPercent = form.discountType === 'PERCENT';

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>Combos</h1>
          <p className={styles.subtitle}>
            Conjuntos de itens com desconto quando levados juntos. O desconto é aplicado
            automaticamente quando o pedido do cliente contém o combo inteiro.
          </p>
        </div>

        <Button variant="primary" onClick={openCreate} disabled={noItems}>
          <PlusIcon size={20} />
          Novo combo
        </Button>
      </header>

      {noItems ? (
        <EmptyState
          title="Cadastre itens primeiro"
          description="Um combo é feito de itens. Cadastre pelo menos dois itens para poder montar um conjunto com desconto."
        />
      ) : null}

      {combos.isPending ? <Skeleton rows={4} /> : null}

      {combos.isError ? (
        <p className={styles.formError} role="alert">
          {formErrorMessage(combos.error)}
        </p>
      ) : null}

      {combos.data?.length === 0 && !noItems ? (
        <EmptyState
          title="Nenhum combo ainda"
          description="Combo é o que faz o pedido crescer: o cliente leva o conjunto e paga menos que a soma das partes."
          action={
            <Button variant="primary" onClick={openCreate}>
              Novo combo
            </Button>
          }
        />
      ) : null}

      {combos.data && combos.data.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className="sr-only">Combos do catálogo</caption>
            <thead>
              <tr>
                <th scope="col">Combo</th>
                <th scope="col">Estilo</th>
                <th scope="col">Itens</th>
                <th scope="col" className={styles.numeric}>
                  Soma dos itens
                </th>
                <th scope="col" className={styles.numeric}>
                  Economia
                </th>
                <th scope="col" className={styles.numeric}>
                  O cliente paga
                </th>
                <th scope="col">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {combos.data.map((combo) => (
                <tr key={combo.id}>
                  <td>
                    <strong>{combo.name}</strong>
                    {combo.active ? null : (
                      <>
                        {' '}
                        <span className={[styles.badge, styles.badgeOff].join(' ')}>
                          Desativado
                        </span>
                      </>
                    )}
                    {/* A vitrine esconde combo não montável; o painel explica. */}
                    {combo.active && !combo.available ? (
                      <>
                        {' '}
                        <span className={[styles.badge, styles.badgeWarn].join(' ')}>
                          Fora da vitrine: tem item desativado
                        </span>
                      </>
                    ) : null}
                  </td>
                  <td>{themeName(combo.themeId) ?? '—'}</td>
                  <td>
                    <ul className={comboStyles.itemList}>
                      {combo.items.map((line) => (
                        <li key={line.itemId}>
                          {line.quantity}× {line.name}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className={styles.numeric}>
                    <Money cents={combo.itemsTotalCents} />
                  </td>
                  <td className={[styles.numeric, comboStyles.saving].join(' ')}>
                    <Money cents={combo.discountCents} />
                  </td>
                  <td className={styles.numeric}>
                    <Money cents={combo.priceCents} />
                  </td>
                  <td>
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.iconButton}
                        onClick={() => openEdit(combo)}
                        aria-label={`Editar ${combo.name}`}
                      >
                        <PencilIcon size={20} />
                      </button>
                      <button
                        type="button"
                        className={[styles.iconButton, styles.iconButtonDanger].join(' ')}
                        onClick={() => setRemoving(combo)}
                        aria-label={`Excluir ${combo.name}`}
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

      <Dialog
        open={formOpen}
        title={editing ? 'Editar combo' : 'Novo combo'}
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
            autoComplete="off"
          />

          <Textarea
            label="Descrição"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            error={errors.description}
          />

          <Select
            label="Estilo"
            value={form.themeId}
            onChange={(event) => setForm({ ...form, themeId: event.target.value })}
            error={errors.themeId}
            help="Opcional. Define em qual estilo o combo aparece na vitrine."
          >
            <option value="">Sem estilo</option>
            {themes.data?.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.name}
              </option>
            ))}
          </Select>

          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>Itens do combo</legend>

            {errors.items ? (
              <span className={styles.formError} role="alert">
                {errors.items}
              </span>
            ) : null}

            <ul className={comboStyles.picker}>
              {catalog.data?.items.map((item) => {
                const line = form.items.find((entry) => entry.itemId === item.id);

                return (
                  <li key={item.id} className={comboStyles.pickerRow}>
                    <input
                      id={`combo-item-${item.id}`}
                      type="checkbox"
                      checked={line !== undefined}
                      onChange={() => toggleItem(item.id)}
                    />

                    <label className={comboStyles.pickerLabel} htmlFor={`combo-item-${item.id}`}>
                      {item.name}
                      <span className={comboStyles.pickerPrice}>
                        <Money cents={item.priceCents} /> · {item.category.name}
                      </span>
                    </label>

                    <input
                      className={comboStyles.quantity}
                      type="number"
                      min={1}
                      max={99}
                      value={line?.quantity ?? 1}
                      onChange={(event) => setQuantity(item.id, Number(event.target.value))}
                      disabled={line === undefined}
                      aria-label={`Quantidade de ${item.name}`}
                    />
                  </li>
                );
              })}
            </ul>
          </fieldset>

          <Select
            label="Tipo de desconto"
            value={form.discountType}
            onChange={(event) =>
              // Trocar o tipo limpa o valor: 28000 centavos viraria 28000% e a API
              // recusaria, então é melhor o campo voltar vazio.
              setForm({
                ...form,
                discountType: event.target.value as DiscountType,
                discountValue: null,
              })
            }
            error={errors.discountType}
          >
            {DISCOUNT_TYPES.map((type) => (
              <option key={type} value={type}>
                {DISCOUNT_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>

          {isPercent ? (
            <Field
              label="Desconto"
              type="number"
              min={1}
              max={100}
              value={form.discountValue === null ? '' : String(form.discountValue)}
              onChange={(event) =>
                setForm({
                  ...form,
                  discountValue: event.target.value === '' ? null : Number(event.target.value),
                })
              }
              error={errors.discountValue}
              help="De 1 a 100 por cento."
            />
          ) : (
            <MoneyField
              label="Preço fechado do combo"
              valueCents={form.discountValue}
              onChangeCents={(cents) => setForm({ ...form, discountValue: cents })}
              error={errors.discountValue}
              help="Quanto o cliente paga levando o combo inteiro."
            />
          )}

          {/* Prévia da §13, calculada pela API para não divergir do orçamento. */}
          {preview.data ? (
            <div className={comboStyles.preview}>
              <p className={comboStyles.previewLine}>
                <span>Soma dos itens</span>
                <Money cents={preview.data.itemsTotalCents} />
              </p>
              <p className={comboStyles.previewLine}>
                <span>Economia do cliente</span>
                <span className={comboStyles.saving}>
                  <Money cents={preview.data.discountCents} />
                </span>
              </p>
              <p className={[comboStyles.previewLine, comboStyles.previewTotal].join(' ')}>
                <span>O cliente paga</span>
                <Money cents={preview.data.priceCents} />
              </p>
            </div>
          ) : (
            <p className={comboStyles.previewHint}>
              Escolha os itens e informe o desconto para ver quanto o cliente economiza.
            </p>
          )}

          <div className={styles.checkRow}>
            <input
              id="combo-active"
              type="checkbox"
              checked={form.active}
              onChange={(event) => setForm({ ...form, active: event.target.checked })}
            />
            <label htmlFor="combo-active">Aparece na vitrine</label>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={removing !== null}
        title="Excluir combo"
        message={`O combo "${removing?.name}" sai da vitrine.`}
        detail="Se ele já foi aplicado em alguma reserva, em vez de excluir a gente desativa: o histórico precisa continuar explicando de onde veio aquele desconto."
        confirmLabel="Excluir combo"
        loading={deleteCombo.isPending}
        onConfirm={confirmRemove}
        onClose={() => setRemoving(null)}
      />
    </div>
  );
}
