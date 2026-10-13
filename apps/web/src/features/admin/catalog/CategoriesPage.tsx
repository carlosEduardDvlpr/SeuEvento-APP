import { useState } from 'react';
import { type Category, createCategoryBodySchema } from '@chacara/shared';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { EmptyState } from '@/components/EmptyState';
import { Field } from '@/components/Field';
import { Skeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import { PencilIcon, PlusIcon, TrashIcon } from '@/components/icons';
import {
  useAdminCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from '@/api/catalog';
import { type FieldErrors, apiFieldErrors, formErrorMessage, validateForm } from '@/lib/form';
import { ConfirmDialog } from '../ConfirmDialog';
import styles from '../admin.module.css';

/**
 * Categorias do catálogo (§13, agrupadas com os itens na §11.2).
 *
 * Categoria é a gaveta onde o item mora, então não tem "desativar": excluir uma
 * que ainda tem item é recusado pela API, e a mensagem dela já diz o que fazer.
 */

type FormState = { name: string; sortOrder: string };

const EMPTY_FORM: FormState = { name: '', sortOrder: '0' };

export function CategoriesPage() {
  const { showToast } = useToast();
  const categories = useAdminCategories();

  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const [editing, setEditing] = useState<Category | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Category | null>(null);

  const saving = createCategory.isPending || updateCategory.isPending;

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(category: Category) {
    setEditing(category);
    setForm({ name: category.name, sortOrder: String(category.sortOrder) });
    setErrors({});
    setFormError(null);
    setFormOpen(true);
  }

  async function submit() {
    // O mesmo schema do servidor (§12.5): as duas pontas nunca discordam.
    const { data, errors: invalid } = validateForm(createCategoryBodySchema, {
      name: form.name,
      sortOrder: form.sortOrder === '' ? 0 : Number(form.sortOrder),
    });

    setErrors(invalid ?? {});
    setFormError(null);
    if (!data) return;

    try {
      if (editing) {
        await updateCategory.mutateAsync({ id: editing.id, body: data });
      } else {
        await createCategory.mutateAsync(data);
      }

      setFormOpen(false);
      showToast(editing ? 'Categoria salva.' : 'Categoria criada.');
    } catch (error) {
      // Nome duplicado volta como VALIDATION_ERROR apontando o campo.
      setErrors(apiFieldErrors(error));
      setFormError(formErrorMessage(error));
    }
  }

  async function confirmRemove() {
    if (!removing) return;

    try {
      await deleteCategory.mutateAsync(removing.id);
      setRemoving(null);
      showToast('Categoria excluída.');
    } catch (error) {
      setRemoving(null);
      // "Esta categoria ainda tem itens…" já explica o próximo passo.
      showToast(formErrorMessage(error) ?? 'Não foi possível excluir.', 'error');
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>Categorias</h1>
          <p className={styles.subtitle}>
            Como os itens aparecem agrupados na vitrine. A ordem define a sequência das seções.
          </p>
        </div>

        <Button variant="primary" onClick={openCreate}>
          <PlusIcon size={20} />
          Nova categoria
        </Button>
      </header>

      {categories.isPending ? <Skeleton rows={4} /> : null}

      {categories.isError ? (
        <p className={styles.formError}>{formErrorMessage(categories.error)}</p>
      ) : null}

      {categories.data?.length === 0 ? (
        <EmptyState
          title="Nenhuma categoria ainda"
          description="Categorias agrupam os itens do pegue e monte: Painéis, Mesas, Arcos, Iluminação. Crie a primeira para começar a cadastrar itens."
          action={
            <Button variant="primary" onClick={openCreate}>
              Nova categoria
            </Button>
          }
        />
      ) : null}

      {categories.data && categories.data.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className="sr-only">Categorias do catálogo</caption>
            <thead>
              <tr>
                <th scope="col">Nome</th>
                <th scope="col" className={styles.numeric}>
                  Ordem
                </th>
                <th scope="col">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {categories.data.map((category) => (
                <tr key={category.id}>
                  <td>{category.name}</td>
                  <td className={styles.numeric}>{category.sortOrder}</td>
                  <td>
                    <div className={styles.actions}>
                      {/* O rótulo carrega o nome da linha: "Editar Painéis". */}
                      <button
                        type="button"
                        className={styles.iconButton}
                        onClick={() => openEdit(category)}
                        aria-label={`Editar ${category.name}`}
                      >
                        <PencilIcon size={20} />
                      </button>
                      <button
                        type="button"
                        className={[styles.iconButton, styles.iconButtonDanger].join(' ')}
                        onClick={() => setRemoving(category)}
                        aria-label={`Excluir ${category.name}`}
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
        title={editing ? 'Editar categoria' : 'Nova categoria'}
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

          <Field
            label="Ordem"
            type="number"
            min={0}
            value={form.sortOrder}
            onChange={(event) => setForm({ ...form, sortOrder: event.target.value })}
            error={errors.sortOrder}
            help="Menor aparece primeiro."
          />
        </div>
      </Dialog>

      <ConfirmDialog
        open={removing !== null}
        title="Excluir categoria"
        message={`A categoria "${removing?.name}" sai do catálogo.`}
        detail="Só é possível excluir categoria sem nenhum item. Se ela tiver itens, mova-os para outra categoria primeiro."
        confirmLabel="Excluir categoria"
        loading={deleteCategory.isPending}
        onConfirm={confirmRemove}
        onClose={() => setRemoving(null)}
      />
    </div>
  );
}
