import { useState } from 'react';
import { useNavigate } from 'react-router';
import { type AdminItem, createItemBodySchema } from '@chacara/shared';
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
import { ImageIcon, PencilIcon, PlusIcon, TrashIcon } from '@/components/icons';
import {
  useAdminCategories,
  useAdminItems,
  useAdminThemes,
  useCreateItem,
  useDeleteItem,
  useUpdateItem,
} from '@/api/catalog';
import { type FieldErrors, apiFieldErrors, formErrorMessage, validateForm } from '@/lib/form';
import { ConfirmDialog } from '../ConfirmDialog';
import styles from '../admin.module.css';
import itemStyles from './ItemsPage.module.css';

/**
 * Itens do pegue e monte (§13).
 *
 * O estoque é **por dia**, não pelo período (§9.3): o mesmo painel sai no sábado e
 * volta para sair no sábado seguinte. A ajuda do campo diz isso, porque é a
 * pergunta que o dono faz na primeira vez que cadastra.
 */

type FormState = {
  categoryId: string;
  name: string;
  description: string;
  imageUrl: string;
  priceCents: number | null;
  stock: string;
  assemblyNotes: string;
  themeIds: string[];
  sortOrder: string;
  active: boolean;
};

const EMPTY_FORM: FormState = {
  categoryId: '',
  name: '',
  description: '',
  imageUrl: '',
  priceCents: null,
  stock: '1',
  assemblyNotes: '',
  themeIds: [],
  sortOrder: '0',
  active: true,
};

const PAGE_SIZE = 20;

export function ItemsPage() {
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [themeFilter, setThemeFilter] = useState('');

  const categories = useAdminCategories();
  const themes = useAdminThemes();
  const items = useAdminItems({
    page,
    pageSize: PAGE_SIZE,
    ...(categoryFilter ? { categoryId: categoryFilter } : {}),
    ...(themeFilter ? { themeId: themeFilter } : {}),
  });

  const createItem = useCreateItem();
  const updateItem = useUpdateItem();
  const deleteItem = useDeleteItem();

  const [editing, setEditing] = useState<AdminItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<AdminItem | null>(null);

  const saving = createItem.isPending || updateItem.isPending;
  const themeName = (id: string) => themes.data?.find((theme) => theme.id === id)?.name ?? id;

  function openCreate() {
    setEditing(null);
    // A primeira categoria já vem escolhida: o campo é obrigatório e deixá-lo
    // vazio só produziria um erro que o próprio formulário podia evitar.
    setForm({ ...EMPTY_FORM, categoryId: categories.data?.[0]?.id ?? '' });
    setErrors({});
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(item: AdminItem) {
    setEditing(item);
    setForm({
      categoryId: item.category.id,
      name: item.name,
      description: item.description ?? '',
      imageUrl: item.imageUrl ?? '',
      priceCents: item.priceCents,
      stock: String(item.stock),
      assemblyNotes: item.assemblyNotes ?? '',
      themeIds: item.themeIds,
      sortOrder: String(item.sortOrder),
      active: item.active,
    });
    setErrors({});
    setFormError(null);
    setFormOpen(true);
  }

  function toggleTheme(themeId: string) {
    setForm((current) => ({
      ...current,
      themeIds: current.themeIds.includes(themeId)
        ? current.themeIds.filter((id) => id !== themeId)
        : [...current.themeIds, themeId],
    }));
  }

  async function submit() {
    const { data, errors: invalid } = validateForm(createItemBodySchema, {
      categoryId: form.categoryId,
      name: form.name,
      description: form.description,
      imageUrl: form.imageUrl,
      priceCents: form.priceCents ?? Number.NaN,
      stock: form.stock === '' ? Number.NaN : Number(form.stock),
      assemblyNotes: form.assemblyNotes,
      themeIds: form.themeIds,
      sortOrder: form.sortOrder === '' ? 0 : Number(form.sortOrder),
      active: form.active,
    });

    setErrors(invalid ?? {});
    setFormError(null);
    if (!data) return;

    try {
      if (editing) {
        await updateItem.mutateAsync({ id: editing.id, body: data });
      } else {
        await createItem.mutateAsync(data);
      }

      setFormOpen(false);
      showToast(editing ? 'Item salvo.' : 'Item criado.');
    } catch (error) {
      setErrors(apiFieldErrors(error));
      setFormError(formErrorMessage(error));
    }
  }

  async function confirmRemove() {
    if (!removing) return;

    try {
      const result = await deleteItem.mutateAsync(removing.id);
      setRemoving(null);

      showToast(
        result.outcome === 'deleted'
          ? 'Item excluído.'
          : 'Item desativado: ele já apareceu em reserva ou combo e sai da vitrine, mas continua no histórico.',
      );
    } catch (error) {
      setRemoving(null);
      showToast(formErrorMessage(error) ?? 'Não foi possível excluir.', 'error');
    }
  }

  const total = items.data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const noCategories = categories.data?.length === 0;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>Itens</h1>
          <p className={styles.subtitle}>
            O que o cliente pode levar no pegue e monte. O estoque é por dia: o mesmo item pode sair
            em datas diferentes.
          </p>
        </div>

        <Button variant="primary" onClick={openCreate} disabled={noCategories}>
          <PlusIcon size={20} />
          Novo item
        </Button>
      </header>

      {/* Item exige categoria, então sem categoria a tela diz o que fazer antes. */}
      {noCategories ? (
        <EmptyState
          title="Crie uma categoria primeiro"
          description="Todo item mora numa categoria: Painéis, Mesas, Arcos. Cadastre pelo menos uma para poder criar itens."
          action={
            <Button variant="primary" onClick={() => navigate('/admin/categorias')}>
              Ir para categorias
            </Button>
          }
        />
      ) : null}

      {!noCategories ? (
        <div className={itemStyles.filters}>
          {/* "Filtrar por" e não só "Categoria": diz o que o campo faz, e não
              colide com o rótulo do formulário de item. */}
          <Select
            label="Filtrar por categoria"
            value={categoryFilter}
            onChange={(event) => {
              setCategoryFilter(event.target.value);
              // Trocar de filtro volta para a primeira página: continuar na
              // página 3 de um conjunto menor mostraria lista vazia.
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            {categories.data?.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>

          <Select
            label="Filtrar por estilo"
            value={themeFilter}
            onChange={(event) => {
              setThemeFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {themes.data?.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.name}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      {items.isPending ? <Skeleton rows={6} /> : null}

      {items.isError ? (
        <p className={styles.formError} role="alert">
          {formErrorMessage(items.error)}
        </p>
      ) : null}

      {items.data && items.data.items.length === 0 && !noCategories ? (
        <EmptyState
          title="Nenhum item por aqui"
          description="Cadastre painéis, mesas, arcos e o que mais a chácara empresta. Cada item tem preço, estoque por dia e os estilos a que pertence."
          action={
            <Button variant="primary" onClick={openCreate}>
              Novo item
            </Button>
          }
        />
      ) : null}

      {items.data && items.data.items.length > 0 ? (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className="sr-only">Itens do pegue e monte</caption>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">Foto</span>
                  </th>
                  <th scope="col">Item</th>
                  <th scope="col">Categoria</th>
                  <th scope="col">Estilos</th>
                  <th scope="col" className={styles.numeric}>
                    Preço
                  </th>
                  <th scope="col" className={styles.numeric}>
                    Estoque
                  </th>
                  <th scope="col">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.data.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className={styles.thumb}>
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt="" loading="lazy" decoding="async" />
                        ) : (
                          <ImageIcon size={24} />
                        )}
                      </div>
                    </td>
                    <td>
                      <div className={itemStyles.itemName}>
                        <strong>{item.name}</strong>
                        {item.active ? null : (
                          <span className={[styles.badge, styles.badgeOff].join(' ')}>
                            Desativado
                          </span>
                        )}
                      </div>
                    </td>
                    <td>{item.category.name}</td>
                    <td>
                      {item.themeIds.length > 0 ? (
                        <span className={itemStyles.themeList}>
                          {item.themeIds.map((id) => (
                            <span key={id} className={itemStyles.themeChip}>
                              {themeName(id)}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className={itemStyles.noThemes}>Sem estilo</span>
                      )}
                    </td>
                    <td className={styles.numeric}>
                      <Money cents={item.priceCents} />
                    </td>
                    <td className={styles.numeric}>{item.stock}</td>
                    <td>
                      <div className={styles.actions}>
                        <button
                          type="button"
                          className={styles.iconButton}
                          onClick={() => openEdit(item)}
                          aria-label={`Editar ${item.name}`}
                        >
                          <PencilIcon size={20} />
                        </button>
                        <button
                          type="button"
                          className={[styles.iconButton, styles.iconButtonDanger].join(' ')}
                          onClick={() => setRemoving(item)}
                          aria-label={`Excluir ${item.name}`}
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

          {lastPage > 1 ? (
            <nav className={itemStyles.pagination} aria-label="Páginas de itens">
              <p className={itemStyles.pageInfo}>
                Página {page} de {lastPage}, {total} {total === 1 ? 'item' : 'itens'}
              </p>

              <div className={itemStyles.pageButtons}>
                <Button onClick={() => setPage((current) => current - 1)} disabled={page <= 1}>
                  Anterior
                </Button>
                <Button
                  onClick={() => setPage((current) => current + 1)}
                  disabled={page >= lastPage}
                >
                  Próxima
                </Button>
              </div>
            </nav>
          ) : null}
        </>
      ) : null}

      <Dialog
        open={formOpen}
        title={editing ? 'Editar item' : 'Novo item'}
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

          <Select
            label="Categoria"
            value={form.categoryId}
            onChange={(event) => setForm({ ...form, categoryId: event.target.value })}
            error={errors.categoryId}
          >
            {categories.data?.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>

          <div className={styles.formRow}>
            <MoneyField
              label="Preço"
              valueCents={form.priceCents}
              onChangeCents={(cents) => setForm({ ...form, priceCents: cents })}
              error={errors.priceCents}
              help="Cobrado uma vez pelo período."
            />

            <Field
              label="Estoque"
              type="number"
              min={0}
              value={form.stock}
              onChange={(event) => setForm({ ...form, stock: event.target.value })}
              error={errors.stock}
              help="Unidades disponíveis por dia."
            />
          </div>

          <Textarea
            label="Descrição"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            error={errors.description}
          />

          <Textarea
            label="Dica de montagem"
            value={form.assemblyNotes}
            onChange={(event) => setForm({ ...form, assemblyNotes: event.target.value })}
            error={errors.assemblyNotes}
            help="Como o cliente monta sozinho. Ex.: Fixe com fita dupla face nos cantos."
          />

          <Field
            label="Endereço da imagem"
            value={form.imageUrl}
            onChange={(event) => setForm({ ...form, imageUrl: event.target.value })}
            error={errors.imageUrl}
            help="Começando com https:// ou /."
            autoComplete="off"
            inputMode="url"
          />

          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>Estilos</legend>

            {errors.themeIds ? (
              <span className={styles.formError} role="alert">
                {errors.themeIds}
              </span>
            ) : null}

            {themes.data?.length === 0 ? (
              <p className={itemStyles.noThemes}>
                Nenhum estilo cadastrado. O item funciona sem estilo, mas não aparece nos filtros da
                vitrine.
              </p>
            ) : (
              <ul className={itemStyles.themePicker}>
                {themes.data?.map((theme) => (
                  <li key={theme.id} className={styles.checkRow}>
                    <input
                      id={`theme-${theme.id}`}
                      type="checkbox"
                      checked={form.themeIds.includes(theme.id)}
                      onChange={() => toggleTheme(theme.id)}
                    />
                    <label htmlFor={`theme-${theme.id}`}>{theme.name}</label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

          <div className={styles.formRow}>
            <Field
              label="Ordem"
              type="number"
              min={0}
              value={form.sortOrder}
              onChange={(event) => setForm({ ...form, sortOrder: event.target.value })}
              error={errors.sortOrder}
              help="Menor aparece primeiro."
            />

            <div className={styles.checkRow}>
              <input
                id="item-active"
                type="checkbox"
                checked={form.active}
                onChange={(event) => setForm({ ...form, active: event.target.checked })}
              />
              <label htmlFor="item-active">Aparece na vitrine</label>
            </div>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={removing !== null}
        title="Excluir item"
        message={`O item "${removing?.name}" sai da vitrine.`}
        detail="Se ele já apareceu em alguma reserva ou está em um combo, em vez de excluir a gente desativa: a reserva antiga precisa continuar mostrando o que o cliente levou."
        confirmLabel="Excluir item"
        loading={deleteItem.isPending}
        onConfirm={confirmRemove}
        onClose={() => setRemoving(null)}
      />
    </div>
  );
}
